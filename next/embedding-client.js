/** Optional local semantic encoder; lexical BM25 works when the model is absent. */
export class LocalEmbeddingClient {
 constructor({url=new URL('./embedding-worker.js',import.meta.url),timeoutMs=120000}={}){
  if(typeof Worker!=='function')throw Error('Workers no disponibles');
  this.worker=new Worker(url,{type:'module'});this.timeoutMs=timeoutMs;this.seq=0;this.pending=new Map();
  this.worker.onmessage=({data})=>{
   const p=this.pending.get(data.id);if(!p)return;
   clearTimeout(p.timer);this.pending.delete(data.id);
   data.error?p.reject(Error(data.error)):p.resolve(data.result);
  };
  this.worker.onerror=()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Motor de embeddings detenido'))}this.pending.clear()};
 }
 request(type,texts){
  const id=++this.seq;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Tiempo de embeddings agotado'))},this.timeoutMs);
   this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,type,...(texts?{texts}:{})});
  });
 }
 status(){return this.request('STATUS')}
 prepare(){return this.request('PREPARE')}
 async embed(texts,{batchSize=6,onProgress=()=>{}}={}){
  if(!Array.isArray(texts))throw Error('Textos inválidos');
  const vectors=[];
  for(let i=0;i<texts.length;i+=batchSize){
   const batch=await this.request('EMBED',texts.slice(i,i+batchSize));
   vectors.push(...batch.vectors);onProgress({done:vectors.length,total:texts.length});
  }
  return vectors;
 }
 close(){this.worker.terminate();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Motor cerrado'))}this.pending.clear()}
}
