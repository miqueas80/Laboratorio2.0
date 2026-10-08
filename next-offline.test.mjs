import test from 'node:test';
import assert from 'node:assert/strict';
import {EDGE_SHELL_FILES,EDGE_VENDOR_FILES,offlineShellStatus,prepareOfflineShell} from './next/offline-shell.js';
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
