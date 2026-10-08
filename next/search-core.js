/**
 * @file NEXUS Edge Search — lexical BM25 + optional local image/text vector scores.
 * Zero network requests. The embedding model is supplied by the caller and never guessed.
 * This engine is intended to run in a Web Worker, not the UI thread.
 */
const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function tokenize(text) {
  return (fold(text).match(/\b\d{2,7}-\d{2}-\d\b|[a-z0-9]+/g)||[]).filter(t=>t.length>1);
}
function vectorize(values,dimension) {
  if(values==null)return null;
  if(!Array.isArray(values)&&!(values instanceof Float32Array))throw Error('Vector inválido');
  if(values.length!==dimension||!values.every(Number.isFinite))throw Error('Dimensión o componentes de vector inválidos');
  let norm=Math.hypot(...values);if(!(norm>1e-9))throw Error('Vector de módulo cero');
  return Float32Array.from(values,x=>x/norm);
}
/** @param {Array<{id:string,text:string,vector?:number[]}>} rows */
export function buildIndex(rows,{dimension=384,maxRows=150000}={}) {
  if(!Array.isArray(rows)||rows.length>maxRows)throw Error('Límite de índice excedido');
  if(!Number.isInteger(dimension)||dimension<1||dimension>4096)throw Error('Dimensión inválida');
  const docs=new Map(),postings=new Map();let lengthSum=0;
  for(const row of rows){
    const id=String(row?.id||'').trim();if(!id||id.length>180||docs.has(id))throw Error('ID ausente o duplicado');
    const text=String(row.text||'').slice(0,30000);
    const tokens=tokenize(text),counts=new Map();for(const word of tokens)counts.set(word,(counts.get(word)||0)+1);
    const vector=vectorize(row.vector,dimension),length=tokens.length;
    docs.set(id,{id,length,vector,textPreview:text.slice(0,300)});
    lengthSum+=length;
    for(const [word,tf] of counts){let posting=postings.get(word);if(!posting){posting=new Map();postings.set(word,posting)}posting.set(id,tf)}
  }
  return {docs,postings,averageLength:lengthSum/Math.max(1,docs.size),dimension};
}
/**
 * Sorted BM25 scores with optional cosine scores. Similarity is not a calibrated probability.
 * Exact IDs/CAS get a keyword boost; no unrelated semantic results without a real vector.
 */
export function searchIndex(index,query,{vector=null,limit=20,lexicalWeight=.7,semanticWeight=.3}={}) {
  if(!index?.docs||!index?.postings)throw Error('Índice no inicializado');
  const terms=[...new Set(tokenize(query))].slice(0,24);
  const qVector=vectorize(vector,index.dimension);
  const scores=new Map(),n=index.docs.size,avg=index.averageLength||1,k1=1.5,b=.75;
  for(const term of terms){
    const posting=index.postings.get(term);if(!posting)continue;
    const df=posting.size,idf=Math.log(1+(n-df+.5)/(df+.5));
    for(const [id,tf] of posting){
      const doc=index.docs.get(id);
      const numerator=tf*(k1+1),denominator=tf+k1*(1-b+b*doc.length/avg);
      scores.set(id,(scores.get(id)||0)+idf*numerator/denominator);
    }
  }
  const maxBm25=Math.max(0,...scores.values()),out=[],exact=fold(query).trim();
  const ids=qVector?index.docs.keys():scores.keys();
  for(const id of ids){
    const doc=index.docs.get(id),lexical=scores.get(id)||0;
    const semantic=qVector&&doc.vector?doc.vector.reduce((total,v,i)=>total+v*qVector[i],0):null;
    if(!lexical&&(semantic===null||semantic<=0))continue;
    const normalizedLexical=maxBm25?lexical/maxBm25:0;
    const boosted=(fold(id)===exact?1.25:1)*normalizedLexical;
    const score=lexicalWeight*boosted+semanticWeight*Math.max(0,semantic??0);
    out.push({id,score:Number(score.toFixed(6)),lexical:Number(lexical.toFixed(6)),similarity:semantic===null?null:Number(semantic.toFixed(6))});
  }
  out.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  return out.slice(0,Math.min(Math.max(1,Math.trunc(limit)||20),100));
}
