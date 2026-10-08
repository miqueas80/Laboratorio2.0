/**
 * Offline-only chemical advisory worker. Never downloads SDS or mutates stores.
 * Operators MUST verify the original manufacturer's safety documentation.
 */
import {evaluateStorage} from './chemical-engine.js';
self.onmessage=({data})=>{
 const id=data?.id;
 if(!Number.isSafeInteger(id)||id<1)return;
 try{
  if(data?.type!=='EVALUATE')throw Error('Operación química desconocida');
  const started=performance.now();
  const result=evaluateStorage(data.records,data.options||{});
  self.postMessage({id,result:{...result,analyzedRecords:data.records.length,
   durationMs:Math.round(performance.now()-started),engine:'local-web-worker'}});
 }catch(error){
  self.postMessage({id,error:String(error?.message||error).slice(0,300)});
 }
};
