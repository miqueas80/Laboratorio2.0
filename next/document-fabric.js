/**
 * NEXUS Evidence Fabric — pure transformations, no file mutation or network.
 * Documents are supplied by NEXUS's existing IndexedDB cache or caller.
 * Every result retains exact source path and fragment offsets.
 */
export function chunkEvidence(text,{size=850,overlap=120,maxFragments=600}={}){
 if(typeof text!=='string'||!Number.isInteger(size)||size<128||size>5000||!Number.isInteger(overlap)||overlap<0||overlap>=size||!Number.isInteger(maxFragments)||maxFragments<1||maxFragments>10000)
  throw Error('Parámetros de fragmentación inválidos');
 const normalized=text.replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').trim();
 const out=[];let start=0;
 while(start<normalized.length&&out.length<maxFragments){
  let end=Math.min(normalized.length,start+size);
  if(end<normalized.length){
   const candidate=normalized.lastIndexOf(' ',end);
   if(candidate>start+size*.65)end=candidate;
  }
  const value=normalized.slice(start,end).trim();
  if(value)out.push({text:value,start,end});
  if(end>=normalized.length)break;
  start=Math.max(start+1,end-overlap);
 }
 return out;
}
/**
 * Create indexable items from actual cached document text and optional chunks.
 * The source's document type is untrusted metadata, not code to execute.
 */
export function documentRows(documents,{limitDocuments=100,perDocument=300}={}){
 if(!Array.isArray(documents)||documents.length>limitDocuments)throw Error('Límite documental excedido');
 const rows=[],seen=new Set();
 for(const doc of documents){
  const path=String(doc?.path||'').trim();
  if(!path||path.length>350||seen.has(path))throw Error('Ruta documental inválida/duplicada');
  seen.add(path);
  const name=String(doc.name||path).slice(0,240);
  const chunks=Array.isArray(doc.chunks)&&doc.chunks.length?doc.chunks.slice(0,perDocument).map((text,index)=>({text:String(text),index,start:null,end:null})):
    chunkEvidence(doc.text||'',{maxFragments:perDocument}).map((row,index)=>({...row,index}));
  for(const fragment of chunks){
   if(!fragment.text.trim())continue;
   const id=path+'#fragment-'+fragment.index;
   rows.push({id,text:name+'\n'+fragment.text,source:{path,name,index:fragment.index,start:fragment.start,end:fragment.end,type:String(doc.type||'unknown').slice(0,15)}});
  }
 }
 return rows;
}
export function mergeDocumentEvidence(rows,hits,{maxExcerpt=420}={}){
 const map=new Map(rows.map(row=>[row.id,row])),out=[];
 for(const hit of hits){
  const source=map.get(hit.id);if(!source)continue;
  const text=source.text.split('\n').slice(1).join('\n');
  out.push({id:hit.id,source:source.source,score:hit.score,lexical:hit.lexical,similarity:hit.similarity,excerpt:text.slice(0,maxExcerpt)+(text.length>maxExcerpt?'…':'')});
 }
 return out;
}
