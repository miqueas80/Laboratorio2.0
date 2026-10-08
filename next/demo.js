import {EdgeSearchClient} from './search-client.js';
import {NexusEdgeAgent} from './agent-runtime.js';
import {EdgeLens} from './lens-edge.js';
import {EdgeVoiceCoordinator} from './voice-edge.js';
import {VoiceFrameEngine} from './voice-frame-client.js';
import {setupDeviceAcceptance} from './device-acceptance.js';
import {createVirtualList} from './virtual-list.js';
import {inspectMigration} from './storage.js';
import {ChemicalSafetyClient} from './chemical-client.js';
import {inspectAndSchedule} from './inspection-dag.js';
import {openEdgeDB,readEdgeStore} from './storage.js';
import {ManualWebRTCPeer} from './manual-webrtc.js';
import {EdgeSyncController} from './sync-controller.js';
import {YjsLabBoard} from './yjs-lab.js';
import {readEdgeAvailableDocuments,readCachedOriginalDocument} from './canonical-source.js';
import {SemanticEvidenceFabric} from './semantic-fabric.js';
import {prepareSemanticAssets,semanticCacheStatus} from './model-provisioner.js';
import {prepareOfflineShell,offlineShellStatus} from './offline-shell.js';
import {benchmarkAnimation,benchmarkVirtualScroll,memoryEstimate} from './benchmarks.js';
const $=id=>document.getElementById(id);
let client=null,records=null,peer=null,replica=null,edgeDB=null,documentFabric=null,edgeAgent=null,yjsBoard=null,safetyClient=null,lensBridge=null,voiceBridge=null,videoStream=null,voiceFrame=null,lastScrollPerformance=null;
const actorKey='nexus_edge_demo_actor_v1';
const actor=localStorage.getItem(actorKey)||'edge-'+crypto.randomUUID().replaceAll('-','');
localStorage.setItem(actorKey,actor);
async function experimentalDB(){
 if(edgeDB)return edgeDB;
 edgeDB=await openEdgeDB();
 replica=new EdgeSyncController({db:edgeDB,actor});
 await replica.load();
 return edgeDB;
}
function makePeer(){
 peer?.close();
 peer=new ManualWebRTCPeer({
  onPayload:async payload=>{
   await experimentalDB();
   if(payload?.type==='yjs-state'||payload?.type==='yjs-chunk'){
    if(!yjsBoard)throw Error('Activá primero Yjs en el otro equipo.');
    const status=await yjsBoard.receive(payload);
    output('yjsStatus',{status,tasks:yjsBoard.listTasks()});
   }else output('syncResult',await replica.receive(payload));
  },
  onStatus:status=>output('pairStatus',{...status,code:peer.getPairCode()||'Todavía no calculado'})
 });
 if(yjsBoard)yjsBoard.transport=peer;
 return peer;
}
const virtual=createVirtualList($('virtual'),{rowHeight:44,renderRow:(row)=>{const el=document.createElement('div');el.className='virtual-row';el.textContent=row.id+' · '+row.text;return el}});
async function getRecords(){
 if(records)return records;
 let res;
 try{
  res=await fetch('../inventory.json',{cache:'no-store'});
  if(!res.ok)throw Error('Inventario original HTTP '+res.status);
 }catch{
  res=await fetch('./snapshot/inventory.json');
  if(!res.ok)throw Error('Inventario fuera de línea no preparado: HTTP '+res.status);
 }
 const parsed=await res.json();
 if(!Array.isArray(parsed.records))throw Error('Inventario inválido');
 records=parsed.records;return records;
}
function output(node,value){$(node).textContent=typeof value==='string'?value:JSON.stringify(value,null,2)}
async function registerSensorOfflineWorker(){
 if(!navigator.serviceWorker)throw Error('Service Worker requerido para modelos de voz y visión offline');
 const registration=await navigator.serviceWorker.register('../offline/edge-sw.js',{scope:'../offline/'});
 if(registration.active)return registration;
 const installing=registration.installing||registration.waiting;
 if(!installing)throw Error('Worker de modelos no pudo activarse');
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('La activación del cache visual/voz tardó demasiado')),12000);
  const check=()=>{
   if(registration.active||installing.state==='activated'){
    clearTimeout(timer);installing.removeEventListener('statechange',check);resolve()
   }else if(installing.state==='redundant'){
    clearTimeout(timer);installing.removeEventListener('statechange',check);
    reject(Error('Service Worker de modelos descartado'))
   }
  };
  installing.addEventListener('statechange',check);check();
 });
 return registration;
}
async function task(fn,node){
 try{await fn()}catch(error){output(node,'Error: '+String(error.message||error))}
}
function makeRows(rows){return rows.map(r=>({id:r.id,text:[r.id,r.name,r.formula,r.location,r.cas].filter(Boolean).join(' ')}))}
async function build(rows){
 client?.close();client=new EdgeSearchClient();
 const started=performance.now(),info=await client.build(rows);
 virtual.setRows(rows);
 output('results',{...info,ms:Math.round(performance.now()-started),note:'Tiempo solo orientativo: no es una prueba de 60 FPS ni de memoria RAM.'});
}
$('agentAsk').onclick=()=>task(async()=>{
 if(!edgeAgent)edgeAgent=new NexusEdgeAgent({inventory:await getRecords(),fabric:documentFabric});
 else edgeAgent.fabric=documentFabric;
 const text=$('agentText').value.trim();
 const out=await edgeAgent.turn(text);
 output('agentOutput',out);
 if(out.viewRequest==='inventory'){
  await build(makeRows(await getRecords()));
  $('inventorySection').scrollIntoView({behavior:'smooth'});
 }else if(out.viewRequest==='documents'){
  $('documentsSection').scrollIntoView({behavior:'smooth'});
  $('fabricQuery').focus();
 }
},'agentOutput');
$('agentText').addEventListener('keydown',event=>{if(event.key==='Enter')$('agentAsk').click()});
$('lensPrepare').onclick=()=>task(async()=>{
 lensBridge||=new EdgeLens({inventory:await getRecords()});
 output('edgeLensResult','Preparando MobileCLIP y PP-OCR localmente, sin enviar fotos a Internet…');
 const state=await lensBridge.prepare({onProgress:p=>output('edgeLensResult',p)});
 await registerSensorOfflineWorker();
 output('edgeLensResult',{prepared:true,engine:state,sensorOfflineCache:true});
},'edgeLensResult');
async function localEdgeAgent(){
 if(!edgeAgent)edgeAgent=new NexusEdgeAgent({inventory:await getRecords(),fabric:documentFabric});
 else edgeAgent.fabric=documentFabric;
 return edgeAgent;
}
function edgeVoice(){
 voiceBridge||=new EdgeVoiceCoordinator({
  engine:(voiceFrame||=new VoiceFrameEngine()),
  agent:{turn:async prompt=>{
   const agent=await localEdgeAgent();
   return agent.turn(prompt);
  }},
  onResult:out=>{
   output('agentOutput',out);
   if(out.viewRequest==='inventory')$('inventorySection').scrollIntoView({behavior:'smooth'});
   else if(out.viewRequest==='documents')$('documentsSection').scrollIntoView({behavior:'smooth'});
  },
  onStatus:state=>output('edgeVoiceStatus',state)
 });
 return voiceBridge;
}
$('voicePrepare').onclick=()=>task(async()=>{
 output('edgeVoiceStatus','Preparando Vosk local por decisión del operador…');
 const state=await edgeVoice().prepare(p=>output('edgeVoiceStatus',p));
 await registerSensorOfflineWorker();
 output('edgeVoiceStatus',{prepared:true,state,sensorOfflineCache:true});
},'edgeVoiceStatus');
$('voiceStart').onclick=()=>task(async()=>output('edgeVoiceStatus',await edgeVoice().start()),'edgeVoiceStatus');
$('voiceStop').onclick=()=>{voiceBridge?.stop();output('edgeVoiceStatus','Escucha detenida')};
$('edgeCameraStart').onclick=()=>task(async()=>{
 if(videoStream)for(const track of videoStream.getTracks())track.stop();
 if(!navigator.mediaDevices?.getUserMedia)throw Error('Se requiere cámara en HTTPS y permiso del dispositivo');
 videoStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
 $('edgeLensVideo').srcObject=videoStream;
 await $('edgeLensVideo').play();
 output('edgeLensResult','Cámara lista. Analizá una captura cuando el objeto esté enfocado.');
},'edgeLensResult');
$('edgeCameraStop').onclick=()=>{
 videoStream?.getTracks().forEach(track=>track.stop());videoStream=null;
 $('edgeLensVideo').srcObject=null;output('edgeLensResult','Cámara detenida.');
};
async function analyzeEdgeFrame(skipQR){
 lensBridge||=new EdgeLens({inventory:await getRecords()});
 const file=$('lensFile').files?.[0];
 let image=null;
 try{
  if(file){
   if(file.size>15*1024*1024||!file.type.startsWith('image/'))throw Error('Archivo no admitido o demasiado grande');
   image=await createImageBitmap(file);
  }else if(videoStream&&$('edgeLensVideo').videoWidth)image=$('edgeLensVideo');
  else throw Error('Elegí una foto local o activá la cámara.');
  output('edgeLensResult','Analizando con MobileCLIP-S0 local…');
  const result=await lensBridge.analyze(image,{skipQR,readLabel:$('lensReadLabel').checked});
  output('edgeLensResult',result);
 }finally{if(image&&image!==$('edgeLensVideo'))image.close?.()}
}
$('edgeLensAnalyze').onclick=()=>task(()=>analyzeEdgeFrame(true),'edgeLensResult');
$('edgeLensAnalyzeQr').onclick=()=>task(()=>analyzeEdgeFrame(false),'edgeLensResult');
$('load').onclick=()=>task(async()=>build(makeRows(await getRecords())),'results');
$('stress').onclick=()=>task(async()=>{
 const rows=Array.from({length:100001},(_,i)=>({id:'SYN-'+String(i).padStart(6,'0'),text:'reactivo sintético de demostración codigo '+i}));
 await build(rows);
},'results');
$('search').onclick=()=>task(async()=>{if(!client)throw Error('Primero prepará un índice');output('results',await client.query($('query').value,{limit:10}))},'results');
$('measureFPS').onclick=()=>task(async()=>{
 output('performanceResult','Midiendo fotogramas reales de este dispositivo…');
 const [frames,memory]=await Promise.all([benchmarkAnimation({durationMs:1600}),memoryEstimate()]);
 output('performanceResult',{frames,memory,device:navigator.userAgent,note:'Los FPS de una prueba aislada no garantizan la fluidez de todas las pantallas.'});
},'performanceResult');
$('measureScroll').onclick=()=>task(async()=>{
 output('performanceResult','Midiendo desplazamiento activo con filas virtualizadas…');
 const result=await benchmarkVirtualScroll($('virtual'),{durationMs:1200,stepPx:620});
 lastScrollPerformance=result;
 output('performanceResult',{activeScroll:result,
  layout:virtual.metrics(),memory:await memoryEstimate(),device:navigator.userAgent});
},'performanceResult');
$('integrity').onclick=()=>task(async()=>output('checks',inspectMigration(await getRecords())),'checks');
$('safety').onclick=()=>task(async()=>{
 if(!safetyClient)safetyClient=new ChemicalSafetyClient();
 output('checks','Comprobando seguridad química en segundo plano…');
 const result=await safetyClient.evaluate(await getRecords());
 output('checks',result);
},'checks');
$('fabricStatus').onclick=()=>task(async()=>output('fabricResults',{
 model:await semanticCacheStatus(),shell:await offlineShellStatus({includeInventory:true})
}),'fabricResults');
$('offlineShell').onclick=()=>task(async()=>{
 if(!confirm('¿Autorizar la preparación offline de Edge Lab? Se guardarán la interfaz, los módulos y el índice de los seis documentos canónicos en el navegador. Los modelos de IA se preparan aparte.'))return;
 const result=await prepareOfflineShell({includeInventory:true,includeDocuments:true,onProgress:p=>output('fabricResults',p)});
 if(!navigator.serviceWorker)throw Error('Service Worker no disponible');
 await navigator.serviceWorker.register('./semantic-sw.js',{scope:'./'});
 await navigator.serviceWorker.ready;
 await registerSensorOfflineWorker();
 output('fabricResults',{...result,note:'Interfaz y caché visual/voz preparados para recarga offline. Los pesos de los modelos se preparan aparte.'});
},'fabricResults');
$('fabricInstall').onclick=()=>task(async()=>{
 const runtimeURL=new URL('./vendor/transformers/transformers.min.js',import.meta.url);
 const wasmURL=new URL('./vendor/onnx/ort-wasm-simd-threaded.jsep.wasm',import.meta.url);
 const status=await Promise.all([fetch(runtimeURL,{method:'HEAD'}),fetch(wasmURL,{method:'HEAD'})]);
 if(!status.every(r=>r.ok))throw Error('Primero hay que instalar Transformers.js y ONNX WASM en el mismo origen. No se descargarán pesos inutilizables.');
 if(!confirm('¿Autorizar la descarga de unos 140 MB adicionales y su almacenamiento local? Solo se instalará el modelo si hay espacio y su SHA-256 coincide.'))return;
 if(!navigator.serviceWorker)throw Error('Service Worker no disponible');
 const registration=await navigator.serviceWorker.register('./semantic-sw.js',{scope:'./'});
 await navigator.serviceWorker.ready;
 if(!registration.active)throw Error('Activá el Service Worker del laboratorio Edge y reintentá');
 output('fabricResults','Descargando y verificando archivos…');
 const result=await prepareSemanticAssets({onProgress:p=>output('fabricResults',p)});
 const shell=await prepareOfflineShell({includeInventory:true,includeDocuments:true,onProgress:p=>output('fabricResults',{preparando:'interfaz y documentos offline',...p})});
 output('fabricResults',{...result,shell,note:'Modelo y runtime local preparados. Recargá esta pestaña y probá el modo avión antes de usarlo.'});
},'fabricResults');
$('fabricLoad').onclick=()=>task(async()=>{
 const source=await readEdgeAvailableDocuments();
 if(!source.available||!source.documents.length)throw Error(source.reason||'Primero indexá los documentos en NEXUS estable');
 documentFabric?.close();documentFabric=new SemanticEvidenceFabric();
 const result=await documentFabric.prepare(source.documents,{semantic:$('semanticMode').checked,
  onProgress:progress=>output('fabricResults',{state:'Generando embeddings locales',...progress})});
 output('fabricResults',{...result,source:source.source,canonicalDocuments:source.documents.length,
  extractedWithText:source.documents.filter(x=>(x.text||'').length>32).length,
  warning:source.note||'Los resultados contienen fragmentos con procedencia, no opiniones inventadas.'});
},'fabricResults');
$('fabricAsk').onclick=()=>task(async()=>{
 if(!documentFabric)throw Error('Indexá primero los documentos');
 output('fabricResults',await documentFabric.query($('fabricQuery').value,{limit:8}));
},'fabricResults');
$('inspect').onclick=()=>task(async()=>{
 const db=await experimentalDB(),out=await inspectAndSchedule({
  db,inventory:await getRecords(),observation:{code:$('inspectCode').value.trim()},
  approved:$('approveTask').checked
 });
 output('agentResult',out);
},'agentResult');
$('offer').onclick=()=>task(async()=>{
 await experimentalDB();const p=makePeer();
 $('outgoing').value=await p.createInvite();output('pairStatus',{state:'Esperando respuesta del equipo B'});
 replica.transport=p;
},'pairStatus');
$('answer').onclick=()=>task(async()=>{
 await experimentalDB();const p=makePeer();
 $('outgoing').value=await p.acceptInvite($('received').value);
 replica.transport=p;output('pairStatus',{state:'Comprobá código en equipo A y B',code:p.getPairCode()});
},'pairStatus');
$('finish').onclick=()=>task(async()=>{
 if(!peer)throw Error('Primero creá una oferta');
 await peer.acceptAnswer($('received').value);
 output('pairStatus',{state:'Comprobá código en equipo A y B',code:peer.getPairCode()});
},'pairStatus');
$('confirmPair').onclick=()=>task(async()=>{
 if(!peer)throw Error('No hay sesión');
 peer.confirmSameCode($('pairConfirm').value.trim());
 output('pairStatus',{state:'Código confirmado: habilitá intercambio cuando WebRTC conecte',code:peer.getPairCode()});
},'pairStatus');
$('addTask').onclick=()=>task(async()=>{
 await experimentalDB();const text=$('taskText').value.trim();
 if(!text)throw Error('Tarea vacía');
 const id='task-'+crypto.randomUUID().replaceAll('-','').slice(0,18);
 const event=await replica.mutate('calendar',id,{id,text,date:new Date().toISOString().slice(0,10)},{broadcast:Boolean(peer?.confirmed)});
 output('syncResult',{created:event.key,localExperimentalEvents:(await readEdgeStore(edgeDB,'calendar')).length});
},'syncResult');
$('syncNow').onclick=()=>task(async()=>{
 await experimentalDB();output('syncResult',await replica.sendSnapshot());
},'syncResult');
$('yjsEnable').onclick=()=>task(async()=>{
 await experimentalDB();
 if(yjsBoard){yjsBoard.close();yjsBoard=null}
 let Y;
 try{Y=await import('./vendor/yjs/yjs.bundle.mjs')}
 catch{throw Error('Runtime Yjs no instalado: copiá el artefacto local a next/vendor/yjs/. No se usará ninguna CDN.')}
 // Clicking Activate is explicit consent to store only the ~93KB Yjs runtime
 // together with the read-only shell and canonical inventory snapshot.
 const settings={includeVendor:false,includeInventory:true,includeYjs:true};
 const cached=await offlineShellStatus(settings);
 if(!cached.ready){
  if(!navigator.onLine)throw Error('Primero prepará los archivos de Yjs cuando estés online');
  await prepareOfflineShell({...settings,onProgress:p=>output('yjsStatus',p)});
  if(navigator.serviceWorker){
   await navigator.serviceWorker.register('./semantic-sw.js',{scope:'./'});
   await navigator.serviceWorker.ready;
  }
 }
 yjsBoard=new YjsLabBoard({Y,db:edgeDB,room:$('yjsRoom').value.trim(),transport:peer});
 const restored=await yjsBoard.load();
 output('yjsStatus',{restored,tasks:yjsBoard.listTasks()});
},'yjsStatus');
$('yjsWrite').onclick=()=>task(async()=>{
 if(!yjsBoard)throw Error('Primero activá el motor Yjs local');
 const fields={};
 if($('yjsTitle').value.trim())fields.title=$('yjsTitle').value.trim();
 if($('yjsNotes').value.trim())fields.notes=$('yjsNotes').value.trim();
 const saved=await yjsBoard.updateTask($('yjsTaskId').value.trim(),fields);
 output('yjsStatus',{saved,tasks:yjsBoard.listTasks(),note:'Cambios guardados en IndexedDB local. La comunicación depende del emparejamiento.'});
},'yjsStatus');
$('yjsSync').onclick=()=>task(async()=>{
 if(!yjsBoard)throw Error('Primero activá Yjs');
 output('yjsStatus',{sent:await yjsBoard.sendSnapshot(),tasks:yjsBoard.listTasks()});
},'yjsStatus');
const acceptance=setupDeviceAcceptance({readInventory:getRecords,performanceResult:()=>lastScrollPerformance,
 virtualMetrics:()=>virtual.metrics(),output});
window.addEventListener('pagehide',()=>{acceptance.close();client?.close();documentFabric?.close();safetyClient?.close();lensBridge?.close();voiceBridge?.stop();voiceFrame?.close();videoStream?.getTracks().forEach(track=>track.stop());yjsBoard?.close();peer?.close();edgeDB?.close();virtual.close()},{once:true});
