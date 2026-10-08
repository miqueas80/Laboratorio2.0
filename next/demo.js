import {EdgeSearchClient} from './search-client.js';
import {NexusEdgeAgent} from './agent-runtime.js';
import {createVirtualList} from './virtual-list.js';
import {inspectMigration} from './storage.js';
import {evaluateStorage} from './chemical-engine.js';
import {inspectAndSchedule} from './inspection-dag.js';
import {openEdgeDB,readEdgeStore} from './storage.js';
import {ManualWebRTCPeer} from './manual-webrtc.js';
import {EdgeSyncController} from './sync-controller.js';
import {YjsLabBoard} from './yjs-lab.js';
import {readPublishedDocumentCache} from './document-source.js';
import {SemanticEvidenceFabric} from './semantic-fabric.js';
import {prepareSemanticAssets,semanticCacheStatus} from './model-provisioner.js';
import {prepareOfflineShell,offlineShellStatus} from './offline-shell.js';
import {benchmarkAnimation,memoryEstimate} from './benchmarks.js';
const $=id=>document.getElementById(id);
let client=null,records=null,peer=null,replica=null,edgeDB=null,documentFabric=null,edgeAgent=null,yjsBoard=null;
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
   if(payload?.type==='yjs-state'){
    if(!yjsBoard)throw Error('Activá primero Yjs en el otro equipo.');
    const status=await yjsBoard.receive(payload);
    output('yjsStatus',{status,tasks:yjsBoard.listTasks()});
   }else output('syncResult',await replica.receive(payload));
  },
  onStatus:status=>output('pairStatus',{...status,code:peer.getPairCode()||'Todavía no calculado'})
 });
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
$('integrity').onclick=()=>task(async()=>output('checks',inspectMigration(await getRecords())),'checks');
$('safety').onclick=()=>task(async()=>output('checks',evaluateStorage(await getRecords())),'checks');
$('fabricStatus').onclick=()=>task(async()=>output('fabricResults',{
 model:await semanticCacheStatus(),shell:await offlineShellStatus({includeInventory:true})
}),'fabricResults');
$('offlineShell').onclick=()=>task(async()=>{
 if(!confirm('¿Autorizar la preparación offline de Edge Lab? Se guardarán la interfaz y los motores locales, aproximadamente 23 MB adicionales, en el navegador.'))return;
 const result=await prepareOfflineShell({includeInventory:true,onProgress:p=>output('fabricResults',p)});
 if(!navigator.serviceWorker)throw Error('Service Worker no disponible');
 await navigator.serviceWorker.register('./semantic-sw.js',{scope:'./'});
 await navigator.serviceWorker.ready;
 output('fabricResults',{...result,note:'La próxima recarga utilizará los recursos locales si no hay Internet. Los modelos semánticos se instalan por separado.'});
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
 const shell=await prepareOfflineShell({includeInventory:true,onProgress:p=>output('fabricResults',{preparando:'interfaz offline',...p})});
 output('fabricResults',{...result,shell,note:'Modelo y runtime local preparados. Recargá esta pestaña y probá el modo avión antes de usarlo.'});
},'fabricResults');
$('fabricLoad').onclick=()=>task(async()=>{
 const source=await readPublishedDocumentCache();
 if(!source.available||!source.documents.length)throw Error(source.reason||'Primero indexá los documentos en NEXUS estable');
 documentFabric?.close();documentFabric=new SemanticEvidenceFabric();
 const result=await documentFabric.prepare(source.documents,{semantic:$('semanticMode').checked,
  onProgress:progress=>output('fabricResults',{state:'Generando embeddings locales',...progress})});
 output('fabricResults',result);
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
window.addEventListener('pagehide',()=>{client?.close();documentFabric?.close();peer?.close();edgeDB?.close();virtual.close()},{once:true});
