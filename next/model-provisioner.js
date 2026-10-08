/**
 * Explicit user-approved model download to CacheStorage, served by semantic-sw.
 * Does not install/ship the Transformers.js library; that and matching ONNX WASM
 * runtime must be vendored from an audited pinned npm release separately.
 * Do not run over cellular/mobile data without informed user confirmation.
 */
export const TEXT_MODEL='Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const MODEL_CACHE='nexus-edge-semantic-model-v1';
const BASE='https://huggingface.co/'+TEXT_MODEL+'/resolve/main/';
const MANIFEST=Object.freeze([
 {path:'config.json'},
 {path:'tokenizer_config.json'},
 {path:'special_tokens_map.json'},
 {path:'tokenizer.json',bytesApprox:17100000,sha256:'b60b6b43406a48bf3638526314f3d232d97058bc93472ff2de930d43686fa441'},
 {path:'onnx/model_quantized.onnx',bytesApprox:118000000,sha256:'66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc'}
]);
const hex=bytes=>[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
/** Fetch only after explicit user gesture; no implicit or background downloads. */
export async function prepareSemanticAssets({scope=new URL('./',import.meta.url),onProgress=()=>{},fetcher=globalThis.fetch,cacheStorage=globalThis.caches,cryptoObject=globalThis.crypto,storage=globalThis.navigator?.storage,signal}={}){
 if(!cryptoObject?.subtle||!cacheStorage||!fetcher)throw Error('HTTPS/WebCrypto/CacheStorage requeridos');
 const quota=await storage?.estimate?.();
 const approxBytes=150*1024*1024;
 if(Number.isFinite(quota?.quota)&&Number.isFinite(quota?.usage)&&quota.quota-quota.usage<approxBytes)
  throw Error('Espacio insuficiente para instalar embeddings locales (al menos 150 MiB libres)');
 const cache=await cacheStorage.open(MODEL_CACHE),origin=new URL(scope,import.meta.url);
 if(origin.origin!==new URL(import.meta.url).origin)throw Error('El modelo debe residir en el mismo origen');
 for(let i=0;i<MANIFEST.length;i++){
  const asset=MANIFEST[i],target=new URL('models/'+TEXT_MODEL+'/'+asset.path,origin);
  if(await cache.match(target.href)){onProgress({done:i+1,total:MANIFEST.length,file:asset.path,alreadyCached:true});continue}
  if(signal?.aborted)throw Error('Descarga cancelada');
  const url=BASE+asset.path;
  const response=await fetcher(url,{mode:'cors',cache:'no-store',signal});
  if(!response.ok||response.type==='opaque')throw Error('No se pudo descargar el recurso '+asset.path+': HTTP '+response.status);
  const length=Number(response.headers?.get('Content-Length')||0);
  if(length>160*1024*1024)throw Error('El modelo supera el presupuesto de tamaño permitido');
  const buffer=await response.arrayBuffer();
  if(buffer.byteLength>160*1024*1024)throw Error('Recurso demasiado grande');
  if(asset.sha256){
   const sum=hex(await cryptoObject.subtle.digest('SHA-256',buffer));
   if(sum!==asset.sha256)throw Error('Verificación SHA-256 fallida para '+asset.path);
  }
  const headers=new Headers({'Content-Type':asset.path.endsWith('.json')?'application/json':'application/octet-stream','Content-Length':String(buffer.byteLength)});
  await cache.put(target.href,new Response(buffer,{status:200,headers}));
  onProgress({done:i+1,total:MANIFEST.length,file:asset.path,bytes:buffer.byteLength});
 }
 return {ok:true,model:TEXT_MODEL,cache:MODEL_CACHE,files:MANIFEST.length,note:'Instalación explícita; el runtime local de Transformers.js debe estar empaquetado en el mismo origen.'};
}
export async function semanticCacheStatus({scope=new URL('./',import.meta.url),cacheStorage=globalThis.caches}={}){
 if(!cacheStorage)return {installed:false,files:0,total:MANIFEST.length};
 const cache=await cacheStorage.open(MODEL_CACHE),origin=new URL(scope,import.meta.url);
 let count=0;
 for(const item of MANIFEST)if(await cache.match(new URL('models/'+TEXT_MODEL+'/'+item.path,origin).href))count++;
 return {installed:count===MANIFEST.length,files:count,total:MANIFEST.length};
}
