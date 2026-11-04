import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';

function microphone(h){
 let options,callbacks,starts=0,stops=0;
 h.window.NexusOffline={
   diagnostics:{voice:{}},
   cacheStatus:async()=>({ready:true}),
   createVoice:opts=>{
     options=opts;
     callbacks=opts;
     return {start:async()=>{starts++;opts.onStatus({state:'Vosk listo'});},stop:()=>stops++};
   }
 };
 h.window.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};
 return {get callbacks(){return callbacks},get options(){return options},get starts(){return starts},get stops(){return stops}};
}

test('reliability: unexpected mention of Nexus in background is never treated as wake word',async()=>{
 const h=harness({stored:master.records,online:false});
 try{
   await h.api.loadMaster();
   const mic=microphone(h);
   assert.equal(await h.api.startVoiceRecognition(),true);
   await mic.callbacks.onTranscript('No Nexus abrí inventario');
   assert.equal(h.api.state.view,'dashboard');
   await mic.callbacks.onTranscript('El profesor dijo Nexus abrí inventario');
   assert.equal(h.api.state.view,'dashboard');
   await mic.callbacks.onTranscript('Nexus abrí inventario');
   assert.equal(h.api.state.view,'inventory');
   assert.equal(h.calls.length,0);
 }finally{h.api.stopVoiceRecognition();h.close();}
});

test('reliability: accepts clear Spanish wake variants and two-turn commands',async()=>{
 const h=harness({stored:master.records,online:false});
 try{
   await h.api.loadMaster();
   const mic=microphone(h);
   await h.api.startVoiceRecognition();
   await mic.callbacks.onTranscript('Hola Nexos abrí inventario');
   assert.equal(h.api.state.view,'inventory');
   await mic.callbacks.onTranscript('Nexus');
   await mic.callbacks.onTranscript('abrí documentos');
   assert.equal(h.api.state.view,'documents');
 }finally{h.api.stopVoiceRecognition();h.close();}
});

test('diagnostic: interim/final transcript and acoustic confidence remain on-screen, never persisted',async()=>{
 const h=harness({online:false});
 try{
   const mic=microphone(h);
   await h.api.startVoiceRecognition();
   mic.callbacks.onPartial('nexos revisar');
   assert.match(h.document.querySelector('#voicePartialText').textContent,/nexos revisar/i);
   await mic.callbacks.onTranscript('Nexus revisá temperatura',{confidence:.73,words:3});
   const status=h.api.voiceRuntimeStatus();
   assert.equal(status.confidence,.73);
   assert.match(h.document.querySelector('#voiceQualityText').textContent,/73\s*%/);
   assert.equal(h.window.localStorage.getItem('nexus_voice_transcripts_v3'),null);
 }finally{h.api.stopVoiceRecognition();h.close();}
});

test('settings: natural Spanish recognition mode is opt-in, persists, and safely restarts capture',async()=>{
 const h=harness({online:false});
 try{
   const mic=microphone(h);
   h.api.bind(); // production wires selector through initVoice(); harness skips boot by design
   assert.equal(await h.api.startVoiceRecognition(),true);
   assert.equal(mic.options.mode,'commands','Existing command recognition remains default');
   const selector=h.document.querySelector('#voiceRecognitionMode');
   selector.value='free';selector.dispatchEvent(new h.window.Event('change'));
   assert.equal(mic.stops,1,'Recognizer must stop rather than switch underneath an active session');
   assert.equal(h.window.localStorage.getItem('nexus_voice_recognition_mode_v3'),'free');
   assert.equal(await h.api.startVoiceRecognition(),true);
   assert.equal(mic.options.mode,'free');
   assert.equal(h.api.voiceRuntimeStatus().recognitionMode,'free');
   assert.equal(h.calls.length,0,'ASR never accesses a cloud service');
 }finally{h.api.stopVoiceRecognition();h.close();}
});

test('settings: unrecognized stored mode is ignored, and commands mode can be restored',async()=>{
 const h=harness({online:false});
 try{
   h.window.localStorage.setItem('nexus_voice_recognition_mode_v3','cloud');
   const mic=microphone(h);
   h.api.bind();
   await h.api.startVoiceRecognition();
   assert.equal(mic.options.mode,'commands');
   const selector=h.document.querySelector('#voiceRecognitionMode');
   selector.value='commands';selector.dispatchEvent(new h.window.Event('change'));
   assert.equal(h.window.localStorage.getItem('nexus_voice_recognition_mode_v3'),'commands');
 }finally{h.api.stopVoiceRecognition();h.close();}
});
