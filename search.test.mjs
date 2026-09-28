import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';

test('inventario: acentos, palabras parciales y plural conservan el resultado real',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();
  for(const q of ['ACIDO NITRICO','ácidos nítricos','nitrico','HNO3','NEXUS-X-0001'])assert.equal(h.api.searchLocal(q)[0]?.r.id,'NEXUS-X-0001',q);
  assert.equal(h.api.searchLocal('unicornio inexistente').length,0);
 }finally{h.close()}
});
test('documentos: nombre, contenido y plural; relaciones no inventan coincidencias',async()=>{
 const h=harness();try{
  await h.api.indexDocument({name:'seguridad.txt',path:'local:seguridad.txt',text:'Cada átomo contiene un núcleo.',type:'TXT'});
  assert.equal(h.api.documentSearch('seguridad').length,1);assert.equal(h.api.documentSearch('átomos').length,1);
  h.api.state.docs[0].relations=[{entityName:'unicornio'}];assert.equal(h.api.documentSearch('unicornio').length,0);
 }finally{h.close()}
});
test('las tres órdenes exigidas se resuelven localmente y abren la vista real',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();await h.api.indexDocument({name:'estructura.txt',path:'local:estructura.txt',text:'El átomo está formado por partículas.',type:'TXT'});
  await h.api.assistantAsk('Nexus, abre inventario.');assert.equal(h.api.state.view,'inventory');
  await h.api.assistantAsk('Nexus, busca ácido nítrico.');assert.equal(h.api.state.view,'inventory');assert.match(h.document.querySelector('#inventorySummary').textContent,/1 de 111/);
  await h.api.assistantAsk('Nexus, muéstrame documentos sobre átomos.');assert.equal(h.api.state.view,'documents');assert.match(h.document.querySelector('#documentList').textContent,/estructura/);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});
