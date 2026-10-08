/**
 * Explicit offline shell preparation for the EXPERIMENTAL /next/ app only.
 * Does not alter or delete caches of production NEXUS-X. No background download.
 * The three locally-vendored ONNX runtime binaries are pinned by SHA-256.
 */
import {MODEL_CACHE} from './model-provisioner.js';
import {validateCanonicalSnapshot} from './canonical-source.js';
export const EDGE_SHELL_FILES=Object.freeze([
 'demo.html','demo.js','demo.css','manifest.webmanifest','semantic-sw.js',
 '../icon-192.png','../icon-512.png',
 '../offline/assets.js','../offline/core.js','../offline/edge-sw.js','../jsQR.js',
 'offline-shell.js','acceptance.js','device-acceptance.js','canonical-source.js','model-provisioner.js','semantic-fabric.js','fabric-client.js','agent-runtime.js',
 'embedding-client.js','embedding-worker.js','search-core.js','search-worker.js',
 'search-client.js','hnsw.js','document-source.js','document-fabric.js',
 'storage.js','dexie-adapter.js','virtual-list.js','benchmarks.js',
 'chemical-engine.js','chemical-worker.js','chemical-client.js','agent-dag.js','inspection-dag.js',
 'manual-webrtc.js','p2p-crypto.js','sync-controller.js','sync-core.js',
 'lens-preprocess-worker.js','lens-edge.js','voice-edge.js','voice-frame.html','voice-frame.js','voice-frame-client.js','voice-guard.js','telemetry.js','yjs-lab.js'
]);
export const EDGE_VENDOR_FILES=Object.freeze([
 {path:'vendor/transformers/transformers.min.js',sha256:'aa5002b70e789798da263f5f99c62bd3e8fcd0c119258a493c40c180648365fa'},
 {path:'vendor/onnx/ort-wasm-simd-threaded.jsep.mjs',sha256:'08fb86ec433c78bfb032c5d84a68b8e8e5a8d81268fa39e24314179a5767a5b9'},
 {path:'vendor/onnx/ort-wasm-simd-threaded.jsep.wasm',sha256:'c46655e8a94afc45338d4cb2b840475f88e5012d524509916e505079c00bfa39'}
]);
/** Version-pinned Yjs browser bundle, built and hashed by the Yjs CI workflow. */
export const EDGE_YJS_VENDOR=Object.freeze({
 path:'vendor/yjs/yjs.bundle.mjs',
 sha256:'2beb60fdf075578a9a25f0f2511b5d39772e0ea4a44ab8302462ff1ed4df4902'
});
const hex=array=>Array.from(new Uint8Array(array),b=>b.toString(16).padStart(2,'0')).join('');
/**
 * Cache app shell on explicit request. Fail closed if local runtime differs from
 * audited SHA-256. Never accept cross-origin resources or error HTML as assets.
 */
