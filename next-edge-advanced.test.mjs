import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {webcrypto} from 'node:crypto';
import {HNSWIndex} from './next/hnsw.js';
import {newIdentity,derivePairing,encryptPacket,decryptPacket} from './next/p2p-crypto.js';
import {openEdgeDB,readEdgeStore} from './next/storage.js';
import {EdgeSyncController} from './next/sync-controller.js';
import {inspectAndSchedule} from './next/inspection-dag.js';

test('HNSW ordena vecinos, revisa dimensiones y respeta la consulta vectorial',()=>{
 const graph=new HNSWIndex({dimension:3,m:5,efSearch:40});
 graph.addAll([
  {id:'acid',vector:[1,0,0]},
  {id:'matraz',vector:[0,1,0]},
  {id:'pipeta',vector:[0,0,1]},
  {id:'similar',vector:[.95,.1,.05]}
 ]);
 const nearest=graph.search([1,0,0],{k:2,ef:20});
 assert.equal(nearest[0].id,'acid');
 assert.ok(nearest.some(x=>x.id==='similar'));
 assert.equal(graph.stats().count,4);
 assert.throws(()=>graph.search([1,0]),/Dimensión/);
 assert.throws(()=>graph.insert('acid',[1,0,0]),/duplicado/);
});

test('HNSW indexa 400 vectores sin bloquear ni perder la consulta exacta',()=>{
 const graph=new HNSWIndex({dimension:8,m:8,efConstruction:24,efSearch:32});
 const rows=Array.from({length:400},(_,i)=>{
  const values=Array.from({length:8},(_,j)=>Math.sin(i*1.23+j*2.71)+Math.cos(i+j));
  return {id:'v-'+String(i).padStart(4,'0'),vector:values};
 });
 graph.addAll(rows);
 const exact=graph.search(rows[271].vector,{k:1,ef:80})[0];
 assert.equal(exact.id,rows[271].id);
});

test('WebCrypto: dos extremos generan mismo código de verificación y cifran sin Internet',async()=>{
 const previous=globalThis.crypto;globalThis.crypto=webcrypto;
 try{
  const a=await newIdentity(),b=await newIdentity();
  const id='ece18550-98e4-47ce-a2f6-e08db0d87a10';
  const one=await derivePairing(a,b.publicKey,id),two=await derivePairing(b,a.publicKey,id);
  assert.equal(one.code,two.code);assert.match(one.code,/^\d{6}$/);
  const packet=await encryptPacket(one.key,{type:'edge-events',events:[{key:'calendar:a',clock:1}]});
  assert.deepEqual(await decryptPacket(two.key,packet),{type:'edge-events',events:[{key:'calendar:a',clock:1}]});
  await assert.rejects(decryptPacket(two.key,{...packet,data:packet.data.slice(0,-2)+'AA'}));
 }finally{globalThis.crypto=previous}
});

test('Dos bases IndexedDB separadas convergen mediante cambios CRDT explícitos',async()=>{
 const dbA=await openEdgeDB({indexedDB:new indexedDB.constructor()});
 const dbB=await openEdgeDB({indexedDB:new indexedDB.constructor()});
 try{
  let a,b;
  const ta={confirmed:true,send:async packet=>b.receive(packet)};
  const tb={confirmed:true,send:async packet=>a.receive(packet)};
  a=new EdgeSyncController({db:dbA,actor:'device-A01',transport:ta});
  b=new EdgeSyncController({db:dbB,actor:'device-B02',transport:tb});
  await a.load();await b.load();
  await a.mutate('calendar','event001',{id:'event001',text:'Revisar laboratorio',date:'2026-10-09'});
  assert.equal(b.read('calendar','event001').text,'Revisar laboratorio');
  await b.mutate('calendar','event001',{id:'event001',text:'Revisar laboratorio y guantes',date:'2026-10-09'});
  assert.deepEqual(a.read('calendar','event001'),b.read('calendar','event001'));
  await a.mutate('calendar','event001',null,{deleted:true});
  assert.equal(b.read('calendar','event001'),null);
  assert.equal((await readEdgeStore(dbB,'calendar')).length,0);
  await a.sendSnapshot();await b.sendSnapshot();
  assert.deepEqual(a.read('calendar','event001'),b.read('calendar','event001'));
  const reloaded=new EdgeSyncController({db:dbB,actor:'device-B02',transport:tb});
  await reloaded.load();assert.equal(reloaded.read('calendar','event001'),null);
 }finally{dbA.close();dbB.close()}
});

test('Sync rechaza registros no autenticados y stores ajenas al sistema experimental',async()=>{
 const db=await openEdgeDB({indexedDB:new indexedDB.constructor()});
 try{
  const c=new EdgeSyncController({db,actor:'device-C03',transport:{confirmed:false}});
  await assert.rejects(c.mutate('production','x',{id:'x'}),/política/);
  await assert.rejects(c.receive({type:'edge-events',events:[]}),/verificado/);
  c.transport.confirmed=true;
  await assert.rejects(c.receive({type:'edge-events',events:[{key:'documents:main',actor:'intruder007',clock:99,deleted:false,value:{id:'main'}}]}),/no admitida/);
  assert.equal((await readEdgeStore(db,'inventory')).length,0);
 }finally{db.close()}
});

test('DAG de laboratorio solo crea recordatorio si el QR exacto registra vencimiento',async()=>{
 const db=await openEdgeDB({indexedDB:new indexedDB.constructor()});
 try{
  const records=[{id:'NEXUS-X-0001',name:'Ácido nítrico',formula:'HNO3',expiry:'2020-01-01',safety:{verified:true,source:'SDS validada',hazardClasses:['oxidizer']}}];
  const docs=[{recordId:'NEXUS-X-0001',name:'SDS validada',path:'sds/nitric.pdf',verifiedSDS:true}];
  const opts={db,inventory:records,documents:docs,today:new Date(2026,9,8)};
  const denied=await inspectAndSchedule({...opts,observation:{code:'NEXUS-X-0001'},approved:false});
  assert.equal(denied.reason,'CONFIRMATION_REQUIRED');
  assert.equal((await readEdgeStore(db,'calendar')).length,0);
  const ok=await inspectAndSchedule({...opts,observation:{code:'NEXUS-X-0001'},approved:true});
  assert.equal(ok.ok,true);
  assert.equal(ok.results.match.id,'NEXUS-X-0001');
  assert.equal(ok.results.safety.available,true);
  assert.equal(ok.results.expiry.state,'expired');
  assert.equal(ok.results.reminder.created,true);
  assert.equal((await readEdgeStore(db,'calendar')).length,1);
 }finally{db.close()}
});

test('DAG rechaza inferir identidad química a partir de texto visible sin QR',async()=>{
 const db=await openEdgeDB({indexedDB:new indexedDB.constructor()});
 try{
  const records=[{id:'NEXUS-X-0001',name:'Ácido nítrico',expiry:'2020-01-01'}];
  const out=await inspectAndSchedule({db,inventory:records,observation:{visibleText:'ácido nítrico'},approved:true});
  assert.equal(out.ok,true);assert.equal(out.results.match,null);
  assert.equal(out.results.reminder.created,false);
  assert.equal((await readEdgeStore(db,'calendar')).length,0);
 }finally{db.close()}
});
