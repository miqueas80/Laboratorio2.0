/* Dedicated BM25/vector search Worker. No DOM, no network access. */
import {buildIndex,searchIndex} from './search-core.js';
import {HNSWIndex} from './hnsw.js';
const indexes=new Map(),graphs=new Map();
self.onmessage=({data})=>{
 const {id,type,name='default'}=data||{};
 try {
  let result;
  if(type==='BUILD'){
   const idx=buildIndex(data.rows,data.options),embedded=[...idx.docs.values()].filter(doc=>doc.vector);
   let graph=null;
   if(embedded.length) {
     graph=new HNSWIndex({dimension:idx.dimension,m:data.options?.hnswM||12,efSearch:data.options?.efSearch||48});
     graph.addAll(embedded);
   }
   indexes.set(name,idx);graphs.set(name,graph);
   result={count:idx.docs.size,terms:idx.postings.size,vectorDimension:idx.dimension,hnsw:graph?.stats()||null};
  }else if(type==='QUERY'){
   if(!indexes.has(name))throw Error('Índice no preparado');
   const options=data.options||{},graph=graphs.get(name);
   const candidateIds=graph&&options.vector?graph.search(options.vector,{k:Math.max(options.limit||20,options.efSearch||48),ef:options.efSearch||48}).map(row=>row.id):null;
   result=searchIndex(indexes.get(name),data.query,{...options,candidateIds});
  }else if(type==='STATS'){
   const idx=indexes.get(name);result=idx?{count:idx.docs.size,terms:idx.postings.size,dimension:idx.dimension}:null;
  }else if(type==='CLEAR'){
   indexes.delete(name);graphs.delete(name);result=true;
  }else throw Error('Operación desconocida');
  self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:String(error?.message||error)})}
};
