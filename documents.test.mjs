import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {File} from 'node:buffer';
import {harness,root,master} from './harness.mjs';

test('rechaza vacío, formato no permitido, PDF falso y tamaño excesivo',async()=>{
 const h=harness();try{
  for(const file of [new File([],'vacio.txt'),new File(['malicioso'],'a.html'),new File(['no pdf'],'a.pdf'),new File([new Uint8Array(16*1024*1024+1)],'grande.txt')])await assert.rejects(h.api.indexLocalFile(file));
  assert.equal(h.api.state.docs.length,0);
 }finally{h.close()}
});
test('un archivo dañado no bloquea la siguiente carga y los homónimos no se sobrescriben',async()=>{
 const h=harness();try{
  await assert.rejects(h.api.indexLocalFile(new File(['no ZIP'],'mal.docx')));
  const a=await h.api.indexLocalFile(new File(['Átomos y materia'],'seguridad.txt',{type:'text/plain'}));
  const duplicate=await h.api.indexLocalFile(new File(['Átomos y materia'],'seguridad.txt',{type:'text/plain'}));assert.equal(duplicate.duplicate,true);
  const b=await h.api.indexLocalFile(new File(['Contenido diferente'],'seguridad.txt',{type:'text/plain'}));assert.notEqual(a.path,b.path);
  const docs=await h.api.getCachedDocs();assert.equal(docs.length,2);assert.ok(docs.some(x=>x.text==='Átomos y materia'));
 }finally{h.close()}
});
test('Word maestro real se lee con JSZip local, conserva 111 IDs y separa observaciones',async()=>{
 const h=harness({stored:master.records});try{
  await h.api.loadMaster();h.loadVendor('jszip.min.js');h.window.confirm=()=>true;
  const file=new File([fs.readFileSync(new URL('Sustancias_Lab_BASE_NEXUS-X.docx',root))],'maestro.docx');
  await h.api.importWord(file);assert.equal(h.api.state.docs.length,1,h.errors.join('\n'));assert.equal(h.api.state.inventory.length,111);
  assert.equal(h.api.state.inventory[0].id,'NEXUS-X-0001');assert.equal(h.api.state.inventory[0].formula,'HNO3');assert.ok(h.api.state.inventory[0].name.includes('Nítrico'));
 }finally{h.close()}
});
test('Excel original se lee con SheetJS local e importa nombres no vacíos',async()=>{
 const h=harness({stored:master.records});try{
  await h.api.loadMaster();h.loadVendor('xlsx.full.min.js');h.window.confirm=()=>true;let reads=0;const reader=h.window.XLSX.read;h.window.XLSX.read=(...args)=>{reads++;return reader(...args)};
  const file=new File([fs.readFileSync(new URL('Sustancias_Lab. de CN_.xlsx',root))],'original.xlsx');
  await h.api.importExcel(file);assert.equal(reads,1,'El libro debe analizarse sólo una vez');assert.equal(h.api.state.inventory.length,111,h.errors.join('\n'));
  // 128 filas físicas: 111 registros y 17 vacías.
  assert.equal(h.api.state.inventory[0].source,'');assert.equal(h.api.state.docs.length,1);
  assert.ok(h.window.localStorage.getItem('nexus_x_inventory_recovery_v1'),h.errors.join('\n'));assert.ok(h.api.state.inventory.every(r=>r.name.trim()));
 }finally{h.close()}
});
