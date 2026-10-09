import {documentRows,mergeDocumentEvidence} from './document-fabric.js';
import {EdgeSearchClient} from './search-client.js';
/** One read-only Fabric query uses BM25; vectors are optional until a local model is installed. */
export class EvidenceFabric {
 constructor({search=new EdgeSearchClient(),name='fabric'}={}){this.search=search;this.name=name;this.rows=[];this.prepared=false}
 async build(documents,{vectors=null}={}){
  const rows=documentRows(documents);
  if(vectors!==null&&(!Array.isArray(vectors)||vectors.length!==rows.length))throw Error('Embeddings incompatibles con fragmentos');
  const indexed=rows.map((row,i)=>({id:row.id,text:row.text,...(vectors?{vector:vectors[i]}:{})}));
  const stats=await this.search.build(indexed,{dimension:vectors?.[0]?.length||384},this.name);
  this.rows=rows;this.prepared=true;return {documents:documents.length,fragments:rows.length,...stats};
 }
 async query(question,{vector=null,limit=8}={}){
  if(!this.prepared)throw Error('Fabric todavía no fue indexado');
  const hits=await this.search.query(question,{vector,limit},this.name);
  return mergeDocumentEvidence(this.rows,hits);
 }
 close(){this.search.close();this.rows=[];this.prepared=false}
}
