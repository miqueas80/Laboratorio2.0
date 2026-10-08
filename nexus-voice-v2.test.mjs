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

test('voz online usa Vosk local aunque Chrome ofrezca SpeechRecognition',async()=>{
 const h=harness({online:true});try{
  const local=fakeLocal(h);let remoteStarts=0,remoteConstructors=0;
  h.window.SpeechRecognition=class{constructor(){remoteConstructors++}start(){remoteStarts++}};
  h.api.state.web=true;
  assert.equal(await h.api.startVoiceRecognition(),true);
  assert.equal(remoteStarts,0);assert.equal(remoteConstructors,0);
  assert.equal(local.starts,1);
  assert.equal(h.api.voiceRuntimeStatus().engine,'offline');
  assert.equal(h.api.voiceRuntimeStatus().externalResponses,'text-only');
 }finally{h.api.stopVoiceRecognition();h.close()}
});

test('ASR prioriza la transcripción de mayor confianza, o la primera si no hay confianza',()=>{
 const h=harness({online:true});try{
  const alts={0:{transcript:'Nexus explicame qué es la luz',confidence:.91},1:{transcript:'Nexus abrí inventario',confidence:.44},length:2};
  assert.match(h.api.chooseVoiceTranscript(alts),/explicame/);
  assert.equal(h.api.chooseVoiceTranscript({0:{transcript:'Nexus explicame esto'},1:{transcript:'Nexus abrí inventario'},length:2}),'Nexus explicame esto');
 }finally{h.close()}
});

