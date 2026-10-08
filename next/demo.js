import {EdgeSearchClient} from './search-client.js';
import {createVirtualList} from './virtual-list.js';
import {inspectMigration} from './storage.js';
import {evaluateStorage} from './chemical-engine.js';
import {inspectAndSchedule} from './inspection-dag.js';
import {openEdgeDB,readEdgeStore} from './storage.js';
import {ManualWebRTCPeer} from './manual-webrtc.js';
import {EdgeSyncController} from './sync-controller.js';
import {readPublishedDocumentCache} from './document-source.js';
import {SemanticEvidenceFabric} from './semantic-fabric.js';
const $=id=>document.getElementById(id);
let client=null,records=null,peer=null,replica=null,edgeDB=null,documentFabric=null;
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
  onPayload:async payload=>{await experimentalDB();output('syncResult',await replica.receive(payload))},
  onStatus:status=>output('pairStatus',{...status,code:peer.getPairCode()||'Todavía no calculado'})
 });
 return peer;
}
const virtual=createVirtualList($('virtual'),{rowHeight:44,renderRow:(row)=>{const el=document.createElement('div');el.className='virtual-row';el.textContent=row.id+' · '+row.text;return el}});
async function getRecords(){
 if(records)return records;
 const res=await fetch('../inventory.json',{cache:'no-store'});
 if(!res.ok)throw Error('No se pudo cargar inventario canónico: HTTP '+res.status);
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
$('load').onclick=()=>task(async()=>build(makeRows(await getRecords())),'results');
$('stress').onclick=()=>task(async()=>{
 const rows=Array.from({length:100001},(_,i)=>({id:'SYN-'+String(i).padStart(6,'0'),text:'reactivo sintético de demostración codigo '+i}));
 await build(rows);
},'results');
$('search').onclick=()=>task(async()=>{if(!client)throw Error('Primero prepará un índice');output('results',await client.query($('query').value,{limit:10}))},'results');
$('integrity').onclick=()=>task(async()=>output('checks',inspectMigration(await getRecords())),'checks');
$('safety').onclick=()=>task(async()=>output('checks',evaluateStorage(await getRecords())),'checks');
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
window.addEventListener('pagehide',()=>{client?.close();peer?.close();edgeDB?.close();virtual.close()},{once:true});
