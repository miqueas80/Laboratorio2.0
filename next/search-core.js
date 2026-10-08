/**
 * @file NEXUS Edge Search — BM25 compact postings + optional real vectors.
 * Fully offline. Designed for a dedicated Web Worker.
 *
 * Posting lists use numeric document ordinals and flat [ordinal,tf] arrays,
 * rather than one Map object per posting. Results expose original record IDs.
 */
const fold=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function tokenize(text){
 return (fold(text).match(/\b\d{2,7}-\d{2}-\d\b|[a-z0-9]+/g)||[]).filter(t=>t.length>1);
}
function vectorize(values,dimension){
 if(values==null)return null;
 if(!Array.isArray(values)&&!(values instanceof Float32Array))throw Error('Vector inválido');
 if(values.length!==dimension)throw Error('Dimensión o componentes de vector inválidos');
 let squared=0;
 for(const value of values){if(!Number.isFinite(value))throw Error('Dimensión o componentes de vector inválidos');squared+=value*value}
 const norm=Math.sqrt(squared);
 if(!(norm>1e-9))throw Error('Vector de módulo cero');
 return Float32Array.from(values,x=>x/norm);
}
/**
 * Build a compressed inverted index (lexical) and optional vector store.
 * String IDs remain stable across import/export. No full text is retained.
 * @param {Array<{id:string,text:string,vector?:number[]}>} rows
 */
export function buildIndex(rows,{dimension=384,maxRows=150000}={}){
 if(!Array.isArray(rows)||rows.length>maxRows)throw Error('Límite de índice excedido');
 if(!Number.isInteger(dimension)||dimension<1||dimension>4096)throw Error('Dimensión inválida');
 const docs=new Map(),order=[],postings=new Map();
 let lengthSum=0;
 for(const row of rows){
  const id=String(row?.id||'').trim();
  if(!id||id.length>180||docs.has(id))throw Error('ID ausente o duplicado');
  const text=String(row.text||'').slice(0,30000),tokens=tokenize(text);
  const counts=new Map();
  for(const word of tokens)counts.set(word,(counts.get(word)||0)+1);
  const ordinal=order.length,doc={id,ordinal,length:tokens.length,vector:vectorize(row.vector,dimension)};
  docs.set(id,doc);order.push(doc);lengthSum+=tokens.length;
  for(const [word,tf] of counts){
   let posting=postings.get(word);
   if(!posting){posting=[];postings.set(word,posting)}
   posting.push(ordinal,tf);
  }
 }
 return {docs,order,postings,averageLength:lengthSum/Math.max(1,order.length),dimension};
}
/**
 * BM25 normalized by the maximum lexical score in this query, optionally
 * combined with cosine similarity from supplied local embeddings.
 * Similarity is not a probability, and absent vectors never create matches.
 */
export function searchIndex(index,query,{
 vector=null,limit=20,lexicalWeight=.7,semanticWeight=.3,candidateIds=null
}={}){
 if(!index?.docs||!index?.postings||!Array.isArray(index.order))throw Error('Índice no inicializado');
 const terms=[...new Set(tokenize(query))].slice(0,24);
 const qVector=vectorize(vector,index.dimension);
 const scores=new Map(),n=index.docs.size,avg=index.averageLength||1,k1=1.5,b=.75;
 for(const term of terms){
  const posting=index.postings.get(term);
  if(!posting)continue;
  const df=posting.length/2,idf=Math.log(1+(n-df+.5)/(df+.5));
  for(let p=0;p<posting.length;p+=2){
   const ordinal=posting[p],tf=posting[p+1],doc=index.order[ordinal];
   const numerator=tf*(k1+1),denominator=tf+k1*(1-b+b*doc.length/avg);
   scores.set(ordinal,(scores.get(ordinal)||0)+idf*numerator/denominator);
  }
 }
 let maxBm25=0;
 for(const value of scores.values())if(value>maxBm25)maxBm25=value;
 const exact=fold(query).trim(),out=[];
 let ordinals;
 if(!qVector)ordinals=scores.keys();
 else if(!candidateIds)ordinals=index.order.keys();
 else{
  const found=new Set(scores.keys());
  for(const id of candidateIds){
   const doc=index.docs.get(id);
   if(doc)found.add(doc.ordinal);
  }
  ordinals=found.values();
 }
 for(const ordinal of ordinals){
  const doc=index.order[ordinal];
  if(!doc)continue;
  const lexical=scores.get(ordinal)||0;
  let semantic=null;
  if(qVector&&doc.vector){
   let cosine=0;for(let i=0;i<index.dimension;i++)cosine+=doc.vector[i]*qVector[i];
   semantic=cosine;
  }
  if(!lexical&&(semantic===null||semantic<=0))continue;
  const normalizedLexical=maxBm25?lexical/maxBm25:0;
  const boosted=(fold(doc.id)===exact?1.25:1)*normalizedLexical;
  const score=lexicalWeight*boosted+semanticWeight*Math.max(0,semantic??0);
  out.push({
   id:doc.id,score:Number(score.toFixed(6)),
   lexical:Number(lexical.toFixed(6)),
   similarity:semantic===null?null:Number(semantic.toFixed(6))
  });
 }
 out.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
 return out.slice(0,Math.min(Math.max(1,Math.trunc(limit)||20),100));
}
