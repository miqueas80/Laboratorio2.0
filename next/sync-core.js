/**
 * A narrow last-writer-wins register CRDT, not Yjs/Automerge collaboration.
 * Commutative, associative, idempotent merges for individual immutable records.
 * Transport/authentication/pairing MUST be implemented before device sync.
 */
const validActor=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{6,80}$/.test(id);
const compare=(a,b)=>a.clock===b.clock?a.actor.localeCompare(b.actor):a.clock-b.clock;
function validVersion(v){return v&&validActor(v.actor)&&Number.isSafeInteger(v.clock)&&v.clock>=0&&typeof v.key==='string'&&v.key.length>0&&v.key.length<=180&&typeof v.deleted==='boolean'}
export function createReplica(actor){
 if(!validActor(actor))throw Error('ID de actor inválido');
 return {actor,clock:0,entries:new Map()};
}
export function setRegister(replica,key,value,{deleted=false}={}){
 if(!replica||!validActor(replica.actor)||typeof key!=='string'||!key||key.length>180)throw Error('Registro inválido');
 replica.clock=Math.max(replica.clock,...[...replica.entries.values()].map(x=>x.clock))+1;
 const event={key,actor:replica.actor,clock:replica.clock,deleted:Boolean(deleted),value:deleted?null:structuredClone(value)};
 replica.entries.set(key,event);return structuredClone(event);
}
export function mergeRegister(replica,event){
 if(!validVersion(event))throw Error('Cambio remoto inválido');
 const local=replica.entries.get(event.key);
 replica.clock=Math.max(replica.clock,event.clock);
 if(!local||compare(event,local)>0)replica.entries.set(event.key,structuredClone(event));
 return replica.entries.get(event.key);
}
export function readRegister(replica,key){
 const row=replica.entries.get(key);
 return !row||row.deleted?null:structuredClone(row.value);
}
export function exportReplica(replica){return [...replica.entries.values()].map(x=>structuredClone(x))}
