import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {readEdgeStore,openEdgeDB} from './next/storage.js';
import {NexusEdgeAgent,parseEdgeIntent} from './next/agent-runtime.js';

const inventory=[
 {id:'NEXUS-X-0001',name:'Ácido nítrico',formula:'HNO3',category:'reactivos'},
 {id:'NEXUS-X-0002',name:'Probeta graduada',category:'material de vidrio'},
 {id:'NEXUS-X-0003',name:'Matraz Erlenmeyer',category:'material de vidrio'}
];

test('Parser identifica cadena de navegación y búsqueda en español argentino',()=>{
 const p=parseEdgeIntent('Nexus, abrí inventario y buscá ácido nítrico');
 assert.equal(p.view,'inventory');assert.equal(p.navigate,true);assert.equal(p.search,true);
 assert.equal(p.query,'acido nitrico');
});
test('Planner DAG local lista herramientas sin hacer efectos de interfaz',async()=>{
 const agent=new NexusEdgeAgent({inventory});
 const plan=agent.plan('Nexus, abrí inventario y buscá ácido nítrico');
 assert.deepEqual(plan.nodes.map(n=>n.tool),['suggestView','findInventory']);
 assert.deepEqual(plan.nodes[1].dependsOn,['view']);
 const result=await agent.turn('Nexus, abrí inventario y buscá ácido nítrico');
 assert.equal(result.ok,true);
 assert.equal(result.viewRequest,'inventory');
 assert.equal(result.inventory[0].id,'NEXUS-X-0001');
 assert.equal(result.safeToExecute,false);
});
test('El asistente busca evidencia sin inventar una fórmula que no aparece',async()=>{
 const agent=new NexusEdgeAgent({inventory});
 const found=await agent.turn('Nexus, buscá probeta');
 assert.equal(found.inventory[0].name,'Probeta graduada');
 assert.equal(found.inventory[0].formula,null);
 const missing=await agent.turn('Nexus, buscá taquiones extraterrestres');
 assert.deepEqual(missing.inventory,[]);
 assert.match(missing.reply,/no encontré/i);
});
test('La pregunta por cantidad lee inventario real, no un conteo inventado',async()=>{
 const agent=new NexusEdgeAgent({inventory});
 const result=await agent.turn('Nexus, ¿cuántos registros tenemos en inventario?');
 assert.match(result.reply,/3 registros/);
 assert.equal(result.steps[0],'count');
});
test('Los documentos solo se citan si su Fabric los entrega',async()=>{
 const evidence=[{source:{path:'Unidad4.pdf',name:'Unidad 4'},excerpt:'Nomenclatura de óxidos',score:.8}];
 const fabric={query:async query=>{assert.match(query,/oxidos/);return {mode:'hybrid',evidence}}};
 const agent=new NexusEdgeAgent({inventory,fabric});
 const result=await agent.turn('Nexus, ¿qué documentos tenemos sobre óxidos?');
 assert.equal(result.ok,true);assert.equal(result.evidence.length,1);
 assert.equal(result.evidence[0].source.path,'Unidad4.pdf');assert.equal(result.mode,'hybrid');
 const absent=await new NexusEdgeAgent({inventory}).turn('Nexus, qué documentos tenemos sobre óxidos');
 assert.equal(absent.evidence.length,0);assert.match(absent.reply,/todavía no están indexados/i);
});
test('Las órdenes de modificación no pueden crear entradas ni ejecutar comandos externos',async()=>{
 const db=await openEdgeDB({indexedDB:new indexedDB.constructor()});
 try{
  const agent=new NexusEdgeAgent({inventory});
  const result=await agent.turn('Nexus, recuérdame agregar ácido nítrico mañana');
  assert.equal(result.ok,true);assert.equal(result.safeToExecute,false);
  assert.match(result.reply,/no realicé cambios/i);
  assert.equal((await readEdgeStore(db,'calendar')).length,0);
  assert.equal((await readEdgeStore(db,'inventory')).length,0);
 }finally{db.close()}
});
test('Seguridad química jamás certifica mezclas sin SDS verificada',async()=>{
 const agent=new NexusEdgeAgent({inventory});
 const result=await agent.turn('Nexus, ¿es seguro almacenar juntos oxidantes y combustibles?');
 assert.match(result.reply,/SDS verificadas/i);
 assert.equal(result.steps[0],'safetyGuard');
});
test('El asistente reconoce Lens como intención, pero no finge ejecutar una cámara inexistente',async()=>{
 const agent=new NexusEdgeAgent({inventory});
 const result=await agent.turn('Nexus, abrí Lens');
 assert.equal(result.ok,true);
 assert.equal(result.viewRequest,null);
});
test('Se rechazan entradas excesivas y IDs inventados duplicados',async()=>{
 assert.throws(()=>new NexusEdgeAgent({inventory:[inventory[0],inventory[0]]}),/ID único/);
 const agent=new NexusEdgeAgent({inventory});
 await assert.rejects(agent.turn('n'.repeat(1600)),/demasiado extensa/);
});
test('El agente devuelve evidencia estructurada y no navega sin autorización',async()=>{
 const agent=new NexusEdgeAgent({inventory});
 const result=await agent.turn('Nexus, abrí documentos');
 assert.equal(result.viewRequest,'documents');assert.equal(result.safeToExecute,false);
 assert.deepEqual(result.evidence,[]);
});
