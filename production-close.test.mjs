import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {File} from 'node:buffer';
import {IDBFactory} from 'fake-indexeddb';
import {harness,master,root} from './harness.mjs';
import * as pdf from './pdf.mjs';
pdf.GlobalWorkerOptions.workerSrc=new URL('./pdf.worker.mjs',import.meta.url).href;
const manifest=JSON.parse(fs.readFileSync(new URL('documents-manifest.json',root)));
const app=fs.readFileSync(new URL('app.js',root),'utf8');
const sw=fs.readFileSync(new URL('sw.js',root),'utf8');
const catalog={data:[{id:'available-test',access_tier:'free',capabilities:{}}]};
const pagesBase='https://miqueas80.github.io/Laboratorio2.0/';
function localFetch(url){
 if(String(url).includes('api.github.com'))return new Response('',{status:403});
 const path=decodeURIComponent(new URL(url,pagesBase).pathname.replace('/Laboratorio2.0/',''));
 if(path==='documents-manifest.json')return Response.json(manifest);
 if(path==='inventory.json')return Response.json(master);
 if(path==='catalogo_maestro.json')return new Response(fs.readFileSync(new URL(path,root)));
 const entry=manifest.documents.find(x=>x.path===path);assert.ok(entry,'ruta same-origin real: '+path);return new Response(fs.readFileSync(new URL(path,root)));
}
function readers(h){h.window.File=File;h.window.pdfjsLib=pdf;h.loadVendor('jszip.min.js');h.loadVendor('xlsx.full.min.js')}
test('manifiesto canónico: 6 rutas reales, Archivos, hashes, inventario 111 IDs únicos',()=>{
 assert.equal(manifest.documents.length,6);assert.equal(new Set(manifest.documents.map(x=>x.path)).size,6);
 assert.ok(manifest.documents.some(x=>x.path==='Archivos/Copia_Reacciones de formación de compuestos inorgánicos -1.pdf'));
 for(const d of manifest.documents){const bytes=fs.readFileSync(new URL(d.path,root));assert.equal(bytes.length,d.size);assert.equal(crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex'),d.revision)}
 assert.equal(master.records.length,111);assert.equal(new Set(master.records.map(r=>r.id)).size,111);assert.ok(master.records.every(r=>/^NEXUS-X-\d{4}$/.test(r.id)));
});
test('arranque limpio con GitHub 403 reconstruye 6/6 reales, carga normal y reinicio offline conservan 6/6',async()=>{
 const idb=new IDBFactory(),h=harness({idb,fetcher:localFetch,url:pagesBase});
 try{readers(h);await h.api.boot();assert.equal(h.api.state.inventory.length,111);assert.equal(h.api.state.docs.length,6);assert.equal((await h.api.getCachedDocs()).length,6);
  assert.ok(h.api.state.docs.every(d=>d.blob&&d.text.length&&d.chunks.length));assert.equal(h.calls.filter(x=>x.includes('api.github.com')).length,0);
  const downloaded=h.calls.length;const normal=await h.api.syncRepository();assert.equal(normal.indexed,6);assert.equal(h.api.state.docs.length,6);assert.equal(h.calls.length,downloaded+1,'sólo manifiesto: no duplica binarios');
  h.api.state.web=true;assert.equal((await h.window.fetch('https://api.github.com/repos/test')).status,403);assert.equal((await h.api.syncRepository()).indexed,6);
  assert.ok(h.api.searchLocal('ácido nítrico').length);assert.ok(h.api.documentSearch('formulación').length);
  await h.api.setInternetMode(false,{silent:true});const count=h.calls.length;await assert.rejects(h.api.xkiroGenerate({question:'test'}));await assert.rejects(h.api.xkiroVisionAnalyze({imageDataUrl:'data:image/png;base64,YQ=='}));assert.equal((await h.api.searchWebSources('test')).error,'disabled');assert.equal(h.calls.length,count);
 }finally{h.close()}
 const offline=harness({idb,stored:master.records,online:false,fetcher:()=>{throw new Error('red no disponible')}});
 try{await offline.api.loadCachedDocumentIndex();assert.equal(offline.api.state.docs.length,6);assert.ok(offline.api.documentSearch('formulación').length);assert.ok(offline.api.state.docs.every(d=>d.blob));await offline.api.loadMaster();assert.equal(offline.api.state.inventory.length,111)}finally{offline.close()}
});
test('Internet ON conecta health/models, OFF no consulta, reconexión automática y degradación conservan locales',async()=>{
 let fail=false;const h=harness({stored:master.records,fetcher:(url)=>{
  if(fail)return new Response('',{status:503});
  return String(url).endsWith('/health')?Response.json({ok:true,rateLimiterConfigured:false}):Response.json(catalog);
 }});
 try{await h.api.loadMaster();h.api.bind();h.document.querySelector('#webToggle').click();await h.api.setInternetMode(true,{silent:true});assert.equal(h.api.health.xkiro.status,'listo');assert.equal(h.api.health.xkiro.model,'available-test');assert.equal(h.calls.length,2);
  Object.defineProperty(h.window.navigator,'onLine',{value:false,configurable:true});await h.api.handleNetworkChange();assert.equal(h.api.state.web,true);
  Object.defineProperty(h.window.navigator,'onLine',{value:true,configurable:true});h.window.dispatchEvent(new h.window.Event('online'));await h.api.setInternetMode(true,{silent:true});assert.equal(h.api.health.xkiro.status,'listo');assert.ok(h.calls.filter(x=>x.endsWith('/health')).length>=2);
  fail=true;await h.api.setInternetMode(true,{force:true,silent:true});assert.equal(h.api.health.xkiro.status,'error');assert.match(h.document.querySelector('#xkiroStatus').textContent,/Internet externo degradado/);assert.equal(h.api.state.inventory.length,111);assert.ok(h.api.searchLocal('ácido nítrico').length);
  await h.api.setInternetMode(false,{silent:true});const count=h.calls.length;await h.api.handleNetworkChange();assert.equal(h.calls.length,count);
 }finally{h.close()}
});
test('versión única, actualización segura, manifiesto en shell y secreto fuera del frontend',()=>{
 assert.equal(app.match(/const APP_VERSION='([^']+)'/)[1],sw.match(/const VERSION='([^']+)'/)[1]);
 assert.doesNotMatch(sw,/skipWaiting\s*\(|clients\.claim\s*\(/);assert.match(sw,/'\.\/documents-manifest.json'/);
 for(const d of manifest.documents)assert.ok(!sw.includes(`'./${d.path}'`));
 assert.doesNotMatch(app,/getXKiroKey|sessionXKiroKey|Authorization.*Bearer|XKIRO_API_KEY/);assert.doesNotMatch(app,/history:.*cached/);
 assert.match(app,/loadQrFallback/);assert.ok(fs.statSync(new URL('jsQR.js',root)).size>100000);
});

test('copias históricas permanecen en IndexedDB sin aparecer como séptimo documento',async()=>{
 const h=harness();try{await h.api.putDoc({path:'history:anterior:1',name:'copia anterior',type:'PDF',text:'histórico',chunks:['histórico']});await h.api.loadCachedDocumentIndex();assert.equal(h.api.state.docs.length,0);assert.equal((await h.api.getCachedDocs()).length,1)}finally{h.close()}
});

test('OFF durante health pendiente cancela y no inicia /models',async()=>{
 let signal;const h=harness({fetcher:(url,options)=>new Promise((resolve,reject)=>{signal=options.signal;signal.addEventListener('abort',()=>reject(new DOMException('abort','AbortError')))} )});
 try{const pending=h.api.setInternetMode(true,{silent:true});await h.api.setInternetMode(false,{silent:true});await pending;assert.equal(signal.aborted,true);assert.equal(h.calls.length,1);assert.equal(h.api.health.xkiro.status,'desactivado')}finally{h.close()}
});
