/**
 * Opt-in Yjs field-level CRDT for experimental lab tasks.
 * Injects a locally bundled Yjs module (no CDN). Uses durable separate
 * NEXUS_X_EDGE_V1 meta store. Peer transport is the verified AES-GCM manual
 * WebRTC channel; server signaling is never required for this demo.
 *
 * Updates commit a COMPLETE snapshot BEFORE being sent to the peer. This
 * deliberately sacrifices throughput for small, correct offline task boards;
 * it is not a high-volume inventory replication implementation.
 */
import {atomicEdgeWrites,readEdgeStore} from './storage.js';
const allowed=new Set(['title','notes','status','owner']);
const PIECE=16000,MAX_PARTS=24;
const key=id=>'yjs:room:'+id;
function base64(bytes){
 let text='';
 for(let i=0;i<bytes.length;i+=8192)
  text+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(text);
}
function unbase64(text){
 if(typeof text!=='string'||text.length>300000)throw Error('Actualización Yjs demasiado grande');
 return Uint8Array.from(atob(text),ch=>ch.charCodeAt(0));
}
function validateRoom(room){
 if(typeof room!=='string'||!/^[a-zA-Z0-9_-]{3,60}$/.test(room))throw Error('Sala Yjs inválida');
}
function validatePatch(id,patch){
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw Error('ID de tarea inválido');
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length)throw Error('Campos no válidos');
 for(const [name,value] of Object.entries(patch))
  if(!allowed.has(name)||typeof value!=='string'||value.length>1000)
   throw Error('Campo Yjs no permitido: '+name);
}
function snapshotBytes(Y,doc){
 const bytes=Y.encodeStateAsUpdate(doc);
 if(bytes.length>210000)throw Error('El CRDT excede el límite experimental (210KB)');
 return bytes;
}
export class YjsLabBoard{
 constructor({Y,db,room='lab-tasks',transport=null}={}){
  if(!Y?.Doc||!Y?.Map||!Y?.applyUpdate||!Y?.encodeStateAsUpdate||!db)throw Error('Dependencia Yjs local o base experimental ausente');
  validateRoom(room);
  this.Y=Y;this.db=db;this.room=room;this.transport=transport;
  this.doc=new Y.Doc();this.queue=Promise.resolve();this.parts=new Map();
 }
 #serial(callback){
  const result=this.queue.then(callback);
  this.queue=result.catch(()=>{});
  return result;
 }
 #clone(){
  const next=new this.Y.Doc();
  this.Y.applyUpdate(next,this.Y.encodeStateAsUpdate(this.doc));
  return next;
 }
 async #persist(next){
  const value=base64(snapshotBytes(this.Y,next));
  await atomicEdgeWrites(this.db,[{store:'meta',value:{key:key(this.room),encoding:'base64-yjs-v1',value}}]);
 }
 async load(){
  return this.#serial(async()=>{
   const rows=await readEdgeStore(this.db,'meta'),row=rows.find(x=>x.key===key(this.room));
   const next=new this.Y.Doc();
   if(row){
    if(row.encoding!=='base64-yjs-v1')throw Error('Versión de snapshot no soportada');
    this.Y.applyUpdate(next,unbase64(row.value));
   }
   this.doc.destroy();this.doc=next;this.parts.clear();
   return {room:this.room,records:this.doc.getMap('tasks').size,restored:Boolean(row)};
  });
 }
 async updateTask(id,patch,{broadcast=true}={}){
  return this.#serial(async()=>{
   validatePatch(id,patch);
   const next=this.#clone(),tasks=next.getMap('tasks');
   next.transact(()=>{
    let fields=tasks.get(id);
    if(!fields){fields=new this.Y.Map();tasks.set(id,fields)}
    for(const [field,value] of Object.entries(patch))fields.set(field,value);
   });
   await this.#persist(next);
   this.doc.destroy();this.doc=next;
   let delivered=false,deliveryError='';
   if(broadcast&&this.transport?.confirmed){
    try{await this.#sendState();delivered=true}
    catch(e){deliveryError=String(e?.message||e)}
   }
   return {id,fields:{...patch},committed:true,delivered,pending:!delivered,deliveryError};
  });
 }
 async receive(payload){
  return this.#serial(async()=>{
   if(!this.transport?.confirmed)throw Error('Sin emparejamiento verificado');
   if(!payload||payload.room!==this.room||!['yjs-state','yjs-chunk'].includes(payload.type))
    throw Error('Actualización de sala Yjs no permitida');
   const assembled=payload.type==='yjs-chunk'?this.#acceptPart(payload):payload.data;
   if(assembled===null)return {received:false,partial:true};
   const update=unbase64(assembled);
   const next=this.#clone();
   this.Y.applyUpdate(next,update);
   const tasks=next.getMap('tasks');
   if(tasks.size>1000)throw Error('Demasiadas tareas colaborativas');
   for(const [id,fields] of tasks){
    if(!(fields instanceof this.Y.Map))throw Error('Estructura Yjs no permitida');
    validatePatch(id,fields.toJSON());
   }
   await this.#persist(next);
   this.doc.destroy();this.doc=next;
   return {received:true,records:tasks.size};
  });
 }
 exportPacket(){
  return {type:'yjs-state',room:this.room,data:base64(snapshotBytes(this.Y,this.doc))};
 }
 async sendSnapshot(){
  return this.#serial(async()=>{
   if(!this.transport?.confirmed)throw Error('Sin canal Yjs emparejado');
   const parts=await this.#sendState();
   return {sent:true,room:this.room,packets:parts};
  });
 }
 getTask(id){
  const value=this.doc.getMap('tasks').get(id);
  return value?structuredClone(value.toJSON()):null;
 }
 listTasks(){
  return [...this.doc.getMap('tasks')].map(([id,fields])=>({id,...fields.toJSON()}));
 }
 /**
  * Split Yjs snapshots below the AES-GCM WebRTC JSON packet limit. The
  * receiver applies and commits only after all chunks have been assembled.
  */
 async #sendState(){
  const message=this.exportPacket(),data=message.data;
  if(data.length<=PIECE){
   await this.transport.send(message);return 1;
  }
  const total=Math.ceil(data.length/PIECE);
  if(total>MAX_PARTS)throw Error('Snapshot colaborativo excede límite de transferencia');
  const transferId=globalThis.crypto?.randomUUID?.()||'transfer-'+Date.now()+'-'+Math.floor(Math.random()*1e9);
  for(let index=0;index<total;index++)
   await this.transport.send({type:'yjs-chunk',room:this.room,transferId,index,total,
    data:data.slice(index*PIECE,(index+1)*PIECE)});
  return total;
 }
 #acceptPart(part){
  if(typeof part.transferId!=='string'||!/^[A-Za-z0-9-]{8,80}$/.test(part.transferId)||
   !Number.isInteger(part.index)||!Number.isInteger(part.total)||
   part.total<2||part.total>MAX_PARTS||part.index<0||part.index>=part.total||
   typeof part.data!=='string'||part.data.length<1||part.data.length>PIECE||
   !/^[A-Za-z0-9+/=]+$/.test(part.data))
   throw Error('Fragmento Yjs inválido');
  const now=Date.now();
  for(const [id,item] of this.parts)if(now-item.created>120000)this.parts.delete(id);
  let item=this.parts.get(part.transferId);
  if(!item){
   if(this.parts.size>=4)throw Error('Demasiadas transferencias parciales');
   item={created:now,total:part.total,chunks:Array(part.total).fill(null)};
   this.parts.set(part.transferId,item);
  }
  if(item.total!==part.total||
    (item.chunks[part.index]!==null&&item.chunks[part.index]!==part.data))
   throw Error('Fragmento de transferencia inconsistente');
  item.chunks[part.index]=part.data;
  if(item.chunks.some(chunk=>chunk===null))return null;
  this.parts.delete(part.transferId);
  return item.chunks.join('');
 }
 close(){this.parts.clear();this.doc.destroy()}
}
