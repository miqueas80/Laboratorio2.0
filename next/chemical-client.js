/**
 * Chemical warnings are computed in a dedicated worker to avoid main-thread
 * stalls when scanning 100k+ inventory rows. A timeout or an AbortSignal
 * terminates the worker so a long computation cannot continue in background.
 */
export class ChemicalSafetyClient{
 constructor({url=new URL('./chemical-worker.js',import.meta.url),
  WorkerConstructor=globalThis.Worker,timeoutMs=30000}={}){
  if(typeof WorkerConstructor!=='function')throw Error('Web Workers no disponibles');
  this.WorkerConstructor=WorkerConstructor;this.url=url;this.timeoutMs=timeoutMs;
  this.worker=null;this.seq=0;this.pending=new Map();this.closed=false;
  this.#start();
 }
 #start(){
  this.worker=new this.WorkerConstructor(this.url,{type:'module'});
  this.worker.onmessage=({data})=>{
   const entry=this.pending.get(data?.id);if(!entry)return;
   this.pending.delete(data.id);clearTimeout(entry.timer);
   entry.signal?.removeEventListener('abort',entry.onAbort);
   if(data.error)entry.reject(Error(data.error));
   else entry.resolve(data.result);
  };
  this.worker.onerror=()=>this.#reset(Error('Motor de seguridad química falló'));
 }
 #reset(error){
  this.worker?.terminate();this.worker=null;
  for(const item of this.pending.values()){
   clearTimeout(item.timer);item.signal?.removeEventListener('abort',item.onAbort);
   item.reject(error);
  }
  this.pending.clear();
  // Restart lazily on the next explicit evaluation, never in an error loop.
 }
 evaluate(records,{maxAlerts=1000,maxUnverified=5000,signal}={}){
  if(this.closed)throw Error('Motor cerrado');
  if(!this.worker)this.#start();
  if(!Array.isArray(records)||records.length>300000)throw Error('Inventario excede límites del análisis');
  if(signal?.aborted)return Promise.reject(Error('Análisis cancelado'));
  const id=++this.seq;
  return new Promise((resolve,reject)=>{
   const onAbort=()=>this.#reset(Error('Análisis cancelado'));
   const timer=setTimeout(()=>this.#reset(Error('Tiempo de cálculo químico agotado')),this.timeoutMs);
   this.pending.set(id,{resolve,reject,timer,signal,onAbort});
   signal?.addEventListener('abort',onAbort,{once:true});
   try{this.worker.postMessage({id,type:'EVALUATE',records,options:{maxAlerts,maxUnverified}})}
   catch(error){
    clearTimeout(timer);signal?.removeEventListener('abort',onAbort);
    this.pending.delete(id);reject(error);
   }
  });
 }
 close(){
  if(this.closed)return;
  this.closed=true;this.#reset(Error('Motor cerrado'));
 }
}
