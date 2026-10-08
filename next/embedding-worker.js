/**
 * Offline-only Spanish/multilingual text embeddings.
 * Requires an explicitly provisioned local Transformers.js v3 bundle, ONNX WASM
 * and quantized model. Never downloads from a third-party endpoint.
 */
const MODEL='Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const DIMENSION=384;
const selfBase=new URL('./',self.location.href);
const modelBase=new URL('./models/',selfBase).href;
const wasmBase=new URL('./vendor/onnx/',selfBase).href;
const libraryURL=new URL('./vendor/transformers/transformers.min.js',selfBase).href;
const wasmModuleURL=new URL('./vendor/onnx/ort-wasm-simd-threaded.jsep.mjs',selfBase).href;
const wasmBinaryURL=new URL('./vendor/onnx/ort-wasm-simd-threaded.jsep.wasm',selfBase).href;
let extractor=null,loading=null,backend='',state='missing';
function respond(id,result,error){self.postMessage(error?{id,error:String(error)}:{id,result})}
async function localExists(url){
  try{const response=await fetch(url,{method:'HEAD',cache:'no-store'});return response.ok}
  catch{return false}
}
async function status(){
 const [lib,wasmModule,wasmBinary,config,model,tokenizer]=await Promise.all([
  localExists(libraryURL),
  localExists(wasmModuleURL),
  localExists(wasmBinaryURL),
  localExists(new URL('./models/'+MODEL+'/config.json',selfBase)),
  localExists(new URL('./models/'+MODEL+'/onnx/model_quantized.onnx',selfBase)),
  localExists(new URL('./models/'+MODEL+'/tokenizer.json',selfBase))
 ]);
 return {ready:Boolean(extractor),installed:lib&&wasmModule&&wasmBinary&&config&&model&&tokenizer,library:lib,wasmModule,wasmBinary,config,weights:model,tokenizer,model:MODEL,dimension:DIMENSION,backend};
}
async function prepare(){
 if(extractor)return {ready:true,model:MODEL,backend,dimension:DIMENSION};
 if(loading)return loading;
 loading=(async()=>{
  const exists=await status();
  if(!exists.installed)throw Error('Embeddings no instalados: faltan archivos locales, no se permite conexión externa');
  const {pipeline,env}=await import(libraryURL);
  // Disable a second 118MB browser cache: verified assets are already supplied by the model SW.
  env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=modelBase;
  env.useBrowserCache=false;env.useFS=false;
  env.backends.onnx.wasm.wasmPaths=wasmBase;
  const target=self.navigator?.gpu?'webgpu':'wasm';
  try{
   extractor=await pipeline('feature-extraction',MODEL,{dtype:'q8',device:target});
   backend=target;
  }catch(error){
   if(target!=='webgpu')throw error;
   extractor=await pipeline('feature-extraction',MODEL,{dtype:'q8',device:'wasm'});
   backend='wasm';
  }
  state='ready';
  return {ready:true,model:MODEL,backend,dimension:DIMENSION};
 })();
 try{return await loading}catch(error){state='error';throw error}finally{loading=null}
}
async function vectorize(texts){
 await prepare();
 if(!Array.isArray(texts)||texts.length<1||texts.length>12||texts.some(t=>typeof t!=='string'||t.length>2200))throw Error('Lote semántico inválido');
 const out=await extractor(texts,{pooling:'mean',normalize:true});
 if(!out||out.dims?.[0]!==texts.length||out.dims?.at(-1)!==DIMENSION)throw Error('Dimensión de embedding inesperada');
 const values=Array.from({length:texts.length},(_,i)=>Array.from(out.data.subarray(i*DIMENSION,(i+1)*DIMENSION)));
 out.dispose?.();
 return values;
}
self.onmessage=async({data})=>{
 const {id,type}=data||{};
 try{
  if(type==='STATUS')respond(id,await status());
  else if(type==='PREPARE')respond(id,await prepare());
  else if(type==='EMBED')respond(id,{vectors:await vectorize(data.texts||[]),model:MODEL,dimension:DIMENSION,backend});
  else if(type==='CLOSE'){await extractor?.dispose?.();extractor=null;backend='';state='missing';respond(id,true)}
  else throw Error('Operación de embeddings desconocida');
 }catch(error){respond(id,null,error.message||String(error))}
};
