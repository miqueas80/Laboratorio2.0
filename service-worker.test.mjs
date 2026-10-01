import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('./sw.js',import.meta.url),'utf8');
function worker({failInstall=false}={}){
 const stores=new Map(),handlers={},base='https://miqueas80.github.io/Laboratorio2.0/';let network=0,claimed=0;
 const caches={keys:async()=>[...stores.keys()],delete:async key=>stores.delete(key),open:async key=>{
  if(!stores.has(key))stores.set(key,new Map());const store=stores.get(key);
  return {addAll:async requests=>{for(const req of requests){const url=new URL(req.url);assert.equal(url.origin,new URL(base).origin);assert.ok(url.pathname.startsWith('/Laboratorio2.0/'));const file=decodeURIComponent(url.pathname.slice('/Laboratorio2.0/'.length))||'index.html';assert.ok(fs.existsSync(new URL('./'+file,import.meta.url)),file);if(failInstall&&file==='pdf.mjs')throw new Error('recurso caído');store.set(req.url,new Response(file));}},match:async url=>store.get(typeof url==='string'?url:url.url)?.clone()};
 }};
 vm.runInNewContext(source,{self:{registration:{scope:base},clients:{claim:async()=>{claimed++}},addEventListener:(event,fn)=>handlers[event]=fn},caches,URL,Request,Response,fetch:async()=>{network++;throw new Error('offline')}});
 const lifecycle=type=>{let done;handlers[type]({waitUntil:p=>done=p});return done};
 const request=async(path,mode)=>{let response;handlers.fetch({request:{url:new URL(path,base).href,method:'GET',mode},respondWith:p=>response=p});return response?await response:null};
 return {stores,lifecycle,request,get network(){return network},get claimed(){return claimed}};
}
test('PWA: instalación local completa, navegación /Laboratorio2.0/ y lectores disponibles sin red',async()=>{
 const w=worker();await w.lifecycle('install');await w.lifecycle('activate');
 for(const path of ['./','./?source=pwa','./documents','./app.js?v=123','./catalogo_maestro.json','./pdf.mjs','./pdf.worker.mjs','./document-worker.js','./jszip.min.js','./xlsx.full.min.js']){
  const res=await w.request(path,/documents|source|^\.\/$/.test(path)?'navigate':undefined);assert.equal(res?.status,200,path);
 }assert.equal(w.network,0);assert.equal(w.claimed,0);assert.equal(await w.request('/otra-app/app.js'),null);assert.equal(await w.request('https://cdn.example.org/x.js'),null);
});
test('PWA: activación sólo retira cachés del ámbito propio',async()=>{
 const w=worker();w.stores.set('otra-app-cache',new Map());w.stores.set('nexus-x-shell:%2Fotra%2F:old',new Map());w.stores.set('nexus-x-shell:%2FLaboratorio2.0%2F:old',new Map());await w.lifecycle('install');await w.lifecycle('activate');
 assert.ok(w.stores.has('otra-app-cache'));assert.ok(w.stores.has('nexus-x-shell:%2Fotra%2F:old'));assert.equal(w.stores.has('nexus-x-shell:%2FLaboratorio2.0%2F:old'),false);
});
test('PWA: actualización incompleta conserva versión anterior y no fuerza activación',async()=>{
 const w=worker({failInstall:true});w.stores.set('nexus-x-shell:%2FLaboratorio2.0%2F:old',new Map());await assert.rejects(w.lifecycle('install'),/recurso caído/);
 assert.deepEqual([...w.stores.keys()],['nexus-x-shell:%2FLaboratorio2.0%2F:old']);assert.equal(w.claimed,0);
});
