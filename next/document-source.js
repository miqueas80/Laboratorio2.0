/**
 * Read-only IndexedDB bridge for NEXUS's existing indexed local documents.
 * Never upgrades the production DB or creates/changes the document store.
 */
export async function readPublishedDocumentCache({indexedDB=globalThis.indexedDB,database='NEXUS_X_DOCUMENTS_V2',store='documents',limit=100}={}){
 if(!indexedDB)throw Error('IndexedDB no disponible');
 const databases=typeof indexedDB.databases==='function'?await indexedDB.databases():null;
 if(databases&&!databases.some(db=>db.name===database))return {available:false,documents:[],reason:'No hay documentos indexados en este navegador'};
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(database);
  let created=false;
  request.onupgradeneeded=()=>{created=true;request.transaction.abort()};
  request.onerror=()=>created?resolve({available:false,documents:[],reason:'El índice documental todavía no existe'}):reject(request.error);
  request.onsuccess=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(store)){db.close();resolve({available:false,documents:[],reason:'Store documental no disponible'});return}
   const tx=db.transaction(store,'readonly'),query=tx.objectStore(store).getAll();
   query.onsuccess=()=>{
    const raw=Array.isArray(query.result)?query.result:[],documents=raw.slice(0,limit).map(d=>({
     name:String(d?.name||d?.path||'Documento'),path:String(d?.path||''),
     type:String(d?.type||''),text:String(d?.text||'').slice(0,1000000),
     chunks:Array.isArray(d?.chunks)?d.chunks.slice(0,300).map(x=>String(x).slice(0,5000)):null
    })).filter(d=>d.path);
    db.close();resolve({available:true,documents,total:raw.length,limited:raw.length>limit});
   };
   query.onerror=()=>{db.close();reject(query.error)};
  };
 });
}
