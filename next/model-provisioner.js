/**
 * Explicit verified model installation (never on app startup).
 *
 * All downloads are fetched over HTTPS directly from the model publisher,
 * the two large LFS payloads are authenticated using publisher SHA-256 values,
 * and one final receipt commits the complete installation. Existing cache
 * hits are NOT silently assumed trustworthy: their hashes are rechecked.
 */
export const TEXT_MODEL='Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const MODEL_CACHE='nexus-edge-semantic-model-v2';
export const MODEL_RECEIPT='__nexus_installed_v2.json';
const BASE='https://huggingface.co/'+TEXT_MODEL+'/resolve/main/';
const MAX_FILE_BYTES=160*1024*1024;
const ASSETS=Object.freeze([
 Object.freeze({path:'config.json'}),
 Object.freeze({path:'tokenizer_config.json'}),
 Object.freeze({path:'special_tokens_map.json'}),
 Object.freeze({path:'tokenizer.json',sha256:'b60b6b43406a48bf3638526314f3d232d97058bc93472ff2de930d43686fa441'}),
 Object.freeze({path:'onnx/model_quantized.onnx',sha256:'66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc'})
]);
export const MODEL_ASSETS=ASSETS;
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
function paths(scope) {
 const root=new URL(scope,import.meta.url);
 if(root.origin!==new URL(import.meta.url).origin)throw Error('El modelo debe permanecer en el mismo origen');
 const url=asset=>new URL('models/'+TEXT_MODEL+'/'+asset.path,root).href;
 const receipt=new URL('models/'+TEXT_MODEL+'/'+MODEL_RECEIPT,root).href;
 return {url,receipt};
}
async function verified(response,asset,cryptoObject){
 if(!response?.ok||response.type==='opaque')return null;
 const claimed=Number(response.headers?.get('Content-Length')||0);
 if(claimed>MAX_FILE_BYTES)return null;
 const buffer=await response.arrayBuffer();
 if(!buffer.byteLength||buffer.byteLength>MAX_FILE_BYTES)return null;
 if(asset.sha256){
  const digest=hex(await cryptoObject.subtle.digest('SHA-256',buffer));
  if(digest!==asset.sha256)return null;
 }else{
  // Sanity-check small JSON configuration files without interpreting commands.
  if(buffer.byteLength>2*1024*1024)return null;
  let object;
  try{object=JSON.parse(new TextDecoder().decode(buffer))}
  catch{return null}
  if(!object||typeof object!=='object'||Array.isArray(object))return null;
 }
 return {buffer,bytes:buffer.byteLength};
}
async function receiptValid(cache,receipt,assets){
 const response=await cache.match(receipt);
 if(!response?.ok)return false;
 try{
  const data=await response.json();
  return data?.version===2&&data?.model===TEXT_MODEL&&
   assets.every(asset=>data.checksums?.[asset.path]===(asset.sha256||'json-validated'));
 }catch{return false}
}
/** Cache receipt is a completed installation, not a guarantee against later user cache eviction. */
export async function semanticCacheStatus({scope=new URL('./',import.meta.url),cacheStorage=globalThis.caches}={}){
 if(!cacheStorage)return {installed:false,files:0,total:ASSETS.length,receipt:false};
 const {url,receipt}=paths(scope),cache=await cacheStorage.open(MODEL_CACHE);
 let count=0;
 for(const asset of ASSETS)if(await cache.match(url(asset)))count++;
 const signed=await receiptValid(cache,receipt,ASSETS);
 return {installed:signed&&count===ASSETS.length,files:count,total:ASSETS.length,receipt:signed};
}
/**
 * Install must be invoked by explicit user action. Strong hashes are checked
 * on both new and previously downloaded large files. The final receipt is
 * stored ONLY after every file passes verification; on failure it is removed.
 */
export async function prepareSemanticAssets({
 scope=new URL('./',import.meta.url),onProgress=()=>{},fetcher=globalThis.fetch,
 cacheStorage=globalThis.caches,cryptoObject=globalThis.crypto,
 storage=globalThis.navigator?.storage,signal
}={}){
 if(!cryptoObject?.subtle||!cacheStorage||!fetcher)throw Error('HTTPS/WebCrypto/CacheStorage requeridos');
 const quota=await storage?.estimate?.();
 if(Number.isFinite(quota?.quota)&&Number.isFinite(quota?.usage)&&quota.quota-quota.usage<150*1024*1024)
  throw Error('Espacio insuficiente para instalar embeddings locales (al menos 150 MiB libres)');
 const {url,receipt}=paths(scope),cache=await cacheStorage.open(MODEL_CACHE);
 await cache.delete(receipt);
 let done=0;
 try{
  for(const asset of ASSETS){
   if(signal?.aborted)throw Error('Descarga cancelada');
   const target=url(asset),previous=await cache.match(target);
   let verifiedFile=previous?await verified(previous.clone(),asset,cryptoObject):null,alreadyCached=Boolean(verifiedFile);
   if(!verifiedFile){
    if(previous)await cache.delete(target);
    const response=await fetcher(BASE+asset.path,{mode:'cors',cache:'no-store',signal});
    verifiedFile=await verified(response,asset,cryptoObject);
    if(!verifiedFile)throw Error('Recurso no disponible o verificación de integridad fallida: '+asset.path);
    const headers=new Headers({
     'Content-Type':asset.path.endsWith('.json')?'application/json':'application/octet-stream',
     'Content-Length':String(verifiedFile.bytes)
    });
    await cache.put(target,new Response(verifiedFile.buffer,{status:200,headers}));
   }
   onProgress({done:++done,total:ASSETS.length,file:asset.path,bytes:verifiedFile.bytes,alreadyCached});
  }
  const checksums=Object.fromEntries(ASSETS.map(a=>[a.path,a.sha256||'json-validated']));
  const body=JSON.stringify({version:2,model:TEXT_MODEL,checksums});
  await cache.put(receipt,new Response(body,{headers:{'Content-Type':'application/json'}}));
  return {ok:true,model:TEXT_MODEL,cache:MODEL_CACHE,files:done};
 }catch(error){await cache.delete(receipt);throw error}
}
