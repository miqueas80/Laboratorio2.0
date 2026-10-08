import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';
function offlineEngine(h){let callbacks,starts=0,opts=[];h.window.NexusOffline={diagnostics:{voice:{}},nativeVoice:async()=>null,cacheStatus:async()=>({ready:true}),createVoice:o=>{callbacks=o;return {start:async options=>{starts++;opts.push(options||{});o.onStatus({state:'Fallback local activo'})},stop(){}}}};h.window.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};return {get callbacks(){return callbacks},get starts(){return starts},get opts(){return opts}}}
function speech(h,voices=[{name:'local AR',lang:'es-AR',localService:true}]){let last,count=0;h.window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};h.window.speechSynthesis={getVoices:()=>voices,cancel(){},speak:u=>{last=u;count++}};return {get last(){return last},get count(){return count}}}

test('r31 final: online restaura SpeechRecognition del navegador y no arranca Vosk primero',async()=>{const h=harness({stored:master.records,online:true});try{await h.api.loadMaster();h.api.state.web=true;const off=offlineEngine(h);let rec;h.window.SpeechRecognition=class{constructor(){rec=this}start(){this.onstart?.()}abort(){}stop(){}};assert.equal(await h.api.startVoiceRecognition(),true);assert.equal(off.starts,0);assert.equal(rec.lang,'es-AR');assert.equal(rec.continuous,true);assert.equal(rec.maxAlternatives,5);assert.match(h.document.querySelector('#voiceStatusText').textContent,/online activa/i)}finally{h.api.stopVoiceRecognition();h.close()}});

test('r31 final: sin red usa motor local/Vosk y no SpeechRecognition online',async()=>{const h=harness({stored:master.records,online:false});try{await h.api.loadMaster();const off=offlineEngine(h);let made=0;h.window.SpeechRecognition=class{constructor(){made++}};assert.equal(await h.api.startVoiceRecognition(),true);assert.equal(made,0);assert.equal(off.starts,1);assert.match(h.document.querySelector('#voiceStatusText').textContent,/offline activa/i)}finally{h.api.stopVoiceRecognition();h.close()}});

test('r31 final: TTS online acepta voz española remota y offline nunca la asigna explícitamente',()=>{let h=harness({online:true});try{let s=speech(h,[{name:'cloud AR',lang:'es-AR',localService:false}]);assert.equal(h.api.speakText('LOCAL · Listo. Abrí el inventario.'),true);assert.equal(s.last.voice.localService,false);assert.doesNotMatch(s.last.text,/LOCAL\s*·/)}finally{h.close()}h=harness({online:false});try{let s=speech(h,[{name:'cloud AR',lang:'es-AR',localService:false}]);assert.equal(h.api.speakText('Listo'),true);assert.equal(s.last.voice,undefined);assert.equal(s.last.lang,'es-AR')}finally{h.close()}});

test('r31 final: calendario natural directo funciona sin tocar parser histórico',async()=>{const h=harness({stored:master.records,online:false});try{await h.api.loadMaster();const a=h.api.fastAgentPlan('Nexus, recordame el 2026-10-09 revisar el inventario');assert.equal(a.action,'create_calendar_event');assert.equal(a.date,'2026-10-09');assert.match(a.text,/revisar el inventario/);const out=await h.api.executeAssistantAction(a,{speak:false});assert.equal(out.ok,true);assert.equal(h.api.calendarEvents().length,1)}finally{h.close()}});

test('r31 final: calendario multiturno pregunta, escucha sin wake word y confirma hablando',async()=>{const h=harness({stored:master.records,online:false});try{await h.api.loadMaster();const off=offlineEngine(h),sp=speech(h);await h.api.startVoiceRecognition();await off.callbacks.onTranscript('Nexus agregá una tarea');assert.match(sp.last.text,/qué tarea/i);sp.last.onend?.();await off.callbacks.onTranscript('preparar reactivos');assert.match(sp.last.text,/qué día|para qué día/i);sp.last.onend?.();await off.callbacks.onTranscript('mañana');assert.equal(h.api.calendarEvents().length,1);assert.match(h.api.calendarEvents()[0].text,/preparar reactivos/i);assert.match(sp.last.text,/agend/i)}finally{h.api.stopVoiceRecognition();h.close()}});

test('r31 final: fecha relativa determinista',()=>{const h=harness({online:false});try{const now=new Date(2026,9,7,12);assert.equal(h.api.resolveNaturalCalendarDate('mañana',now),'2026-10-08');assert.equal(h.api.resolveNaturalCalendarDate('el viernes',now),'2026-10-09');assert.equal(h.api.resolveNaturalCalendarDate('9 de octubre',now),'2026-10-09')}finally{h.close()}});


test('r31.1: Internet no desactiva calendario local ni dispara red para recordatorios',async()=>{
 const h=harness({stored:master.records,online:true});try{
  await h.api.loadMaster();h.api.state.web=true;const before=h.calls.length;
  const route=h.api.resolveIntent('Nexus, recordame hoy revisar el inventario');
  assert.equal(route.kind,'LOCAL');assert.equal(route.local.action,'create_calendar_event');
  const out=await h.api.nexusAgentTurn('Nexus, recordame hoy revisar el inventario');
  assert.equal(out.actions[0].result.ok,true);assert.equal(h.api.calendarEvents().length,1);assert.equal(h.calls.length,before);
 }finally{h.close()}
});

test('voice v2: ASR online prioriza confianza acústica sobre coincidencias con comandos locales',()=>{
 const h=harness({stored:master.records,online:true});try{
  const result={0:{transcript:'Nexus explicame cualquier cosa',confidence:.92},1:{transcript:'Nexo recordame mañana revisar el inventario',confidence:.71},length:2};
  const chosen=h.api.chooseVoiceTranscript(result);assert.match(chosen,/explicame/i);assert.match(chosen,/Nexus/i);
 }finally{h.close()}
});
