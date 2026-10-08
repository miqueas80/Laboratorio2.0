/* Dedicated BM25/vector search Worker. No DOM, no network access. */
import {buildIndex,searchIndex} from './search-core.js';
const indexes=new Map();
self.onmessage=({data})=>{
 const {id,type,name='default'}=data||{};
 try {
  let result;
  if(type==='BUILD'){
   indexes.set(name,buildIndex(data.rows,data.options));
   const idx=indexes.get(name);
   result={count:idx.docs.size,terms:idx.postings.size,vectorDimension:idx.dimension};
  }else if(type==='QUERY'){
   if(!indexes.has(name))throw Error('Índice no preparado');
   result=searchIndex(indexes.get(name),data.query,data.options);
  }else if(type==='STATS'){
   const idx=indexes.get(name);result=idx?{count:idx.docs.size,terms:idx.postings.size,dimension:idx.dimension}:null;
  }else if(type==='CLEAR'){
   indexes.delete(name);result=true;
  }else throw Error('Operación desconocida');
  self.postMessage({id,result});
 }catch(error){self.postMessage({id,error:String(error?.message||error)})}
};
