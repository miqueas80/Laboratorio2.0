/**
 * Read-only IndexedDB bridge for NEXUS's existing indexed local documents.
 * Never upgrades the production DB or creates/changes the document store.
 * Cursor avoids getAll() duplication of potentially large PDF/Office blobs.
 */
export async function readPublishedDocumentCache({indexedDB=globalThis.indexedDB,database='NEXUS_X_DOCUMENTS_V2',store='documents',limit=100}={}){
 if(!indexedDB)throw Error('IndexedDB no disponible');
 if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Límite inválido');
 const databases=typeof indexedDB.databases==='function'?await indexedDB.databases():null;
 if(databases&&!databases.some(db=>db.name===database))return {available:false,documents:[],reason:'No hay documentos indexados en este navegador'};
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(database);
  let missing=false,settled=false;
  function finish(value,error){
   if(settled)return;settled=true;
   if(error)reject(error);else resolve(value);
  }
  request.onupgradeneeded=()=>{missing=true;request.transaction.abort()};
  request.onerror=()=>finish({available:false,documents:[],reason:'El índice documental todavía no existe'},missing?null:request.error);
  request.onblocked=()=>finish(null,Error('Base documental bloqueada por otra pestaña'));
  request.onsuccess=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(store)){
    db.close();finish({available:false,documents:[],reason:'Store documental no disponible'});return;
   }
   const tx=db.transaction(store,'readonly'),docs=[];
   let total=0,limited=false;
   tx.objectStore(store).openCursor().onsuccess=event=>{
    const cursor=event.target.result;
    if(!cursor)return;
    total++;
    if(docs.length<limit){
     const d=cursor.value;
     if(d?.path)docs.push({
      name:String(d.name||d.path),path:String(d.path),
      type:String(d.type||''),text:String(d.text||'').slice(0,1000000),
      chunks:Array.isArray(d.chunks)?d.chunks.slice(0,300).map(x=>String(x).slice(0,5000)):null
     });
     cursor.continue();
    }else limited=true;
   };
   tx.oncomplete=()=>{db.close();finish({available:true,documents:docs,total:limited?null:total,limited})};
   tx.onerror=()=>{db.close();finish(null,tx.error||Error('Fallo leyendo documentos'))};
   tx.onabort=()=>{db.close();finish(null,tx.error||Error('Lectura abortada'))};
  };
 });
}
