import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {openEdgeDB,readEdgeStore} from './next/storage.js';
import {EdgeSyncController} from './next/sync-controller.js';
import {semanticCacheStatus,prepareSemanticAssets} from './next/model-provisioner.js';
import {frameMetrics} from './next/benchmarks.js';
import {openDexieEdge} from './next/dexie-adapter.js';

test('Sincronización no pierde cambio local si la red falla después del COMMIT',async()=>{
 const db=await openEdgeDB({indexedDB:new indexedDB.constructor()});
 try{
  const ctrl=new EdgeSyncController({db,actor:'device-RESILIENCE',transport:{confirmed:true,send:async()=>{throw Error('wifi lost')}}});
  const event=await ctrl.mutate('calendar','event10',{id:'event10',text:'Preparar muestra'});
  assert.equal(event.key,'calendar:event10');
  assert.equal(event.pending,true);assert.match(event.deliveryError,/wifi lost/);
  assert.equal((await readEdgeStore(db,'calendar')).length,1);
  assert.equal((await readEdgeStore(db,'mutation_log')).length,1);
  const outbound=[];ctrl.transport={confirmed:true,send:async p=>outbound.push(p)};
  const sync=await ctrl.sendSnapshot();assert.equal(sync.sent,1);
  assert.equal(outbound[0].events[0].key,'calendar:event10');
 }finally{db.close()}
});
test('Benchmarks reportan 60 FPS solo cuando hay muestras físicas y conservan p95',()=>{
 const fast=frameMetrics([0,16,32,48,64,80,96,112,128,144,160]);
 assert.ok(fast.averageFPS>=60);assert.equal(fast.metTarget,true);
 const slow=frameMetrics([0,16,32,70,110,160]);
 assert.equal(slow.metTarget,false);assert.ok(slow.p95FrameMs>16);
 assert.throws(()=>frameMetrics([]),/inválidas/);
});
test('Modelo semántico no instalado reporta ausente sin descargar ni crear fuentes externas',async()=>{
 let outbound=0;
 const cache={open:async()=>({match:async()=>null})};
 const status=await semanticCacheStatus({cacheStorage:cache});
 assert.equal(status.installed,false);assert.equal(status.files,0);
 await assert.rejects(prepareSemanticAssets({
  cacheStorage:cache,storage:{estimate:async()=>({quota:1000,usage:900})},
  cryptoObject:globalThis.crypto,fetcher:async()=>{outbound++}
 }),/insuficiente/);
 assert.equal(outbound,0);
});
test('Dexie nunca acepta el nombre de la base de datos de producción',async()=>{
 class FakeDexie{
  constructor(name){this.name=name}
  version(){return {stores:()=>{}}}
  async open(){}
  close(){}
  table(){return {toArray:async()=>[]}}
  async transaction(_mode,...args){return args.at(-1)()}
 }
 await assert.rejects(openDexieEdge({Dexie:FakeDexie,dbName:'NEXUS_X_DOCUMENTS_V2'}),/no se puede abrir producción/);
 const adapter=await openDexieEdge({Dexie:FakeDexie});
 assert.equal((await adapter.all('inventory')).length,0);
 assert.deepEqual(await adapter.commit([]),{committed:0});
 await assert.rejects(adapter.commit([{store:'unexpected',value:{id:'1'}}]),/Tabla desconocida/);
 adapter.close();
});
test('Modelo de alta demanda debe fallar sin recursos; no existe fallback a servidores externos',async()=>{
 let fetchCount=0;
 const fakeCache={open:async()=>({match:async()=>null})};
 await assert.rejects(prepareSemanticAssets({
  cacheStorage:fakeCache,
  cryptoObject:globalThis.crypto,
  storage:{estimate:async()=>({quota:999999999,usage:0})},
  fetcher:async()=>{fetchCount++;return new Response('no disponible',{status:404})}
 }),/No se pudo descargar/);
 assert.equal(fetchCount,1);
});
