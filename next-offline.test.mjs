import test from 'node:test';
import assert from 'node:assert/strict';
import {EDGE_SHELL_FILES,EDGE_VENDOR_FILES,EDGE_YJS_VENDOR,offlineShellStatus,prepareOfflineShell} from './next/offline-shell.js';
import {MODEL_CACHE} from './next/model-provisioner.js';

function memoryCache(){
 const values=new Map();
 const cache={
  match:async key=>values.get(key)?.clone()||null,
  put:async(key,value)=>{values.set(key,value.clone())},
  delete:async key=>values.delete(key)
 };
 return {values,cache,storage:{open:async name=>{assert.equal(name,MODEL_CACHE);return cache}}};
}
test('Edge Lab offline cache is empty until explicitly prepared',async()=>{
 const db=memoryCache();
 const status=await offlineShellStatus({cacheStorage:db.storage,includeVendor:false});
 assert.equal(status.ready,false);
 assert.equal(status.cached,0);
});
test('Explicit offline shell preparation caches only same-origin files',async()=>{
 const db=memoryCache(),seen=[];
 const result=await prepareOfflineShell({
  cacheStorage:db.storage,includeVendor:false,
  fetcher:async url=>{seen.push(url);return new Response('// contenido estático')},
  cryptoObject:globalThis.crypto
 });
 assert.equal(result.ready,true);
 assert.equal(result.hasRuntime,false);
 assert.equal(seen.length,EDGE_SHELL_FILES.length);
 assert.ok(seen.every(url=>url.startsWith('file:')));
 assert.equal((await offlineShellStatus({cacheStorage:db.storage,includeVendor:false})).ready,true);
 assert.equal((await offlineShellStatus({cacheStorage:db.storage,includeVendor:true})).ready,false);
});
test('Runtime vendor checksum must match audited artifacts before cache acceptance',async()=>{
 const db=memoryCache(),checks=new Map(EDGE_VENDOR_FILES.map((x,i)=>[i+1,x.sha256]));
 const fakeCrypto={subtle:{async digest(_algorithm,buffer){
  const sha=checks.get(buffer.byteLength)||'0'.repeat(64);
  return Uint8Array.from(sha.match(/../g).map(x=>parseInt(x,16))).buffer;
 }}};
 let n=0;
 const result=await prepareOfflineShell({
  cacheStorage:db.storage,includeVendor:true,cryptoObject:fakeCrypto,
  fetcher:async url=>{
   const asset=EDGE_VENDOR_FILES.find(x=>url.endsWith(x.path));
   if(asset){return new Response(Uint8Array.from({length:EDGE_VENDOR_FILES.indexOf(asset)+1},()=>1))}
   return new Response('archivo local '+(++n));
  }
 });
 assert.equal(result.hasRuntime,true);
 assert.equal((await offlineShellStatus({cacheStorage:db.storage,includeVendor:true})).ready,true);
 const corrupted=memoryCache();
 await assert.rejects(prepareOfflineShell({
  cacheStorage:corrupted.storage,includeVendor:true,cryptoObject:globalThis.crypto,
  fetcher:async url=>url.includes('/vendor/')
   ?new Response('contenido modificado'):new Response('archivo correcto')
 }),/SHA-256 del runtime no coincide/);
 assert.equal((await offlineShellStatus({cacheStorage:corrupted.storage,includeVendor:true})).ready,false);
});
test('Offline shell only stores successful responses and stops on missing assets',async()=>{
 const db=memoryCache();let calls=0;
 await assert.rejects(prepareOfflineShell({cacheStorage:db.storage,
  includeVendor:false,cryptoObject:globalThis.crypto,fetcher:async()=>{
   calls++;return calls===1?new Response('contenido'):new Response('falta',{status:404});
  }
 }),/Recurso offline no disponible/);
 assert.equal((await offlineShellStatus({cacheStorage:db.storage,includeVendor:false})).ready,false);
});


test('Copia de inventario offline es read-only, valida 111 registros y no modifica el origen',async()=>{
 const fs=await import('node:fs');
 const source=fs.readFileSync('inventory.json','utf8');
 const db=memoryCache();
 const out=await prepareOfflineShell({cacheStorage:db.storage,includeVendor:false,includeInventory:true,
  cryptoObject:globalThis.crypto,
  fetcher:async url=>new Response(url.endsWith('/inventory.json')?source:'// archivo experimental')
 });
 assert.equal(out.ready,true);assert.equal(out.hasInventory,true);
 const status=await offlineShellStatus({cacheStorage:db.storage,includeVendor:false,includeInventory:true});
 assert.equal(status.ready,true);assert.equal(status.inventoryCached,true);
 const key=[...db.values.keys()].find(x=>x.endsWith('/snapshot/inventory.json'));
 assert.ok(key);
 const cached=JSON.parse(await db.cache.match(key).then(response=>response.text()));
 assert.equal(cached.records.length,111);
 assert.equal(fs.readFileSync('inventory.json','utf8'),source);
 const invalid=memoryCache();
 await assert.rejects(prepareOfflineShell({cacheStorage:invalid.storage,includeVendor:false,includeInventory:true,
  cryptoObject:globalThis.crypto,
  fetcher:async url=>new Response(url.endsWith('/inventory.json')?'{"records":[]}':'// archivo')
 }),/Inventario canónico inesperado/);
 assert.equal((await offlineShellStatus({cacheStorage:invalid.storage,includeVendor:false,includeInventory:true})).ready,false);
});

test('El módulo Yjs solo queda disponible offline tras validar su checksum',async()=>{
 const memory=memoryCache();
 const sha=EDGE_YJS_VENDOR.sha256;
 const fakeCrypto={subtle:{async digest(_algorithm,buffer){
  const digest=buffer.byteLength===73?sha:'0'.repeat(64);
  return Uint8Array.from(digest.match(/../g).map(v=>parseInt(v,16))).buffer;
 }}};
 const cacheOptions={
  includeVendor:false,includeYjs:true,includeInventory:false,
  cryptoObject:fakeCrypto,cacheStorage:memory.storage,
  fetcher:async url=>url.endsWith(EDGE_YJS_VENDOR.path)?new Response(new Uint8Array(73)):new Response('recurso local')
 };
 const ready=await prepareOfflineShell(cacheOptions);
 assert.equal(ready.hasYjs,true);
 assert.equal((await offlineShellStatus({cacheStorage:memory.storage,includeVendor:false,includeYjs:true})).ready,true);
 const invalid=memoryCache();
 await assert.rejects(prepareOfflineShell({...cacheOptions,cacheStorage:invalid.storage,
  cryptoObject:globalThis.crypto}),/SHA-256 del runtime no coincide/);
 assert.equal((await offlineShellStatus({cacheStorage:invalid.storage,includeVendor:false,includeYjs:true})).ready,false);
});
