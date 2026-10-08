/**
 * Experimental cross-device sync controller. Only the separated NEXUS_X_EDGE_V1
 * database is eligible; original production inventory is deliberately excluded.
 * Transport MUST be a confirmed ManualWebRTCPeer before exchanging records.
 */
import {createReplica,setRegister,mergeRegister,readRegister,exportReplica} from './sync-core.js';
import {readEdgeStore,atomicEdgeWrites} from './storage.js';
const ACTOR=/^[a-zA-Z0-9_-]{6,80}$/;
const keyOf=(store,id)=>store+':'+id;
function parseEvent(event){
 if(!event||!ACTOR.test(event.actor)||!Number.isSafeInteger(event.clock)||event.clock<0||
    typeof event.key!=='string'||event.key.length>180||!['inventory:','calendar:'].some(s=>event.key.startsWith(s))||
    typeof event.deleted!=='boolean')throw Error('Mutación remota no admitida');
 const colon=event.key.indexOf(':'),store=event.key.slice(0,colon),id=event.key.slice(colon+1);
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw Error('ID fuera de política');
 if(!event.deleted&&(typeof event.value!=='object'||!event.value||Array.isArray(event.value)||event.value.id!==id))
   throw Error('Registro remoto inválido');
 const json=JSON.stringify(event.value);
 if(json?.length>16000)throw Error('Registro excede presupuesto');
 return {store,id,event};
}
function logRow(event){return {id:event.actor+':'+event.clock+':'+event.key,...event}}
function writeOperations(parsed){
 const {store,id,event}=parsed;
 return [
  {store:'mutation_log',value:logRow(event)},
  {store,type:event.deleted?'delete':'put',value:event.deleted?{id}:structuredClone(event.value)}
 ];
}
export class EdgeSyncController{
 constructor({db,actor,transport=null,onConflict=()=>{},maxBatchBytes=30000}={}){
  if(!db||!ACTOR.test(actor))throw Error('Configuración de réplica inválida');
  this.db=db;this.replica=createReplica(actor);this.transport=transport;this.onConflict=onConflict;this.maxBatchBytes=maxBatchBytes;
 }
 async load(){
  const log=await readEdgeStore(this.db,'mutation_log');
  log.sort((a,b)=>a.clock-b.clock||a.actor.localeCompare(b.actor));
  for(const row of log){try{parseEvent(row);mergeRegister(this.replica,row)}catch{}}
  return {changes:log.length,keys:this.replica.entries.size};
 }
 async mutate(store,id,value,{deleted=false,broadcast=true}={}){
  if(!['inventory','calendar'].includes(store))throw Error('Store fuera de política');
  parseEvent({key:keyOf(store,id),actor:this.replica.actor,clock:0,deleted:!!deleted,value});
  const key=keyOf(store,id),old=this.replica.entries.get(key),oldClock=this.replica.clock;
  const event=setRegister(this.replica,key,value,{deleted});
  try{await atomicEdgeWrites(this.db,writeOperations(parseEvent(event)))}
  catch(error){if(old)this.replica.entries.set(key,old);else this.replica.entries.delete(key);this.replica.clock=oldClock;throw error}
  if(broadcast&&this.transport?.confirmed)await this.transport.send({type:'edge-events',events:[event]});
  return event;
 }
 async receive(message){
  if(!this.transport?.confirmed)throw Error('Receptor sin vínculo verificado');
  if(message?.type!=='edge-events'||!Array.isArray(message.events)||message.events.length>100)throw Error('Paquete de réplica inválido');
  let changed=0,conflicts=0;
  for(const event of message.events){
   const parsed=parseEvent(event),old=this.replica.entries.get(event.key);
   const stored=mergeRegister(this.replica,event);
   if(stored.actor!==event.actor||stored.clock!==event.clock){conflicts++;continue}
   if(old&&old.actor===stored.actor&&old.clock===stored.clock)continue;
   try{await atomicEdgeWrites(this.db,writeOperations(parsed));changed++}
   catch(error){if(old)this.replica.entries.set(event.key,old);else this.replica.entries.delete(event.key);throw error}
   if(old)this.onConflict({key:event.key,previous:old,next:event});
  }
  return {changed,conflicts};
 }
 async sendSnapshot(){
  if(!this.transport?.confirmed)throw Error('No hay enlace emparejado');
  const events=exportReplica(this.replica);
  let batch=[],bytes=0,sent=0;
  for(const event of events){
   const size=JSON.stringify(event).length;
   if(size>this.maxBatchBytes)throw Error('Registro demasiado grande para sincronizar');
   if(bytes+size>this.maxBatchBytes&&batch.length){
    await this.transport.send({type:'edge-events',events:batch});sent+=batch.length;batch=[];bytes=0;
   }
   batch.push(event);bytes+=size;
   if(batch.length===100){await this.transport.send({type:'edge-events',events:batch});sent+=batch.length;batch=[];bytes=0}
  }
  if(batch.length){await this.transport.send({type:'edge-events',events:batch});sent+=batch.length}
  return {sent,keys:this.replica.entries.size};
 }
 read(store,id){if(!['inventory','calendar'].includes(store))throw Error('Store inválida');return readRegister(this.replica,keyOf(store,id))}
}
