import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import {IDBFactory} from 'fake-indexeddb';
import {harness,master} from './harness.mjs';
test('notificación opcional denegada no bloquea arranque ni guardado documental',async()=>{
 const h=harness({stored:master.records,online:false});try{h.window.BroadcastChannel=class {constructor(){throw new Error('API denegada')}};await h.api.boot();assert.equal(h.api.state.inventory.length,111);const doc=await h.api.indexLocalFile(new File(['Local'],'aislado.txt'));assert.equal(doc.text,'Local');assert.equal((await h.api.getCachedDocs()).length,1)}finally{h.close()}
});
test('cambio entre pestañas actualiza lecturas y protege un formulario en edición',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();h.api.bind();const rows=structuredClone(master.records);rows[0].notes='Cambio de otra pestaña';let raw=JSON.stringify(rows);h.window.localStorage.setItem('nexus_x_inventory_v1',raw);h.window.dispatchEvent(new h.window.StorageEvent('storage',{key:'nexus_x_inventory_v1',newValue:raw}));assert.equal(h.api.state.inventory[0].notes,'Cambio de otra pestaña');h.api.openItem('NEXUS-X-0001');h.document.querySelector('#fNotes').value='Edición en curso';rows[0].notes='Cambio más nuevo';raw=JSON.stringify(rows);h.window.localStorage.setItem('nexus_x_inventory_v1',raw);h.window.dispatchEvent(new h.window.StorageEvent('storage',{key:'nexus_x_inventory_v1',newValue:raw}));assert.equal(h.document.querySelector('#fNotes').value,'Edición en curso');assert.equal(h.api.saveItem(),false);assert.equal(JSON.parse(h.window.localStorage.getItem('nexus_x_inventory_v1'))[0].notes,'Cambio más nuevo');
 }finally{h.close()}
});
test('offline/cuota: investigación no depende de guardar historial ni puede mentir sobre favoritos',async()=>{
 const h=harness({stored:master.records,online:false});try{await h.api.loadMaster();h.window.Storage.prototype.setItem=()=>{throw new DOMException('cuota','QuotaExceededError')};h.document.querySelector('#researchInput').value='ácido nítrico';h.api.runResearch();assert.match(h.document.querySelector('#researchResults').textContent,/NEXUS-X-0001/);assert.equal(h.api.toggleFavorite('NEXUS-X-0001'),false);assert.equal(h.api.state.favorites.size,0);assert.equal(h.calls.length,0);
 }finally{h.close()}
});
test('órdenes rápidas y repetidas no acumulan listeners ni activan Internet al desactivarlo',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();h.api.bind();h.api.bind();await h.api.nexusAgentTurn('activa internet');assert.equal(h.api.state.web,true);await h.api.nexusAgentTurn('desactiva internet');assert.equal(h.api.state.web,false);
  h.api.state.web=true;await h.api.nexusAgentTurn('busca algo totalmente inexistente');assert.equal(h.calls.length,0,'una intención local no consulta Internet aunque esté habilitado');
  for(let i=0;i<12;i++){await h.api.nexusAgentTurn('Nexus, abre inventario.');await h.api.nexusAgentTurn('Nexus, busca ácido nítrico.')}assert.equal(h.api.state.view,'inventory');assert.equal(h.document.querySelectorAll('#inventoryTable tbody tr').length,1);assert.equal(h.api.state.inventory.length,111);assert.ok(h.api.state.agentAudit.length<=40);assert.ok(h.api.state.agentHistory.length<=12);
 }finally{h.close()}
});
test('cargas concurrentes homónimas no sobrescriben y persisten ambas',async()=>{
 const h=harness();try{const docs=await Promise.all(['uno','dos'].map(text=>h.api.indexLocalFile(new File([text],'simultaneo.txt'))));assert.notEqual(docs[0].path,docs[1].path);assert.equal((await h.api.getCachedDocs()).length,2)}finally{h.close()}
});
test('dos pestañas con índice obsoleto no sobrescriben un documento local',async()=>{
 const idb=new IDBFactory(),a=harness({idb}),b=harness({idb});try{await a.api.indexLocalFile(new File(['versión original'],'unique.txt'));await assert.rejects(b.api.indexLocalFile(new File(['versión rival'],'unique.txt')));const docs=await a.api.getCachedDocs();assert.equal(docs.length,1);assert.equal(docs[0].text,'versión original')}finally{a.close();b.close()}
});
test('quota: sólo se eliminan cachés derivadas propias',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();const deleted=[];h.window.caches={keys:async()=>['other-app','nexus-x-shell:%2Flaboratorio%2F:r2','nexus-x-derived-%2Flaboratorio%2F-temp'],delete:async key=>{deleted.push(key);return true}};h.window.navigator.storage={estimate:async()=>({quota:100,usage:99})};await assert.rejects(h.api.checkStorageCapacity(30),/Espacio insuficiente/);assert.deepEqual(deleted,['nexus-x-derived-%2Flaboratorio%2F-temp']);assert.equal(h.api.state.inventory.length,111);
 }finally{h.close()}
});
test('arranque idempotente con IndexedDB caída conserva inventario y navegación',async()=>{
 const h=harness({stored:master.records,online:false,idb:{open(){throw new Error('fallo simulado')}}});try{await Promise.all([h.api.boot(),h.api.boot()]);assert.equal(h.api.state.inventory.length,111);h.document.querySelector('[data-view="documents"]').click();assert.equal(h.api.state.view,'documents');h.document.querySelector('[data-view="inventory"]').click();assert.equal(h.api.state.view,'inventory');assert.deepEqual(h.calls,['catalogo_maestro.json']);assert.match(h.document.querySelector('#settingsDiag').textContent,/error/);
 }finally{h.close()}
});
