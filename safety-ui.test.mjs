import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';
test('restauración: fallo de la segunda copia no deja memoria divergente ni pierde la versión previa',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();h.window.confirm=()=>true;h.window.localStorage.setItem('nexus_x_inventory_recovery_v1','[]');const original=h.window.Storage.prototype.setItem;
  h.window.Storage.prototype.setItem=function(k,v){if(k==='nexus_x_inventory_recovery_v1')throw new DOMException('cuota','QuotaExceededError');return original.call(this,k,v)};
  assert.equal(h.api.restoreInventoryBackup(),true);assert.equal(h.api.state.inventory.length,0);assert.equal(h.window.localStorage.getItem('nexus_x_inventory_v1'),'[]');assert.equal(JSON.parse(h.window.localStorage.getItem('nexus_x_before_restore_v1')).length,111);
 }finally{h.close()}
});
test('restauración: no reemplaza inventario si no puede proteger la versión actual',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();h.window.confirm=()=>true;h.window.localStorage.setItem('nexus_x_inventory_recovery_v1','[]');h.window.Storage.prototype.setItem=()=>{throw new DOMException('cuota','QuotaExceededError')};assert.equal(h.api.restoreInventoryBackup(),false);assert.equal(h.api.state.inventory.length,111);assert.equal(JSON.parse(h.window.localStorage.getItem('nexus_x_inventory_v1')).length,111);
 }finally{h.close()}
});
test('CSV neutraliza fórmulas ejecutables; entradas HTML siguen siendo texto',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();for(const value of ['=HYPERLINK("https://example.org")','+cmd','-1+2','@SUM(1)',' \t=1'])assert.ok(h.api.csvCell(value).startsWith("'"));assert.equal(h.api.csvCell('HNO3'),'HNO3');
  const payload='<img src=x onerror="alert(1)">';h.api.state.inventory[0]={...h.api.state.inventory[0],name:payload};h.api.renderAll();assert.equal(h.document.querySelector('#inventoryTable img'),null);assert.match(h.document.querySelector('#inventoryTable').textContent,/<img/);
  await h.api.indexDocument({name:payload+'.txt',path:'local:x.txt',type:'TXT',text:payload});await h.api.openDocumentViewer('local:x.txt');assert.equal(h.document.querySelector('#documentViewerBody img'),null);
 }finally{h.close()}
});
test('modales asocian títulos, mantienen foco y restauran el control de origen',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();h.api.bind();const trigger=h.document.querySelector('#newItemBtn');trigger.focus();h.api.newItem();const modal=h.document.querySelector('#itemModal');assert.equal(modal.getAttribute('role'),'dialog');assert.ok(modal.contains(h.document.activeElement));assert.equal(h.document.querySelector('label[for="fName"]').textContent,'Sustancia / mezcla / material');h.api.hideModal('itemModal');assert.equal(h.document.activeElement,trigger);assert.equal(h.document.querySelector('.app').inert,false);
  assert.doesNotMatch(h.document.querySelector('#miniCalendar').textContent,/fuente maestra validada/);assert.match(h.document.querySelector('#taskIntegrity').textContent,/comprobada/);
 }finally{h.close()}
});
test('visor: apertura antigua de PDF no reemplaza el documento elegido después',async()=>{
 const h=harness();try{
  let release;const pending=new Promise(resolve=>release=resolve);h.window.pdfjsLib={getDocument(){throw new Error('No debe renderizar PDF abandonado')}};
  h.api.state.docs=[{path:'pdf',name:'old.pdf',type:'PDF',blob:{arrayBuffer:()=>pending}},{path:'txt',name:'new.txt',type:'TXT',text:'Documento actual'}];
  const old=h.api.openDocumentViewer('pdf');await Promise.resolve();await h.api.openDocumentViewer('txt');release(new ArrayBuffer(0));await old;assert.match(h.document.querySelector('#documentViewerBody').textContent,/Documento actual/);h.api.closeDocumentViewer();assert.equal(h.document.querySelector('#documentViewerModal').classList.contains('open'),false);
 }finally{h.close()}
});