test('al activar Internet Vosk no se reinicia, mantiene la misma sesión y ejecuta órdenes',async()=>{
 const h=harness({online:true,stored:master.records});try{
  const local=fakeLocal(h);let remoteStarts=0;
  h.window.SpeechRecognition=class{start(){remoteStarts++}};
  await h.api.loadMaster();await h.api.startVoiceRecognition();
  const callbacks=local.callbacks;assert.equal(local.starts,1);
  h.api.state.web=true;h.api.scheduleVoiceEngineAlignment();
  assert.equal(h.api.voiceRuntimeStatus().externalResponses,'text-only');
  await callbacks.onTranscript('Nexus abrí inventario');
  assert.equal(h.api.state.view,'inventory');
  assert.equal(local.starts,1);assert.equal(local.stops,0);assert.equal(remoteStarts,0);
  assert.equal(h.api.voiceRuntimeStatus().engine,'offline');
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

test('al apagar Internet Vosk sigue activo sin micrófono remoto ni reinicio',async()=>{
 const h=harness({online:true,stored:master.records});try{
  const local=fakeLocal(h);let remoteStarts=0;
  h.window.SpeechRecognition=class{start(){remoteStarts++}};
  await h.api.loadMaster();h.api.state.web=true;
  await h.api.startVoiceRecognition();const callbacks=local.callbacks;
  assert.equal(h.api.voiceRuntimeStatus().externalResponses,'text-only');
  h.api.state.web=false;h.api.scheduleVoiceEngineAlignment();
  assert.equal(h.api.voiceRuntimeStatus().externalResponses,'text-only');
  await callbacks.onTranscript('Nexus abrí documentos');
  assert.equal(h.api.state.view,'documents');
  assert.equal(local.starts,1);assert.equal(local.stops,0);assert.equal(remoteStarts,0);
  assert.equal(h.api.voiceRuntimeStatus().engine,'offline');
 }finally{h.api.stopVoiceRecognition();h.close()}
});

test('al desactivar Internet no se solicita información externa con palabras de actualidad',()=>{
 const h=harness({online:false});try{
  const route=h.api.resolveIntent('Nexus, información de actualidad sobre átomos');
  assert.equal(route.kind,'LOCAL');assert.equal(route.local,null);
 }finally{h.close()}
});

test('voz exclusivamente local: no llama a xKiro; el chat escrito sí puede consultarlo',async()=>{
 const requests=[];
 const h=harness({online:true,stored:master.records,fetcher:(url)=>{
  requests.push(String(url));
  if(String(url).endsWith('/models'))return Response.json({data:[{id:'mistralai/ministral-14b',access_tier:'free',capabilities:{}}]});
  if(String(url).endsWith('/chat/completions'))return Response.json({choices:[{message:{content:'Los átomos contienen protones, neutrones y electrones.'}}]});
  throw Error('Unexpected '+url);
 }});
 try{
  await h.api.loadMaster();const local=fakeLocal(h);
  h.api.state.web=true;assert.equal(await h.api.startVoiceRecognition(),true);
  await local.callbacks.onTranscript('Nexus explicame que es un atomo');
  assert.equal(requests.length,0,'voz no debe enviar audio ni transcripción a proveedor externo');
  assert.match(h.api.state.agentHistory.at(-1).text,/no encontré evidencia local suficiente/i);
  assert.equal(h.api.voiceRuntimeStatus().externalResponses,'text-only');
  const chat=await h.api.nexusAgentTurn('Nexus explicame que es un atomo');
  assert.equal(chat.route,'EXTERNO');
  assert.match(chat.answer,/átomos contienen/i);
  assert.ok(requests.some(url=>url.endsWith('/chat/completions')));
 }finally{h.api.stopVoiceRecognition();h.close()}
});

test('comprensión offline ampliada de órdenes naturales en español argentino',async()=>{
 const h=harness({online:false,stored:master.records});try{
  await h.api.loadMaster();
  assert.deepEqual({...h.api.fastAgentPlan('Nexus, llevame al inventario')},{action:'open_view',query:'inventory'});
  assert.deepEqual({...h.api.fastAgentPlan('Nexus, poneme documentos')},{action:'open_view',query:'documents'});
  assert.equal(h.api.fastAgentPlan('Nexus, prendé la cámara').clarification?.includes('Lens'),true);
  h.api.state.view='lens';
  assert.equal(h.api.fastAgentPlan('Nexus, poné en marcha la cámara').action,'start_lens_camera');
  assert.equal(h.api.fastAgentPlan('Nexus, frená la cámara').action,'stop_lens_camera');
  h.api.state.view='inventory';
  assert.equal(h.api.fastAgentPlan('Nexus, donde guardamos acido nitrico').action,'search_inventory');
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('órdenes habladas delicadas nunca ejecutan borrados, sincronización o búsqueda web',async()=>{
 const h=harness({online:true,stored:master.records,fetcher:()=>{throw Error('No network allowed for voice')}});try{
  await h.api.loadMaster();h.api.state.web=true;
  const starting=h.api.state.inventory.length;
  const destructive=await h.api.nexusAgentTurn('Nexus, elimina del inventario acido nitrico confirmo',{localOnly:true});
  assert.equal(destructive.route,'LOCAL');
  assert.equal(destructive.actions.length,0);
  assert.match(destructive.answer,/no se ejecuta por voz/i);
  const net=await h.api.nexusAgentTurn('Nexus, sincronizá el repositorio',{localOnly:true});
  assert.equal(net.route,'LOCAL');
  assert.equal(net.actions.length,0);
  assert.equal(h.api.state.inventory.length,starting);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('voz conserva preguntas locales y seguimiento aun con Internet habilitado',async()=>{
 const h=harness({online:true,stored:master.records,fetcher:()=>{throw Error('Voice cannot use network')}});
 try{
  await h.api.loadMaster();h.api.state.web=true;
  const first=await h.api.nexusAgentTurn('Nexus, buscá en inventario ácido nítrico',{localOnly:true});
  assert.equal(first.route,'LOCAL');
  assert.equal(first.actions[0].result.ok,true);
  const follow=await h.api.nexusAgentTurn('Nexus, ¿y su fórmula?',{localOnly:true});
  assert.match(follow.answer,/fórmula registrada|no tiene una fórmula cargada/i);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('voz con Internet activado consulta evidencia local de reactivos sin xKiro',async()=>{
 const h=harness({online:true,stored:master.records,fetcher:()=>{throw Error('No remote request from voice')}});
 try{
  await h.api.loadMaster();h.api.state.web=true;
  const out=await h.api.nexusAgentTurn('Nexus, qué es ácido nítrico',{localOnly:true});
  assert.equal(out.route,'LOCAL');
  assert.equal(out.actions.length,0);
  assert.match(out.answer,/inventario local|documento local/i);
  assert.match(out.answer,/nítrico|nitrico/i);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('cadena por voz con coma abre inventario Y busca un reactivo de verdad',async()=>{
 const h=harness({stored:master.records,online:false});try{
  await h.api.loadMaster();
  const plan=h.api.fastAgentPlan('Nexus, abrí inventario, buscá ácido nítrico');
  assert.equal(plan.action,'sequence');
  assert.equal(plan.steps[0].action,'open_view');
  assert.equal(plan.steps[1].action,'search_inventory');
  const out=await h.api.nexusAgentTurn('Nexus, abrí inventario, buscá ácido nítrico',{localOnly:true});
  assert.equal(out.route,'LOCAL');
  assert.equal(out.actions[0].result.ok,true);
  assert.equal(h.api.state.view,'inventory');
  assert.match(h.document.querySelector('#inventorySearch').value,/n[ií]trico/i);
 }finally{h.close()}
});

test('cadena por voz abre Lens y usa SU cámara, no salta al lector QR',async()=>{
 const h=harness({stored:master.records,online:false});
 try{
  await h.api.loadMaster();
  const plan=h.api.fastAgentPlan('Nexus, abrí Lens y prendé cámara');
  assert.equal(plan.action,'sequence');
  assert.deepEqual([...plan.steps.map(x=>x.action)],['open_lens','start_lens_camera']);
 }finally{h.close()}
});

test('ejecución Vosk muestra respuesta y confirma acción real en pantalla',async()=>{
 const h=harness({stored:master.records,online:false});
 try{
  await h.api.loadMaster();
  const fake=fakeLocal(h);
  const output=[];
  h.window.SpeechSynthesisUtterance=class{constructor(text){this.text=text}};
  h.window.speechSynthesis={
   getVoices:()=>[],cancel(){},speak:u=>output.push(u)
  };
  assert.equal(await h.api.startVoiceRecognition(),true);
  await fake.callbacks.onTranscript('Nexus, abrí inventario');
  assert.equal(h.api.state.view,'inventory');
  assert.match(h.document.querySelector('#voiceResponse').textContent,/abrí inventario/i);
  assert.match(h.document.querySelector('#voiceStatusText').textContent,/Acción local ejecutada/i);
  assert.equal(output.length,1);
  assert.equal(output[0].voice,undefined);
  assert.equal(output[0].lang,'es-AR');
 }finally{h.api.stopVoiceRecognition();h.close()}
});

test('Vosk no marca como hecha una acción que falló; muestra el motivo',async()=>{
 const h=harness({stored:master.records,online:false});
 try{
  await h.api.loadMaster();
  const fake=fakeLocal(h);
  assert.equal(await h.api.startVoiceRecognition(),true);
  await fake.callbacks.onTranscript('Nexus, abrí la ficha de un químico inexistente');
  assert.match(h.document.querySelector('#voiceResponse').textContent,/no|error|encontr/i);
  assert.match(h.document.querySelector('#voiceStatusText').textContent,/No pude completar/i);
  assert.equal(h.api.state.view,'dashboard');
 }finally{h.api.stopVoiceRecognition();h.close()}
});
