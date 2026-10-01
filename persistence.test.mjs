import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';
import {IDBFactory} from 'fake-indexeddb';

test('actualización IndexedDB de v2 a v3 preserva documentos preexistentes',async()=>{
 const idb=new IDBFactory();await new Promise((resolve,reject)=>{const req=idb.open('NEXUS_X_DOCUMENTS_V2',2);req.onupgradeneeded=()=>req.result.createObjectStore('documents',{keyPath:'path'});req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({path:'local:anterior.txt',name:'anterior.txt',type:'TXT',text:'Documento único anterior',chunks:['Documento único anterior']});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)}});
 const h=harness({idb});try{const docs=await h.api.getCachedDocs();assert.equal(docs.length,1);assert.equal(docs[0].text,'Documento único anterior');const d=await h.api.collectDiagnostics();assert.equal(d.indexedDB.version,3);assert.equal(d.indexedDB.count,1)}finally{h.close()}
});

test('el arranque conserva altas y ediciones locales antes de consultar red',async()=>{
  const records=structuredClone(master.records); records[0].notes='CAMBIO LOCAL';records.push({...records[0],id:'NEXUS-X-0112',name:'QA LOCAL'});
  const h=harness({stored:records});try{await h.api.loadMaster();assert.equal(h.api.state.inventory.length,112);assert.equal(h.api.state.inventory[0].notes,'CAMBIO LOCAL');assert.equal(h.calls.length,0);}finally{h.close()}
});
test('inventario vacío guardado es un estado válido, no reinstala 111 filas',async()=>{
  const h=harness({stored:[]});try{await h.api.loadMaster();assert.equal(h.api.state.inventory.length,0);assert.equal(h.calls.length,0)}finally{h.close()}
});
test('quota: no se publica un alta ni se cierra el formulario si el guardado falla',async()=>{
  const h=harness();try{await h.api.loadMaster();h.api.newItem();h.document.querySelector('#fName').value='QA CUOTA';h.window.Storage.prototype.setItem=()=>{throw new DOMException('lleno','QuotaExceededError')};await h.api.saveItem();assert.equal(h.api.state.inventory.length,111);assert.ok(h.document.querySelector('#itemModal').classList.contains('open'));}finally{h.close()}
});
test('IndexedDB fallida no se anuncia como documento persistido',async()=>{
  const h=harness({idb:{open(){throw new Error('IndexedDB denegada')}}});try{await assert.rejects(h.api.indexDocument({name:'a.txt',path:'local:a.txt',text:'átomos',type:'TXT'}));assert.equal(h.api.state.docs.length,0)}finally{h.close()}
});
test('texto del chat ejecuta navegación local sin API key',async()=>{
  const h=harness();try{await h.api.loadMaster();h.api.bind();h.api.setView('ai');h.document.querySelector('#aiInput').value='Nexus, abre inventario.';await h.api.aiQuery();assert.equal(h.api.state.view,'inventory');assert.equal(h.calls.filter(x=>x.includes('googleapis')).length,0)}finally{h.close()}
});
test('datos corruptos se preservan y bloquean sobrescrituras',async()=>{
 const h=harness({stored:'{datos incompletos'});try{await h.api.loadMaster();assert.equal(h.window.localStorage.getItem('nexus_x_inventory_v1'),'{datos incompletos');assert.equal(h.api.state.inventoryReadOnly,true);assert.equal(h.api.saveInventory(master.records),false)}finally{h.close()}
});
test('conflicto entre pestañas no sobrescribe una versión más nueva',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();h.window.localStorage.setItem('nexus_x_inventory_v1','[]');assert.equal(h.api.saveInventory(master.records),false);assert.equal(h.window.localStorage.getItem('nexus_x_inventory_v1'),'[]')}finally{h.close()}
});
test('un alta con ID existente no modifica ese registro',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();h.api.newItem();h.document.querySelector('#fId').value='NEXUS-X-0001';h.document.querySelector('#fName').value='SOBRESCRITURA';assert.equal(h.api.saveItem(),false);assert.equal(h.api.state.inventory[0].name,master.records[0].name)}finally{h.close()}
});
test('guardar edición crea una copia anterior y sobrevive a reapertura',async()=>{
 const h=harness({stored:master.records});let raw;try{await h.api.loadMaster();h.api.openItem('NEXUS-X-0001');h.document.querySelector('#fNotes').value='persistido';assert.equal(h.api.saveItem(),true);raw=h.window.localStorage.getItem('nexus_x_inventory_v1');assert.equal(JSON.parse(h.window.localStorage.getItem('nexus_x_inventory_recovery_v1'))[0].notes,master.records[0].notes)}finally{h.close()}
 const again=harness({stored:raw});try{await again.api.loadMaster();assert.equal(again.api.state.inventory[0].notes,'persistido')}finally{again.close()}
});
test('una transacción documental confirmada se recupera de IndexedDB',async()=>{
 const h=harness();try{await h.api.indexDocument({name:'átomos.docx',path:'local:átomos.docx',text:'Estructura del átomo',type:'DOCX'});h.api.state.docs=[];await h.api.loadCachedDocumentIndex();assert.equal(h.api.state.docs.length,1);assert.equal(h.api.state.docs[0].text,'Estructura del átomo')}finally{h.close()}
});
