import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';

test('NEXUS Knowledge está disponible localmente, sin red ni modelos externos',()=>{
 const h=harness({online:false,fetcher:()=>{throw Error('No debe usar red')}});
 try{
  const k=h.window.NexusKnowledge;assert.ok(k?.find);
  assert.deepEqual(Array.from(k.terms('Nexus, explicame qué es ácido nítrico')),['acido','nitrico']);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('recuperación local: registros canónicos con acentos y pequeñas erratas',()=>{
 const h=harness({online:false,stored:master.records});
 try{
  const k=h.window.NexusKnowledge,items=master.records;
  const exact=k.find('ácido nítrico',{inventory:items});
  assert.equal(exact.supported,true);
  assert.equal(exact.type,'inventory');
  assert.match(exact.record.name,/nítrico/i);
  const typo=k.find('acido nitrico',{inventory:items});
  assert.equal(typo.supported,true);
  assert.equal(typo.record.id,exact.record.id);
  const misspelling=k.find('acido nitrco',{inventory:items});
  assert.equal(misspelling.supported,true);
  assert.equal(misspelling.record.id,exact.record.id);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('NEXUS no inventa evidencia para una consulta sin relación',()=>{
 const h=harness({online:false,stored:master.records});
 try{
  const result=h.window.NexusKnowledge.find('quasar diamante galactico',{inventory:master.records});
  assert.equal(result.supported,false);
  const answer=h.api.localAssistantResponse?.('Nexus explicame el quasar diamante galáctico');
  if(answer)assert.match(answer,/no encontr[eé] evidencia/i);
 }finally{h.close()}
});

test('documentos locales: evidencia con origen exacto, sin confundirla con una explicación generativa',async()=>{
 const h=harness({online:false,stored:master.records});
 try{
  await h.api.loadMaster();
  h.api.state.docs=[{name:'Guía de formación de óxidos.pdf',path:'docs/guia-oxidos.pdf',
    chunks:['Introducción: la formación de óxidos ocurre al combinar oxígeno con otros elementos. Hay varios tipos de óxidos y reglas de nomenclatura.']}];
  const evidence=h.window.NexusKnowledge.find('formación de óxidos',{inventory:[],documents:h.api.state.docs});
  assert.equal(evidence.supported,true);
  assert.equal(evidence.type,'document');
  assert.equal(evidence.source,'docs/guia-oxidos.pdf');
  assert.match(evidence.excerpt,/formación de óxidos/i);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('seguimiento local recuerda sustancia de inventario para fórmula y ubicación',async()=>{
 const h=harness({online:false,stored:master.records});
 try{
  await h.api.loadMaster();
  const target=master.records.find(x=>/ácido nítrico/i.test(x.name));
  assert.ok(target);
  const first=await h.api.nexusAgentTurn('Nexus, buscá en inventario ácido nítrico');
  assert.equal(first.route,'LOCAL');
  assert.equal(first.actions[0].result.ok,true);
  const follow=await h.api.nexusAgentTurn('Nexus, ¿y su fórmula?');
  assert.equal(follow.route,'LOCAL');
  assert.match(follow.answer,/fórmula registrada|no tiene una fórmula cargada/i);
  assert.match(follow.answer,new RegExp(target.name,'i'));
  const location=await h.api.nexusAgentTurn('Nexus, ¿y dónde está?');
  assert.equal(location.route,'LOCAL');
  assert.match(location.answer,/ubicación registrada|no tiene ubicación cargada/i);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('seguimiento sin entidad previa pide aclaración y jamás inventa un registro',async()=>{
 const h=harness({online:false,stored:master.records});
 try{
  await h.api.loadMaster();
  const answer=await h.api.nexusAgentTurn('Nexus, ¿y su fórmula?');
  assert.equal(answer.route,'LOCAL');assert.match(answer.answer,/de qué sustancia/i);
  assert.equal(answer.actions.length,0);
 }finally{h.close()}
});


test('Internet no desplaza la evidencia local sobre una sustancia real',async()=>{
 const h=harness({online:true,stored:master.records,fetcher:()=>{throw Error('No se debe consultar el Gateway para evidencia local')}});
 try{
  await h.api.loadMaster();h.api.state.web=true;
  const result=await h.api.nexusAgentTurn('Nexus, qué es ácido nítrico');
  assert.equal(result.route,'LOCAL');
  assert.match(result.answer,/inventario local/i);
  assert.match(result.answer,/ácido nítrico/i);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('Consulta ambigua no inventa identidad de un ácido ni una ubicación',async()=>{
 const h=harness({online:false,stored:master.records});
 try{
  await h.api.loadMaster();
  const evidence=h.window.NexusKnowledge.find('ácido',{inventory:master.records});
  assert.equal(evidence.supported,false);
  assert.equal(evidence.reason,'ambiguous-inventory');
  const answer=await h.api.nexusAgentTurn('Nexus, qué es ácido',{localOnly:true});
  assert.doesNotMatch(answer.answer,/código NEXUS-X-\d{4}/i);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('NEXUS explica capacidades reales y conversa igual con Internet ON',async()=>{
 const h=harness({online:true,stored:master.records,fetcher:()=>{throw Error('La ayuda es local')}});
 try{
  await h.api.loadMaster();h.api.state.web=true;
  const help=await h.api.nexusAgentTurn('Nexus, qué podés hacer');
  assert.equal(help.route,'LOCAL');
  assert.match(help.answer,/voz funciona localmente|sin Internet/i);
  assert.match(help.answer,/Lens/i);
  const thanks=await h.api.nexusAgentTurn('Nexus, gracias',{localOnly:true});
  assert.equal(thanks.route,'LOCAL');
  assert.match(thanks.answer,/de nada/i);
  assert.equal(h.calls.length,0);
 }finally{h.close()}
});

test('NEXUS no confunde preguntar qué es inventario con contar registros',async()=>{
 const h=harness({online:false,stored:master.records});
 try{
  await h.api.loadMaster();
  const explanation=await h.api.nexusAgentTurn('Nexus, qué es el inventario');
  assert.doesNotMatch(explanation.answer,/El inventario cargado contiene/i);
  const count=await h.api.nexusAgentTurn('Nexus, cuántos registros hay');
  assert.match(count.answer,/111 registros/i);
 }finally{h.close()}
});
