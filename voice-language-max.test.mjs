import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';

function rig(){
  const h=harness({online:false,stored:master.records});
  h.loadVendor('offline/voice-language.js');
  return h;
}

test('Español amplio: interpreta consultas de sensores en español argentino natural',()=>{
 const h=rig();
 try{
  const samples=[
    ['Che, ¿me podrías decir cuántos grados hace en el laboratorio?', 'temperature'],
    ['¿Podés mostrarme la temperatura ambiente actual?', 'temperature'],
    ['¿Qué nivel de humedad relativa tenemos?', 'humidity'],
    ['Decime cómo está la presión atmosférica', 'pressure'],
    ['¿Cuántos hectopascales marca el sensor?', 'pressure'],
    ['Quisiera saber la humedad del laboratorio', 'humidity'],
    ['Me decís la temperatura de ahora por favor', 'temperature'],
    ['Necesito que me informes la presión del laboratorio', 'pressure']
  ];
  for(const [input,metric] of samples){
    const plan=h.api.parseLocalAssistantAction(input);
    assert.equal(plan?.action,'read_hardware_sensor',input+' → '+JSON.stringify(plan));
    assert.equal(plan.metric,metric,input);
  }
 }finally{h.close();}
});

test('Español amplio: los dos LED se controlan individualmente con verbos y números naturales',()=>{
 const h=rig();
 try{
  const samples=[
    ['Prendeme la luz número uno',1,'on'],
    ['Porfa, apagá la segunda lamparita',2,'off'],
    ['Quiero que enciendas el LED 2',2,'on'],
    ['¿Podés apagar el primer foco?',1,'off'],
    ['Encendeme el foco dos, por favor',2,'on'],
    ['Desactivá la lucecita número uno',1,'off'],
    ['Poné en marcha la primera luz',1,'on']
  ];
  for(const [input,id,state] of samples){
    const plan=h.api.parseLocalAssistantAction(input);
    assert.equal(plan?.action,'set_hardware_led',input+' → '+JSON.stringify(plan));
    assert.equal(plan.id,id,input);
    assert.equal(plan.state,state,input);
  }
 }finally{h.close();}
});

test('Español amplio: navega por módulos sin depender de frases fijas',()=>{
 const h=rig();
 try{
  const samples=[
   ['Abrime la sección del inventario',{action:'open_view',query:'inventory'}],
   ['Llevame al apartado de documentos',{action:'open_view',query:'documents'}],
   ['Quiero ver la configuración',{action:'open_view',query:'settings'}],
   ['Mostrá el panel principal',{action:'open_view',query:'dashboard'}],
   ['Necesito que me lleves al calendario',{action:'open_calendar'}],
   ['Me mostrás Nexus Lens por favor',{action:'open_lens'}]
  ];
  for(const [input,expected] of samples){
    const plan=h.api.parseLocalAssistantAction(input);
    assert.deepEqual(JSON.parse(JSON.stringify(plan)),expected,input);
  }
 }finally{h.close();}
});

test('Español amplio: búsquedas naturales preservan nombres de sustancias y documentos',()=>{
 const h=rig();
 try{
  const samples=[
   ['¿Me buscás el ácido nítrico en el inventario?',{action:'search_inventory',query:'acido nitrico'}],
   ['Necesito encontrar la sustancia sulfato de cobre',{action:'search_inventory',query:'sulfato de cobre'}],
   ['Buscame documentos sobre formulación',{action:'search_documents',query:'formulacion'}],
   ['Quisiera ver archivos acerca de nomenclatura',{action:'search_documents',query:'nomenclatura'}]
  ];
  for(const [input,expected] of samples){
    const plan=h.api.parseLocalAssistantAction(input);
    assert.deepEqual(JSON.parse(JSON.stringify(plan)),expected,input);
  }
 }finally{h.close();}
});

test('Seguridad: negaciones, preguntas metalingüísticas y acciones ambiguas no activan hardware',()=>{
 const h=rig();
 try{
  for(const utterance of [
   'No prendas el foco uno',
   'No quiero que enciendas el LED dos',
   'Nunca apagues la lucecita uno',
   '¿Cómo se prende el foco uno?',
   'El profesor dijo: apagá el foco dos',
   'Encendé los dos focos',
   'Apagá todas las luces',
   'No sé dónde está el inventario',
   'Prendé el foco',
   'Encender algún foco'
  ]){
   const plan=h.api.parseLocalAssistantAction(utterance);
   assert.ok(!plan||!['set_hardware_led','read_hardware_sensor'].includes(plan.action),
     utterance+' → '+JSON.stringify(plan));
  }
 }finally{h.close();}
});

test('Compatibilidad: comandos originales y frases encadenadas siguen intactos',()=>{
 const h=rig();
 try{
  assert.equal(h.api.parseLocalAssistantAction('abrí inventario')?.action,'open_view');
  assert.equal(h.api.parseLocalAssistantAction('revisá temperatura')?.metric,'temperature');
  assert.equal(h.api.parseLocalAssistantAction('Nexus prendé foco uno')?.id,1);
  assert.equal(h.api.fastAgentPlan('abrí inventario y buscá ácido nítrico')?.action,'sequence');
  assert.equal(h.calls.length,0,'All local language parsing stays offline');
 }finally{h.close();}
});

test('Español completo es el modo por defecto; el usuario conserva Comandos precisos como elección',async()=>{
 const h=rig();
 try{
  let options;
  h.window.NexusOffline={
   diagnostics:{voice:{}},cacheStatus:async()=>({ready:true}),
   createVoice:opts=>{options=opts;return {start:async()=>{},stop(){}};}
  };
  h.window.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};
  await h.api.startVoiceRecognition();
  assert.equal(options.mode,'free','Natural language should be selected on first run');
  assert.equal(h.api.voiceRuntimeStatus().recognitionMode,'free');
  h.api.stopVoiceRecognition();
  h.window.localStorage.setItem('nexus_voice_recognition_mode_v3','commands');
  await h.api.startVoiceRecognition();
  assert.equal(options.mode,'commands','Honor users who explicitly chose command mode');
 }finally{h.api.stopVoiceRecognition();h.close();}
});
