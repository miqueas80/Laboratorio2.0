import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {openEdgeDB,readEdgeStore} from './next/storage.js';
import {EdgeSyncController} from './next/sync-controller.js';

async function harness(){
 const db=await openEdgeDB({indexedDB:new indexedDB.constructor()});
 const transport={confirmed:true,send:async()=>{}};
 const sync=new EdgeSyncController({db,actor:'actor-local-001',transport});
 await sync.load();
 return {db,sync,transport,close:()=>db.close()};
}
const event=(key,actor,clock,value,deleted=false)=>({key,actor,clock,deleted,value:deleted?null:value});
const packet=(...events)=>({type:'edge-events',events});

test('CRDT: incoming multi-event batch rejects invalid end without partial writes',async()=>{
 const h=await harness();
 try{
  const a=event('calendar:good1','actor-remote-01',1,{id:'good1',text:'A'});
  const b=event('documents:bad1','actor-remote-01',2,{id:'bad1',text:'B'});
  await assert.rejects(h.sync.receive(packet(a,b)),/no admitida|política/);
  assert.equal((await readEdgeStore(h.db,'calendar')).length,0);
  assert.equal((await readEdgeStore(h.db,'mutation_log')).length,0);
  assert.equal(h.sync.read('calendar','good1'),null);
 }finally{h.close()}
});
test('CRDT: losing concurrent revisions survive reload and idempotent replay',async()=>{
 const h=await harness();
 try{
  await h.sync.mutate('calendar','shared1',{id:'shared1',text:'Original'},{broadcast:false});
  const loser=event('calendar:shared1','actor-AAA-001',1,{id:'shared1',text:'Loser'});
  const result=await h.sync.receive(packet(loser));
  // actor-local-001 > actor-AAA-001 at equal Lamport clock
  assert.equal(result.conflicts,1);
  assert.equal(h.sync.read('calendar','shared1').text,'Original');
  assert.equal((await readEdgeStore(h.db,'mutation_log')).length,2);
  const replay=await h.sync.receive(packet(loser));
  assert.equal(replay.replayed,1);
  assert.equal((await readEdgeStore(h.db,'mutation_log')).length,2);
  const restarted=new EdgeSyncController({db:h.db,actor:'actor-local-001',transport:h.transport});
  await restarted.load();
  assert.equal(restarted.read('calendar','shared1').text,'Original');
  assert.equal((await readEdgeStore(h.db,'calendar')).length,1);
 }finally{h.close()}
});
test('CRDT: changing a previously observed version is detected, never persisted',async()=>{
 const h=await harness();
 try{
  const original=event('calendar:evt2','actor-remote-02',5,{id:'evt2',text:'Legitimate'});
  await h.sync.receive(packet(original));
  const changed=event('calendar:evt2','actor-remote-02',5,{id:'evt2',text:'Forged'});
  await assert.rejects(h.sync.receive(packet(changed)),/alterada|inconsistente/);
  assert.equal(h.sync.read('calendar','evt2').text,'Legitimate');
  assert.equal((await readEdgeStore(h.db,'mutation_log')).length,1);
 }finally{h.close()}
});
test('CRDT: duplicate keys within a batch cannot rewrite one revision',async()=>{
 const h=await harness();
 try{
  const old=event('calendar:task88','actor-remote-03',9,{id:'task88',text:'First'});
  const tampered=event('calendar:task88','actor-remote-03',9,{id:'task88',text:'Second'});
  await assert.rejects(h.sync.receive(packet(old,tampered)),/alterada|inconsistente/);
  assert.equal((await readEdgeStore(h.db,'mutation_log')).length,0);
  assert.equal(h.sync.read('calendar','task88'),null);
 }finally{h.close()}
});
test('CRDT: failed IndexedDB transaction leaves live replica unchanged',async()=>{
 const h=await harness();
 try{
  const invalid=event('calendar:task1','actor-remote-04',1,{id:'task1',nested:{x:1}});
  await h.sync.receive(packet(invalid));
  const oldCount=(await readEdgeStore(h.db,'mutation_log')).length;
  await assert.rejects(h.sync.receive(packet(event('calendar:new1','actor-remote-04',2,{id:'new1',value:()=>1}))));
  assert.equal((await readEdgeStore(h.db,'mutation_log')).length,oldCount);
  assert.equal(h.sync.read('calendar','new1'),null);
 }finally{h.close()}
});
test('CRDT: serializes simultaneous local writes and tracks versions on restart',async()=>{
 const h=await harness();
 try{
  const writes=await Promise.all(Array.from({length:9},(_,i)=>
   h.sync.mutate('calendar','task'+i,{id:'task'+i,text:'Task '+i},{broadcast:false})
  ));
  assert.equal(new Set(writes.map(v=>v.clock)).size,9);
  const old=(await readEdgeStore(h.db,'mutation_log')).length;
  assert.equal(old,9);
  const again=new EdgeSyncController({db:h.db,actor:'actor-local-001',transport:h.transport});
  await again.load();
  const next=await again.mutate('calendar','task10',{id:'task10',text:'Task 10'},{broadcast:false});
  assert.equal(next.clock,10);
 }finally{h.close()}
});


test('CRDT bloquea por defecto ediciones de inventario desde otros equipos',async()=>{
 const h=await harness();
 try{
  const chemical=event('inventory:NEXUS-X-0001','actor-REMOTE-15',1,{
   id:'NEXUS-X-0001',name:'Cambio externo no autorizado'
  });
  await assert.rejects(h.sync.receive(packet(chemical)),/autorización explícita/);
  assert.equal((await readEdgeStore(h.db,'inventory')).length,0);
  assert.equal((await readEdgeStore(h.db,'mutation_log')).length,0);
  const authorized=new EdgeSyncController({
   db:h.db,actor:'actor-local-001',transport:h.transport,allowRemoteInventory:true
  });
  await authorized.load();
  assert.equal((await authorized.receive(packet(chemical))).changed,1);
  assert.equal(authorized.read('inventory','NEXUS-X-0001').name,'Cambio externo no autorizado');
 }finally{h.close()}
});
