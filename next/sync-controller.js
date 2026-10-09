/**
 * Durable, locally scoped LWW CRDT replication.
 *
 * Guarantees per incoming batch:
 *  - validate EVERY mutation before a single IndexedDB commit
 *  - durable history for both winning and losing concurrent revisions
 *  - duplicate replay idempotence and forged-version detection
 *  - only the winning revision changes the materialized register
 *  - reset in-memory state if the IndexedDB transaction aborts
 *
 * The source application inventory is never touched. Real Yjs/Automerge
 * collaboration and Android-to-Android WebRTC tests are separate milestones.
 */
import {createReplica,setRegister,mergeRegister,readRegister,exportReplica} from './sync-core.js';
import {readEdgeStore,atomicEdgeWrites} from './storage.js';

const ACTOR=/^[a-zA-Z0-9_-]{6,80}$/;
const ID=/^[A-Za-z0-9_-]{1,100}$/;
const STORE=new Set(['inventory','calendar']);
const keyOf=(store,id)=>store+':'+id;
const logId=event=>event.actor+':'+event.clock+':'+event.key;
function parseEvent(event){
 if(!event||!ACTOR.test(event.actor)||!Number.isSafeInteger(event.clock)||event.clock<0||
    typeof event.key!=='string'||event.key.length>180||
    !['inventory:','calendar:'].some(prefix=>event.key.startsWith(prefix))||
    typeof event.deleted!=='boolean')throw Error('Mutación remota no admitida');
 const colon=event.key.indexOf(':'),store=event.key.slice(0,colon),id=event.key.slice(colon+1);
 if(!STORE.has(store)||!ID.test(id))throw Error('Store o ID fuera de política');
 if(event.deleted){
  if(event.value!==null)throw Error('Borrado con contenido inesperado');
 }else if(!event.value||typeof event.value!=='object'||Array.isArray(event.value)||event.value.id!==id){
  throw Error('Registro remoto inválido');
 }
 // Enforce size/serializability before passing data to IndexedDB.
 const clean={key:event.key,actor:event.actor,clock:event.clock,
  deleted:event.deleted,value:event.deleted?null:structuredClone(event.value)};
 const encoded=JSON.stringify(clean);
 if(!encoded||encoded.length>16000)throw Error('Registro excede presupuesto');
 return {store,id,event:clean,signature:encoded};
}
function version(event){return logId(event)}
function clonedReplica(replica){
 const clone=createReplica(replica.actor);clone.clock=replica.clock;
 for(const [key,entry] of replica.entries)clone.entries.set(key,structuredClone(entry));
 return clone;
}
function operationsFor(parsed,winner){
 const {event,store,id}=parsed;
 const ops=[{store:'mutation_log',value:{id:version(event),...event}}];
 if(winner)ops.push({store,type:event.deleted?'delete':'put',
  value:event.deleted?{id}:structuredClone(event.value)});
 return ops;
}
export class EdgeSyncController {
 constructor({db,actor,transport=null,onConflict=()=>{},maxBatchBytes=30000,allowRemoteInventory=false}={}){
  if(!db||!ACTOR.test(actor))throw Error('Configuración de réplica inválida');
  this.db=db;this.replica=createReplica(actor);this.transport=transport;
  this.onConflict=onConflict;this.maxBatchBytes=maxBatchBytes;
  this.allowRemoteInventory=allowRemoteInventory===true;
  this.versions=new Map();this.queue=Promise.resolve();
 }
 #serial(action){
  const result=this.queue.then(action);
  this.queue=result.catch(()=>{});
  return result;
 }
 async load(){
  return this.#serial(async()=>{
   const log=await readEdgeStore(this.db,'mutation_log');
   const replica=createReplica(this.replica.actor),seen=new Map();
   log.sort((a,b)=>a.clock-b.clock||a.actor.localeCompare(b.actor)||a.key.localeCompare(b.key));
   for(const raw of log){
    const parsed=parseEvent(raw),id=version(parsed.event);
    if(seen.has(id)&&seen.get(id)!==parsed.signature)throw Error('Conflicto en histórico local');
    seen.set(id,parsed.signature);mergeRegister(replica,parsed.event);
   }
   this.replica=replica;this.versions=seen;
   return {changes:log.length,keys:replica.entries.size};
  });
 }
 async mutate(store,id,value,{deleted=false,broadcast=true}={}){
  return this.#serial(async()=>{
   if(!STORE.has(store)||!ID.test(id))throw Error('Store o ID fuera de política');
   const pending=clonedReplica(this.replica);
   const entry=setRegister(pending,keyOf(store,id),value,{deleted});
   const parsed=parseEvent(entry),receipt=operationsFor(parsed,true);
   await atomicEdgeWrites(this.db,receipt);
   this.replica=pending;this.versions.set(version(entry),parsed.signature);
   // Never pretend the durable local write rolled back when radio drops.
   let delivered=false,deliveryError='';
   if(broadcast&&this.transport?.confirmed){
    try{await this.transport.send({type:'edge-events',events:[entry]});delivered=true}
    catch(error){deliveryError=String(error?.message||error)}
   }
   return {...entry,delivered,deliveryError,pending:!delivered};
  });
 }
 async receive(message){
  return this.#serial(async()=>{
   if(!this.transport?.confirmed)throw Error('Receptor sin vínculo verificado');
   if(message?.type!=='edge-events'||!Array.isArray(message.events)||
      !message.events.length||message.events.length>100)throw Error('Paquete de réplica inválido');
   // Validate the full batch and stage state independently of live replica.
   const staged=clonedReplica(this.replica),seen=new Map(this.versions);
   const ops=[],conflictEvents=[];let changed=0,conflicts=0,replayed=0;
   for(const raw of message.events){
    const parsed=parseEvent(raw),id=version(parsed.event),existing=seen.get(id);
    if(parsed.store==='inventory'&&!this.allowRemoteInventory)
     throw Error('La escritura remota de inventario requiere autorización explícita');
    if(existing!==undefined){
     if(existing!==parsed.signature)throw Error('Versión CRDT alterada o inconsistente');
     replayed++;continue;
    }
    seen.set(id,parsed.signature);
    const previous=staged.entries.get(parsed.event.key);
    const chosen=mergeRegister(staged,parsed.event);
    const winner=chosen.actor===parsed.event.actor&&chosen.clock===parsed.event.clock;
    ops.push(...operationsFor(parsed,winner));
    if(winner){changed++;if(previous)conflictEvents.push({key:parsed.event.key,previous,next:parsed.event})}
    else conflicts++;
   }
   if(ops.length)await atomicEdgeWrites(this.db,ops);
   this.replica=staged;this.versions=seen;
   for(const conflict of conflictEvents){
    try{this.onConflict(conflict)}catch{/* telemetry callbacks cannot undo a committed event */}
   }
   return {changed,conflicts,replayed,received:message.events.length};
  });
 }
 async sendSnapshot(){
  // The latest register versions are sufficient for state convergence.
  return this.#serial(async()=>{
   if(!this.transport?.confirmed)throw Error('No hay enlace emparejado');
   const events=exportReplica(this.replica);
   let batch=[],bytes=0,sent=0;
   for(const event of events){
    const size=JSON.stringify(event).length;
    if(size>this.maxBatchBytes)throw Error('Registro demasiado grande para sincronizar');
    if(bytes+size>this.maxBatchBytes&&batch.length){
     await this.transport.send({type:'edge-events',events:batch});
     sent+=batch.length;batch=[];bytes=0;
    }
    batch.push(event);bytes+=size;
    if(batch.length===100){
     await this.transport.send({type:'edge-events',events:batch});
     sent+=batch.length;batch=[];bytes=0;
    }
   }
   if(batch.length){await this.transport.send({type:'edge-events',events:batch});sent+=batch.length}
   return {sent,keys:this.replica.entries.size};
  });
 }
 read(store,id){
  if(!STORE.has(store)||!ID.test(id))throw Error('Store inválida');
  return readRegister(this.replica,keyOf(store,id));
 }
}
