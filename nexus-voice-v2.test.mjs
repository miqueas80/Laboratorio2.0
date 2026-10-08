import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';

function fakeLocal(h){
 let starts=0,stops=0,callbacks;
 h.window.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};
 h.window.NexusOffline={
  diagnostics:{voice:{}},nativeVoice:async()=>null,cacheStatus:async()=>({ready:true}),
  createVoice:opts=>{callbacks=opts;return {start:async()=>{starts++;},stop(){stops++}}}
 };
 return {get callbacks(){return callbacks},get starts(){return starts},get stops(){return stops}};
}

test('acciones por contexto: QR, Lens y aclaración segura fuera de módulos',async()=>{
 const h=harness({stored:master.records,online:false});
 try{
  await h.api.loadMaster();
  h.api.state.view='lens';
  assert.equal(h.api.fastAgentPlan('Nexus, prendé la cámara').action,'start_lens_camera');
  assert.equal(h.api.fastAgentPlan('Nexus, apagá la cámara').action,'stop_lens_camera');
  h.api.state.view='qr';
  assert.equal(h.api.fastAgentPlan('Nexus, activá la cámara').action,'start_camera');
  h.api.state.view='inventory';
  assert.deepEqual({...h.api.fastAgentPlan('Nexus buscá ácido nítrico')},{action:'search_inventory',query:'acido nitrico'});
  h.api.state.view='dashboard';
  const r=h.api.resolveIntent('Nexus, iniciá la cámara');
  assert.equal(r.kind,'LOCAL');assert.match(r.clarification,/Lens/);
  const out=await h.api.nexusAgentTurn('Nexus, iniciá la cámara');
  assert.match(out.answer,/QR/);assert.equal(out.actions.length,0);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('NEXUS IA entrega evidencia local, y seguridad química no espera ni consulta Internet',async()=>{
 const h=harness({stored:master.records,online:false,fetcher:()=>{throw Error('No debe consultar la red')}});
 try{
  await h.api.loadMaster();
  const out=await h.api.nexusAgentTurn('Nexus, qué es ácido nítrico');
  assert.equal(out.route,'LOCAL');assert.match(out.answer,/inventario local|documento local/i);
  const safety=await h.api.nexusAgentTurn('Nexus, qué pasa si se me derrama ácido en la mano');
  assert.equal(safety.route,'SEGURIDAD_LOCAL');assert.match(safety.answer,/agua corriente|agua abundante/i);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('pregunta científica online no incluye búsquedas web ajenas; usa xKiro',async()=>{
 const requests=[];const h=harness({stored:master.records,online:true,fetcher:(url,opts)=>{
  requests.push(String(url));
  if(String(url).endsWith('/models'))return Response.json({data:[{id:'mistralai/ministral-14b',access_tier:'free',capabilities:{}}]});
  if(String(url).endsWith('/chat/completions'))return Response.json({choices:[{message:{content:'Un átomo tiene un núcleo y electrones.'}}]});
  throw new Error('Búsqueda web inesperada: '+url);
 }});
 try{
  await h.api.loadMaster();h.api.state.web=true;
  const r=await h.api.nexusAgentTurn('Nexus, explicame qué es un átomo');
  assert.equal(r.route,'EXTERNO');assert.match(r.answer,/Un átomo tiene un núcleo/);
  assert.equal(requests.length,2);assert.equal(requests.filter(x=>x.includes('google')||x.includes('duckduckgo')).length,0);
 }finally{h.close()}
});

test('voz offline usa Vosk incluso con red si el interruptor de Internet está apagado',async()=>{
 const h=harness({online:true});try{
  const local=fakeLocal(h);let remoteStarts=0;
  h.window.SpeechRecognition=class{start(){remoteStarts++}};
  assert.equal(await h.api.startVoiceRecognition(),true);
  assert.equal(local.starts,1);assert.equal(remoteStarts,0);
  assert.equal(h.api.voiceRuntimeStatus().engine,'offline');
 }finally{h.api.stopVoiceRecognition();h.close()}
});

test('voz online selecciona motor de navegador cuando Internet está habilitado',async()=>{
 const h=harness({online:true});try{
  const local=fakeLocal(h);let remoteStarts=0;
  h.window.SpeechRecognition=class{start(){remoteStarts++;this.onstart?.()}abort(){}stop(){}};
  h.api.state.web=true;
  assert.equal(await h.api.startVoiceRecognition(),true);
  assert.equal(remoteStarts,1);assert.equal(local.starts,0);
  assert.equal(h.api.voiceRuntimeStatus().engine,'online');
 }finally{h.api.stopVoiceRecognition();h.close()}
});

test('ASR prioriza la transcripción de mayor confianza, o la primera si no hay confianza',()=>{
 const h=harness({online:true});try{
  const alts={0:{transcript:'Nexus explicame qué es la luz',confidence:.91},1:{transcript:'Nexus abrí inventario',confidence:.44},length:2};
  assert.match(h.api.chooseVoiceTranscript(alts),/explicame/);
  assert.equal(h.api.chooseVoiceTranscript({0:{transcript:'Nexus explicame esto'},1:{transcript:'Nexus abrí inventario'},length:2}),'Nexus explicame esto');
 }finally{h.close()}
});

test('motor offline→online cambia entre sesiones y descarta transcripciones viejas',async()=>{
 const h=harness({online:true});try{
  const local=fakeLocal(h);let remoteStarts=0;
  h.window.SpeechRecognition=class{start(){remoteStarts++;this.onstart?.()}abort(){}stop(){}};
  await h.api.loadMaster();
  assert.equal(await h.api.startVoiceRecognition(),true);
  const old=local.callbacks;assert.equal(h.api.voiceRuntimeStatus().engine,'offline');
  h.api.state.web=true;h.api.scheduleVoiceEngineAlignment();
  await new Promise(resolve=>setTimeout(resolve,1450));
  assert.equal(h.api.voiceRuntimeStatus().engine,'online');
  assert.equal(remoteStarts,1);assert.equal(local.stops,1);
  await old.onTranscript('Nexus abrí inventario');
  assert.equal(h.api.state.view,'dashboard');
 }finally{h.api.stopVoiceRecognition();h.close()}
});

test('comandos de voz finales repetidos no ejecutan dos veces la misma orden',async()=>{
 const h=harness({stored:master.records,online:false});try{
  await h.api.loadMaster();const local=fakeLocal(h);
  await h.api.startVoiceRecognition();
  await local.callbacks.onTranscript('Nexus abrí inventario');
  const count=h.api.state.agentHistory.length;
  await local.callbacks.onTranscript('Nexus abrí inventario');
  assert.equal(h.api.state.agentHistory.length,count);
  assert.equal(h.api.state.view,'inventory');
 }finally{h.api.stopVoiceRecognition();h.close()}
});
