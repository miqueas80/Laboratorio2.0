import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';

function rig(){
  const h=harness({online:false,stored:master.records});
  let callbacks,stops=0;
  h.window.NexusOffline={
    diagnostics:{voice:{}},cacheStatus:async()=>({ready:true}),
    createVoice:opts=>{
      callbacks=opts;
      return {start:async()=>opts.onStatus({state:'Vosk listo'}),stop:()=>stops++};
    }
  };
  h.window.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};
  h.api.bind();
  return {h,get callbacks(){return callbacks},get stops(){return stops}};
}

test('guided voice calibration never executes a hardware command or any assistant action',async()=>{
 const r=rig(),h=r.h;
 try{
   await h.api.loadMaster();
   const button=h.document.querySelector('#voiceCalibrationButton');
   assert.ok(button);
   button.click();
   await new Promise(resolve=>setTimeout(resolve,25));
   assert.match(h.document.querySelector('#voiceCalibrationPrompt').textContent,/nexus/i);
   const phrases=['nexus abre inventario','nexus revisa temperatura','nexus prende foco uno','nexus apaga foco dos','nexus abre documentos'];
   for(const text of phrases)await r.callbacks.onTranscript(text,{confidence:.78});
   assert.equal(h.api.state.view,'dashboard');
   assert.equal(r.stops,1,'Microphone must stop after the guided test ends');
   assert.match(h.document.querySelector('#voiceCalibrationSummary').textContent,/0\s*%/,'Exact phrases should have WER 0%');
   assert.equal(h.calls.length,0);
   assert.equal(h.window.localStorage.getItem('nexus_voice_calibration_v3'),null);
 }finally{h.api.stopVoiceRecognition();h.close();}
});

test('guided test measures transcription errors and does not reinterpret a missed wake word as a command',async()=>{
 const r=rig(),h=r.h;
 try{
   r.h.document.querySelector('#voiceCalibrationButton').click();
   await new Promise(resolve=>setTimeout(resolve,25));
   await r.callbacks.onTranscript('abre inventario',{confidence:.4});
   const report=h.document.querySelector('#voiceCalibrationSummary').textContent;
   assert.match(report,/error/i);
   assert.match(h.document.querySelector('#voiceCalibrationPrompt').textContent,/revisa temperatura/i);
   assert.equal(h.api.state.view,'dashboard');
 }finally{h.api.stopVoiceRecognition();h.close();}
});

test('canceling calibration stops microphone and leaves no armed hardware action',async()=>{
 const r=rig(),h=r.h;
 try{
   const btn=h.document.querySelector('#voiceCalibrationButton');
   btn.click();
   await new Promise(resolve=>setTimeout(resolve,25));
   btn.click();
   assert.equal(r.stops,1);
   assert.match(h.document.querySelector('#voiceCalibrationSummary').textContent,/cancelada/i);
 }finally{h.api.stopVoiceRecognition();h.close();}
});
