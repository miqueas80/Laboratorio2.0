import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';
test('diagnóstico usa almacenamiento y datos reales sin afirmar offline ni revelar clave',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();h.window.localStorage.setItem('nexus_gemini_api_key_v1','secret-test-value');await h.api.indexDocument({name:'dato.txt',path:'local:dato.txt',type:'TXT',text:'Real'});
  const d=await h.api.collectDiagnostics();assert.equal(d.inventory.recordCount,111);assert.equal(d.indexedDB.count,1);assert.equal(d.storage.writable,true);assert.equal(d.offlineCache.complete,false);assert.equal(d.serviceWorker.supported,false);assert.equal(d.gemini.status,'sin comprobar');assert.doesNotMatch(JSON.stringify(d),/secret-test-value/);
 }finally{h.close()}
});
test('fallos de almacenamiento y APIs opcionales quedan visibles sin perder navegación',async()=>{
 const h=harness({stored:master.records,idb:undefined});try{await h.api.loadMaster();h.window.indexedDB=undefined;h.window.Storage.prototype.setItem=()=>{throw new DOMException('lleno','QuotaExceededError')};
  const d=await h.api.collectDiagnostics();assert.equal(d.storage.writable,false);assert.equal(d.indexedDB.status,'error');await h.api.executeAssistantAction({action:'open_view',view:'documents'},{speak:false});assert.equal(h.api.state.view,'documents');assert.equal(h.api.state.inventory.length,111);
 }finally{h.close()}
});
