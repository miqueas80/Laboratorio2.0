import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {buildIndex,searchIndex,tokenize} from './next/search-core.js';
import {visibleRange} from './next/virtual-list.js';
import {validCAS,inspectSafety,evaluateStorage} from './next/chemical-engine.js';
import {openEdgeDB,readEdgeStore,atomicEdgeWrites,migrateInventory,inspectMigration} from './next/storage.js';
import {compilePlan,runTransactionalPlan} from './next/agent-dag.js';
import {createReplica,setRegister,mergeRegister,readRegister,exportReplica} from './next/sync-core.js';
import {LocalTelemetry} from './next/telemetry.js';
import {VoiceBargeInGate} from './next/voice-guard.js';
import fs from 'node:fs';

test('BM25 categoriza referencias reales y preserva números CAS exactos',()=>{
 const idx=buildIndex([{id:'a',text:'Ácido nítrico HNO3 CAS 7697-37-2'},{id:'b',text:'Matraz Erlenmeyer para mezclar'}, {id:'c',text:'Pipeta de vidrio'}]);
 assert.deepEqual(tokenize('CAS 7697-37-2'),['cas','7697-37-2']);
 assert.equal(searchIndex(idx,'ácido nítrico')[0].id,'a');
 assert.equal(searchIndex(idx,'7697-37-2')[0].id,'a');
 assert.equal(searchIndex(idx,'erlenmeyer')[0].id,'b');
 assert.equal(searchIndex(idx,'materia galáctica').length,0);
});
test('Índice vectorial local usa coseno sólo con vectores válidos',()=>{
 const idx=buildIndex([{id:'a',text:'vaso',vector:[1,0]},{id:'b',text:'matraz',vector:[0,1]}],{dimension:2});
 assert.equal(searchIndex(idx,'',{vector:[0,1]})[0].id,'b');
 assert.throws(()=>searchIndex(idx,'',{vector:[1,2,3]}),/Dimensión/);
});
test('Lista masiva sólo renderiza el rango visible',()=>{
 const top=visibleRange({count:100000,scrollTop:48000,viewportHeight:600,rowHeight:48,overscan:8});
 assert.ok(top.end-top.start<40);assert.ok(top.start>0);
 assert.equal(top.top+top.bottom+(top.end-top.start)*48,4800000);
 assert.equal(visibleRange({count:0}).end,0);
});
test('CAS checksum y SDS verificada: sustancias desconocidas no son seguras por omisión',()=>{
 assert.equal(validCAS('64-17-5'),true);assert.equal(validCAS('7697-37-2'),true);assert.equal(validCAS('64-17-6'),false);
 assert.equal(inspectSafety({name:'Ácido nítrico'}).valid,false);
 assert.equal(inspectSafety({safety:{verified:true,source:'SDS 2026',cas:'64-17-5',ghs:['GHS02'],H:['H225'],P:['P210'],hazardClasses:['flammable']}}).valid,true);
});
test('Segregación química exige clase de peligro y ubicación verificadas',()=>{
 const row=(id,classes,location)=>({id,location,safety:{verified:true,source:'SDS '+id,hazardClasses:classes}});
 const result=evaluateStorage([row('a',['oxidizer'],'Armario A'),row('b',['flammable'],'armario a'),row('c',['flammable'],'B'),{id:'d',name:'etiqueta incierta',location:'Armario A'}]);
 assert.equal(result.alerts.length,1);assert.equal(result.alerts[0].code,'OXIDIZER_FLAMMABLE');
 assert.equal(result.alerts[0].severity,'critical');assert.equal(result.unverified.length,1);
 assert.match(result.disclaimer,/NO demuestra/i);
});
test('DAG ordena dependencias y rechaza ciclos / herramientas no registradas',()=>{
 const registry={read:{prepare:async()=>({value:1})}};
 assert.deepEqual(compilePlan([{id:'second',tool:'read',dependsOn:['first']},{id:'first',tool:'read'}],registry).map(n=>n.id),['first','second']);
 assert.throws(()=>compilePlan([{id:'a',tool:'read',dependsOn:['b']},{id:'b',tool:'read',dependsOn:['a']}],registry),/ciclo/);
 assert.throws(()=>compilePlan([{id:'a',tool:'bad'}],registry),/no registrada/);
});
test('DAG prepara los cambios y los revierte al fallar antes de COMMIT',async()=>{
 let called=0;const registry={
  lookup:{prepare:async()=>({value:{valid:true}})},
  save:{write:true,prepare:async()=>({value:{ok:true},writes:[{store:'calendar',value:{id:'task-1',text:'revisar'}}]})},
  fail:{prepare:async()=>{throw Error('LENS_FAILED')}}
 };
 const nodes=[{id:'a',tool:'lookup'},{id:'b',tool:'save',dependsOn:['a']},{id:'c',tool:'fail',dependsOn:['b']}];
 const denied=await runTransactionalPlan(nodes,{registry,commit:async()=>{called++}});
 assert.equal(denied.reason,'CONFIRMATION_REQUIRED');
 const failed=await runTransactionalPlan(nodes,{registry,approved:true,commit:async()=>{called++}});
 assert.equal(failed.ok,false);assert.equal(failed.committed,0);assert.equal(called,0);
});
test('IndexedDB experimental: migración dry-run y escritura transaccional reversible',async()=>{
 const records=JSON.parse(fs.readFileSync('inventory.json','utf8')).records;
 const db=await openEdgeDB({indexedDB});
 try{
  assert.equal(inspectMigration(records).ready,true);
  assert.equal((await migrateInventory(db,records)).dryRun,true);
  assert.equal((await readEdgeStore(db,'inventory')).length,0);
  const result=await migrateInventory(db,records,{dryRun:false});
  assert.equal(result.copied,true);
  assert.equal((await readEdgeStore(db,'inventory')).length,111);
  assert.equal((await migrateInventory(db,records,{dryRun:false})).copied,false);
 }finally{db.close()}
});
test('DAG write set en IndexedDB es atómico y no permite efectos externos',async()=>{
 const db=await openEdgeDB({indexedDB});
 try{
  const registry={
   read:{prepare:async()=>({value:{name:'Frasco'}})},
   calendar:{write:true,prepare:async({results})=>({value:'created',writes:[{store:'calendar',value:{id:'evt-1',text:results.scan.name}}]})},
   remote:{external:true,prepare:async()=>({value:'bad'})}
  };
  const ok=await runTransactionalPlan([{id:'scan',tool:'read'},{id:'save',tool:'calendar',dependsOn:['scan']}],{registry,approved:true,commit:ops=>atomicEdgeWrites(db,ops)});
  assert.equal(ok.committed,1);assert.equal((await readEdgeStore(db,'calendar')).length,1);
  const denied=await runTransactionalPlan([{id:'x',tool:'remote'}],{registry,commit:ops=>atomicEdgeWrites(db,ops)});
  assert.equal(denied.ok,false);
  assert.equal((await readEdgeStore(db,'calendar')).length,1);
 }finally{db.close()}
});
test('CRDT replica merges son deterministas y borrados convergen',()=>{
 const a=createReplica('actor-001'),b=createReplica('actor-002');
 const e1=setRegister(a,'x',{name:'a'}),e2=setRegister(b,'x',{name:'b'});
 mergeRegister(a,e2);mergeRegister(b,e1);
 assert.deepEqual(readRegister(a,'x'),readRegister(b,'x'));
 const del=setRegister(a,'x',null,{deleted:true});mergeRegister(b,del);
 assert.equal(readRegister(b,'x'),null);
 mergeRegister(a,del);assert.deepEqual(exportReplica(a),exportReplica(b));
});
test('Telemetría local redacta secretos y respeta límites',()=>{
 const t=new LocalTelemetry({max:10,now:()=> '2026-10-08'});
 for(let i=0;i<14;i++)t.log('info','test',{text:'Bearer abcdef012345',i});
 assert.equal(t.snapshot().length,10);assert.doesNotMatch(JSON.stringify(t.snapshot()),/abcdef012345/);
});
test('Barge-in energy gate no dispara estando inactivo',()=>{
 let count=0,clock=1000;const gate=new VoiceBargeInGate({frames:2,onInterrupt:()=>count++,clock:()=>clock});
 assert.equal(gate.feed(Float32Array.of(.6,.6)),false);
 gate.setSpeaking(true);gate.feed(Float32Array.of(.6,.6));
 assert.equal(gate.feed(Float32Array.of(.6,.6)),true);
 assert.equal(count,1);clock+=100;
 assert.equal(gate.feed(Float32Array.of(.6,.6)),false);
});

