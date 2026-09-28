import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';

test('registro rechaza acciones, parámetros, fechas y secuencias inválidos antes de ejecutar',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();
  for(const action of [null,{action:'eval',code:'alert(1)'},{action:'open_view',view:'missing'},{action:'search_inventory',query:42},{action:'search_inventory',query:'ácido',code:'evil'},{action:'toggle_web',enabled:'true'},{action:'create_calendar_event',date:'2026-02-31',text:'inválido'},{action:'sequence',steps:Array(9).fill({action:'status'})},{action:'sequence',steps:[{action:'open_view',view:'inventory'},{action:'missing'}]}]){
   const out=await h.api.executeAssistantAction(action,{speak:false});assert.equal(out.ok,false,JSON.stringify(action));
  }
  assert.equal(h.api.state.view,'dashboard');assert.equal(h.api.state.inventory.length,111);assert.equal(h.api.state.web,false);
 }finally{h.close()}
});
test('una respuesta remota no obtiene permisos locales aunque declare confirm=true',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();h.window.confirm=()=>true;
  const out=await h.api.executeAssistantAction({action:'delete_inventory_item',query:'NEXUS-X-0001',confirm:true},{origin:'gemini',speak:false});assert.equal(out.ok,false);assert.equal(h.api.state.inventory.length,111);
 }finally{h.close()}
});
test('el boolean confirm no reemplaza la confirmación real del usuario',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();
  const action={action:'delete_inventory_item',query:'NEXUS-X-0001',confirm:true};assert.equal((await h.api.executeAssistantAction(action,{speak:false})).ok,false);assert.equal(h.api.state.inventory.length,111);
  h.window.confirm=()=>true;assert.equal((await h.api.executeAssistantAction(action,{speak:false})).ok,true);assert.equal(h.api.state.inventory.length,110);assert.equal(JSON.parse(h.window.localStorage.getItem('nexus_x_inventory_recovery_v1')).length,111);
 }finally{h.close()}
});
test('una secuencia válida conserva orden y un fallo de guardado detiene el resto',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();
  const out=await h.api.executeAssistantAction({action:'sequence',steps:[{action:'open_view',query:'inventory'},{action:'search_inventory',query:'ácido nítrico'}]},{speak:false});assert.equal(out.ok,true);assert.equal(out.results.length,2);
  h.window.Storage.prototype.setItem=()=>{throw new DOMException('lleno','QuotaExceededError')};
  const fail=await h.api.executeAssistantAction({action:'sequence',steps:[{action:'create_inventory_item',name:'QA nuevo'},{action:'open_view',view:'reports'}]},{speak:false});assert.equal(fail.ok,false);assert.equal(h.api.state.inventory.length,111);assert.equal(h.api.state.view,'inventory');
 }finally{h.close()}
});
