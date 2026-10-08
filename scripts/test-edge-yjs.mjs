import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {indexedDB} from 'fake-indexeddb';
import {openEdgeDB,readEdgeStore} from '../next/storage.js';
import {YjsLabBoard} from '../next/yjs-lab.js';

const isolated=name=>({open:(_original,version)=>indexedDB.open(name,version)});
async function boards(){
 const db1=await openEdgeDB({indexedDB:isolated('NEXUS_EDGE_YJS_TEST_1')});
 const db2=await openEdgeDB({indexedDB:isolated('NEXUS_EDGE_YJS_TEST_2')});
 const a=new YjsLabBoard({Y,db:db1,room:'lab-course-4'});
 const b=new YjsLabBoard({Y,db:db2,room:'lab-course-4'});
 const ta={confirmed:true,send:payload=>b.receive(payload)};
 const tb={confirmed:true,send:payload=>a.receive(payload)};
 a.transport=ta;b.transport=tb;
 await Promise.all([a.load(),b.load()]);
 return {a,b,db1,db2,close:()=>{a.close();b.close();db1.close();db2.close()}};
}
test('Yjs comparte una tarea cifrable por transporte entre dos stores IndexedDB independientes',async()=>{
 const x=await boards();
 try{
  const local=await x.a.updateTask('task1',{title:'Preparar laboratorio',status:'pendiente'});
  assert.equal(local.committed,true);assert.equal(local.delivered,true);
  assert.equal(x.b.getTask('task1').title,'Preparar laboratorio');
  const remote=await x.b.updateTask('task1',{owner:'Cuarto año'});
  assert.equal(remote.delivered,true);
  assert.equal(x.a.getTask('task1').owner,'Cuarto año');
  assert.equal((await readEdgeStore(x.db1,'meta')).length,1);
  assert.equal((await readEdgeStore(x.db2,'meta')).length,1);
 }finally{x.close()}
});
test('Yjs reconcilia dos campos concurrentes editados sin red y recupera todo al reiniciar',async()=>{
 const x=await boards();
 try{
  await x.a.updateTask('shared',{title:'Original',notes:'sin notas'},{broadcast:true});
  x.a.transport.confirmed=false;x.b.transport.confirmed=false;
  await x.a.updateTask('shared',{title:'Nuevo título'},{broadcast:false});
  await x.b.updateTask('shared',{notes:'Nota del segundo equipo'},{broadcast:false});
  x.a.transport.confirmed=true;x.b.transport.confirmed=true;
  const ua=x.a.exportPacket(),ub=x.b.exportPacket();
  await x.a.receive(ub);await x.b.receive(ua);
  assert.deepEqual(x.a.getTask('shared'),x.b.getTask('shared'));
  assert.equal(x.a.getTask('shared').title,'Nuevo título');
  assert.equal(x.a.getTask('shared').notes,'Nota del segundo equipo');
  const restored=new YjsLabBoard({Y,db:x.db2,room:'lab-course-4',transport:x.b.transport});
  await restored.load();
  assert.deepEqual(restored.getTask('shared'),x.a.getTask('shared'));
  restored.close();
 }finally{x.close()}
});
test('Yjs rechaza campos no permitidos sin tocar el historial local',async()=>{
 const x=await boards();
 try{
  await assert.rejects(x.a.updateTask('bad',{chemicalHazard:'compatible'}),/no permitido/);
  await assert.rejects(x.a.updateTask('bad',{title:'x'.repeat(1200)}),/no permitido/);
  assert.equal(x.a.getTask('bad'),null);
  assert.equal((await readEdgeStore(x.db1,'meta')).length,0);
 }finally{x.close()}
});
test('Yjs no acepta mensajes de otras salas o pares no confirmados',async()=>{
 const x=await boards();
 try{
  const packet=x.a.exportPacket();
  await assert.rejects(x.b.receive({...packet,room:'other-room'}),/no permitida/);
  x.b.transport.confirmed=false;
  await assert.rejects(x.b.receive(packet),/Sin emparejamiento/);
  x.b.transport.confirmed=true;
  const rogue=new Y.Doc();
  rogue.getMap('tasks').set('evil',{title:'unsafe'});
  const str=btoa(String.fromCharCode(...Y.encodeStateAsUpdate(rogue)));
  await assert.rejects(x.b.receive({type:'yjs-state',room:'lab-course-4',data:str}),/Estructura Yjs no permitida/);
  assert.equal((await readEdgeStore(x.db2,'meta')).length,0);
  rogue.destroy();
 }finally{x.close()}
});
test('Yjs diferencia fallos de red posteriores a COMMIT y permite reenvío',async()=>{
 const x=await boards();
 try{
  x.a.transport={confirmed:true,send:async()=>{throw Error('enlace perdido')}};
  const r=await x.a.updateTask('pending',{title:'Preparar etiquetas'});
  assert.equal(r.committed,true);assert.equal(r.pending,true);
  assert.match(r.deliveryError,/enlace perdido/);
  assert.equal(x.a.getTask('pending').title,'Preparar etiquetas');
  x.a.transport={confirmed:true,send:p=>x.b.receive(p)};
  await x.a.sendSnapshot();
  assert.equal(x.b.getTask('pending').title,'Preparar etiquetas');
 }finally{x.close()}
});