test('100.001 filas: DOM virtual contiene sólo filas cercanas al viewport',async()=>{
 const {JSDOM}=await import('jsdom');
 const {createVirtualList}=await import('./next/virtual-list.js');
 const dom=new JSDOM('<div id="list"></div>');
 try{
  const target=dom.window.document.querySelector('#list');
  Object.defineProperty(target,'clientHeight',{value:320});
  const virtual=createVirtualList(target,{rowHeight:40,overscan:6,renderRow:(row)=>{
   const el=dom.window.document.createElement('div');el.textContent=row.id;return el;
  }});
  virtual.setRows(Array.from({length:100001},(_,i)=>({id:'NX-'+i})));
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(target.querySelectorAll('div').length<45);
  target.scrollTop=40*55000;target.dispatchEvent(new dom.window.Event('scroll'));
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(target.textContent.includes('NX-55000'));
  assert.ok(target.querySelectorAll('div').length<45);
  virtual.close();
 }finally{dom.window.close()}
});

test('IndexedDB revierte todas las escrituras ante una mutación inválida',async()=>{
 const db=await openEdgeDB({indexedDB});
 try{
  const before=(await readEdgeStore(db,'calendar')).length;
  await assert.rejects(atomicEdgeWrites(db,[
   {store:'calendar',value:{id:'safe-rollback-test',text:'temp'}},
   {store:'calendar',value:{text:'sin clave primaria'}}
  ]));
  const after=await readEdgeStore(db,'calendar');
  assert.equal(after.length,before);
  assert.equal(after.some(e=>e.id==='safe-rollback-test'),false);
 }finally{db.close()}
});
