import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';
function engine(h,{native=false,cached=true}={}){
 let callbacks,starts=0,stops=0;
 h.window.NexusOffline={diagnostics:{voice:{}},nativeVoice:async()=>native?{lang:'es-AR'}:null,cacheStatus:async()=>({ready:cached}),createVoice:options=>{callbacks=options;return {start:async()=>{starts++;options.onStatus({state:'Fallback local activo'});},stop:()=>stops++};}};
 h.window.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};
 return {get callbacks(){return callbacks},get starts(){return starts},get stops(){return stops}};
}
test('voz: estados nativo, WASM preparado y modelo ausente sin recurrir a servicio de red',async()=>{
 const h=harness();try{engine(h,{native:true});assert.equal(await h.api.refreshLocalVoiceStatus(),'available');engine(h);assert.equal(await h.api.refreshLocalVoiceStatus(),'wasm-ready');engine(h,{cached:false});assert.equal(await h.api.refreshLocalVoiceStatus(),'unavailable');assert.match(h.document.querySelector('#localVoiceStatus').textContent,/Modelo no disponible/);assert.equal(h.calls.length,0);}finally{h.close();}
});
test('voz: wake word, transcript, agente, inventario, búsqueda, documentos, Lens y parada offline',async()=>{
 const h=harness({stored:master.records,online:false});try{
  await h.api.loadMaster();const e=engine(h);assert.equal(await h.api.startVoiceRecognition(),true);
  await e.callbacks.onTranscript('abrí inventario');assert.equal(h.api.state.view,'dashboard');
  await e.callbacks.onTranscript('Nexus, abrí inventario y buscá ácido nítrico');assert.equal(h.api.state.view,'inventory');assert.match(h.document.querySelector('#inventorySearch').value,/n[ií]trico/i);
  await e.callbacks.onTranscript('Nexus abrí documentos');assert.equal(h.api.state.view,'documents');
  await e.callbacks.onTranscript('Nexus abrí Lens');assert.equal(h.api.state.view,'lens');
  h.api.stopVoiceRecognition();assert.equal(e.stops,1);await e.callbacks.onTranscript('Nexus abrí inventario');assert.equal(h.api.state.view,'lens');
  assert.equal(await h.api.startVoiceRecognition(),true);assert.equal(e.starts,2);assert.equal(h.api.state.inventory.length,111);assert.equal(h.calls.length,0);
 }finally{h.api.stopVoiceRecognition();h.close();}
});
test('voz: TTS elige español local y nunca usa una voz cloud como fallback',()=>{
 const h=harness();try{
  const voices=[{name:'cloud AR',lang:'es-AR',localService:false},{name:'local ES',lang:'es-ES',localService:true},{name:'local AR',lang:'es-AR',localService:true}];
  assert.equal(h.api.selectLocalSpanishVoice(voices).name,'local AR');assert.equal(h.api.selectLocalSpanishVoice(voices.slice(0,1)),null);
  let said;h.window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};h.window.speechSynthesis={getVoices:()=>voices,cancel(){},speak:u=>said=u};
  assert.equal(h.api.speakText('Nexus está listo'),true);assert.equal(said.voice.localService,true);assert.doesNotMatch(said.text,/Nexus/i);
 }finally{h.close();}
});
test('voz: Nexus interrumpe TTS local y acepta la orden siguiente sin ejecutar su propio eco',async()=>{
 const h=harness({stored:master.records,online:false});try{
  await h.api.loadMaster();const e=engine(h);await h.api.startVoiceRecognition();let cancelled=0;
  h.window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  h.window.speechSynthesis={getVoices:()=>[{lang:'es-AR',localService:true}],cancel(){cancelled++;},speak(){}};
  assert.equal(h.api.speakText('El sistema está listo'),true);const before=cancelled;
  await e.callbacks.onTranscript('El sistema está listo');assert.equal(cancelled,before);assert.equal(h.api.state.view,'dashboard');
  e.callbacks.onPartial('Nexus');assert.equal(cancelled,before+1);assert.match(h.document.querySelector('#voiceStatusText').textContent,/interrumpido/);
  await e.callbacks.onTranscript('abrí inventario');assert.equal(h.api.state.view,'inventory');assert.equal(h.calls.length,0);
 }finally{h.api.stopVoiceRecognition();h.close();}
});