export async function prepareOfflineShell({
 scope=new URL('./',import.meta.url),includeVendor=true,includeInventory=false,includeYjs=false,includeDocuments=false,fetcher=globalThis.fetch,
 cacheStorage=globalThis.caches,cryptoObject=globalThis.crypto,onProgress=()=>{},signal
}={}){
 if(!fetcher||!cacheStorage||!cryptoObject?.subtle)throw Error('CacheStorage, HTTPS y WebCrypto requeridos');
 const root=new URL(scope,import.meta.url);
 if(root.origin!==new URL(import.meta.url).origin)throw Error('Origen de recursos no permitido');
 const cache=await cacheStorage.open(MODEL_CACHE);
 const assets=[
  ...EDGE_SHELL_FILES.map(path=>({path})),
  ...(includeVendor?EDGE_VENDOR_FILES:[]),
  ...(includeYjs?[EDGE_YJS_VENDOR]:[])
 ];
 let done=0;
 for(const asset of assets){
  if(signal?.aborted)throw Error('Preparación offline cancelada');
  const url=new URL(asset.path,root);
  const response=await fetcher(url.href,{cache:'reload',signal});
  if(!response?.ok||response.type==='opaque')throw Error('Recurso offline no disponible: '+asset.path);
  if(asset.sha256){
   const buffer=await response.arrayBuffer();
   const digest=hex(await cryptoObject.subtle.digest('SHA-256',buffer));
   if(digest!==asset.sha256)throw Error('SHA-256 del runtime no coincide: '+asset.path);
   await cache.put(url.href,new Response(buffer,{headers:{'Content-Type':asset.path.endsWith('.wasm')?'application/wasm':'text/javascript'}}));
  }else await cache.put(url.href,response.clone());
  onProgress({done:++done,total:assets.length,file:asset.path});
 }
 if(includeInventory){
  if(signal?.aborted)throw Error('Preparación offline cancelada');
  const source=new URL('../inventory.json',root);
  const response=await fetcher(source.href,{cache:'reload',signal});
  if(!response?.ok||response.type==='opaque')throw Error('Inventario fuente no disponible');
  const text=await response.text();
  if(text.length>2*1024*1024)throw Error('Snapshot de inventario demasiado grande');
  let document;try{document=JSON.parse(text)}catch{throw Error('Inventario JSON inválido')}
  const rows=document?.records,ids=new Set();
  if(!Array.isArray(rows)||rows.length!==111||rows.some(record=>{
   const id=String(record?.id||'');
   if(!/^NEXUS-X-\d{4}$/.test(id)||ids.has(id))return true;
   ids.add(id);return false;
  }))throw Error('Inventario canónico inesperado; no se creará la copia offline');
  const target=new URL('snapshot/inventory.json',root);
  await cache.put(target.href,new Response(text,{headers:{'Content-Type':'application/json'}}));
  onProgress({done:++done,total:assets.length+1,file:'snapshot/inventory.json'});
 }
 if(includeDocuments){
  if(signal?.aborted)throw Error('Preparación documental cancelada');
  const url=new URL('snapshot/canonical-documents.json',root);
  const response=await fetcher(url.href,{cache:'reload',signal});
  if(!response?.ok||response.type==='opaque')throw Error('Índice canónico de seis documentos no disponible');
  const buffer=await response.arrayBuffer();
  if(buffer.byteLength>6*1024*1024)throw Error('Snapshot documental demasiado grande');
  let parsed;
  try{parsed=JSON.parse(new TextDecoder().decode(buffer))}
  catch{throw Error('Snapshot documental inválido')}
  validateCanonicalSnapshot(parsed);
  await cache.put(url.href,new Response(buffer,{headers:{'Content-Type':'application/json'}}));
  onProgress({done:++done,total:assets.length+(includeInventory?2:1),file:'snapshot/canonical-documents.json'});
 }
 return {ready:true,cached:done,hasRuntime:includeVendor,hasInventory:includeInventory,
  hasYjs:includeYjs,hasDocuments:includeDocuments};
}
export async function offlineShellStatus({scope=new URL('./',import.meta.url),cacheStorage=globalThis.caches,includeVendor=true,includeInventory=false,includeYjs=false,includeDocuments=false}={}){
 if(!cacheStorage)return {ready:false,cached:0};
 const root=new URL(scope,import.meta.url),cache=await cacheStorage.open(MODEL_CACHE);
 const files=[...EDGE_SHELL_FILES,...(includeVendor?EDGE_VENDOR_FILES.map(x=>x.path):[]),...(includeYjs?[EDGE_YJS_VENDOR.path]:[]),...(includeDocuments?['snapshot/canonical-documents.json']:[])];
 let present=0;
 for(const name of files)if(await cache.match(new URL(name,root).href))present++;
  const inventoryCached=Boolean(await cache.match(new URL('snapshot/inventory.json',root).href));
 return {ready:present===files.length&&(!includeInventory||inventoryCached),cached:present,total:files.length,
  hasRuntime:includeVendor,inventoryCached,hasYjs:includeYjs,hasDocuments:includeDocuments};
}
