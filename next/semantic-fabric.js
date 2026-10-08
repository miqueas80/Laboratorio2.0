/**
 * Joins read-only document Fabric and an optional offline encoder. This class
 * always provides a lexical fallback; unsupported models never trigger network.
 */
import {EvidenceFabric} from './fabric-client.js';
import {LocalEmbeddingClient} from './embedding-client.js';
export class SemanticEvidenceFabric {
 constructor({fabric=new EvidenceFabric(),encoder=new LocalEmbeddingClient()}={}) {
  this.fabric=fabric;this.encoder=encoder;this.mode='unprepared';
 }
 async prepare(documents,{semantic=false,onProgress=()=>{}}={}){
  let vectors=null,reason='';
  if(semantic){
   try{
    const status=await this.encoder.status();
    if(!status.installed)reason='Motor semántico no instalado localmente';
    else{
     await this.encoder.prepare();
     const {documentRows}=await import('./document-fabric.js');
     const rows=documentRows(documents);
     vectors=await this.encoder.embed(rows.map(x=>x.text.slice(0,1400)),{onProgress});
    }
   }catch(error){reason='Embeddings no disponibles: '+String(error.message||error)}
  }
  const result=await this.fabric.build(documents,{vectors});
  this.mode=vectors?'hybrid':'lexical';
  return {...result,mode:this.mode,reason};
 }
 async query(text,{limit=8}={}){
  let vector=null;
  if(this.mode==='hybrid'){
   try{vector=(await this.encoder.embed([text]))[0]}
   catch{this.mode='lexical'}
  }
  return {mode:this.mode,evidence:await this.fabric.query(text,{vector,limit})};
 }
 close(){this.fabric.close();this.encoder.close()}
}
