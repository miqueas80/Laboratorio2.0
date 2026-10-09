/**
 * Isolated experimental IndexedDB/OPFS storage. Does not replace, edit or erase
 * production localStorage inventory or NEXUS_X_DOCUMENTS_V2.
 */
export const EDGE_DB='NEXUS_X_EDGE_V1';
export const EDGE_STORES=Object.freeze(['inventory','calendar','mutation_log','attachments','meta']);
const requests=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
export function openEdgeDB({indexedDB=globalThis.indexedDB}={}){
 if(!indexedDB)throw Error('IndexedDB no disponible');
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(EDGE_DB,1);
  request.onupgradeneeded=()=>{
   const db=request.result;
   for(const name of EDGE_STORES)if(!db.objectStoreNames.contains(name))
     db.createObjectStore(name,{keyPath:name==='meta'?'key':'id'});
  };
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
  request.onblocked=()=>reject(Error('La base de datos está abierta en otra pestaña'));
 });
}
export async function readEdgeStore(db,store){
 if(!EDGE_STORES.includes(store))throw Error('Store no permitida');
 return requests(db.transaction(store,'readonly').objectStore(store).getAll());
}
/**
 * Exactly one native transaction. All queued requests are synchronous to avoid
 * IndexedDB auto-commit during an await. A failed operation aborts every write.
 */
export function atomicEdgeWrites(db,operations){
 if(!Array.isArray(operations)||operations.length>1000)throw Error('Demasiadas mutaciones');
 for(const op of operations)if(!op||!['inventory','calendar','mutation_log','attachments','meta'].includes(op.store)||!op.value||typeof op.value!=='object')
   throw Error('Mutación inválida');
 return new Promise((resolve,reject)=>{
  if(!operations.length)return resolve({committed:0});
  const stores=[...new Set(operations.map(op=>op.store))],tx=db.transaction(stores,'readwrite');
  tx.oncomplete=()=>resolve({committed:operations.length});
  tx.onerror=()=>reject(tx.error||Error('Transacción fallida'));
  tx.onabort=()=>reject(tx.error||Error('Transacción revertida'));
  try{for(const op of operations){const store=tx.objectStore(op.store);if(op.type==='delete')store.delete(op.value.id??op.value.key);else store.put(op.value)}}
  catch(error){tx.abort();reject(error)}
 });
}
export function inspectMigration(rows,{expectedCount=111}={}){
 if(!Array.isArray(rows)||rows.length!==expectedCount)return {ready:false,reason:'Cantidad inesperada de registros',count:rows?.length??0};
 const ids=new Set();
 for(const row of rows){
  if(!row||!/^NEXUS-X-\d{4}$/.test(row.id)||ids.has(row.id))return {ready:false,reason:'ID inválido o duplicado',count:rows.length};
  ids.add(row.id);
 }
 return {ready:true,count:rows.length,uniqueIds:ids.size};
}
/**
 * Explicit copy-only migration, default dry-run. Source remains untouched.
 * Consumer must inspect receipt, backups and app version before enabling.
 */
export async function migrateInventory(db,rows,{expectedCount=111,dryRun=true}={}){
 const check=inspectMigration(rows,{expectedCount});if(!check.ready)return {...check,copied:false};
 if(dryRun)return {...check,copied:false,dryRun:true};
 const existing=await readEdgeStore(db,'inventory');
 if(existing.length)return {...check,copied:false,reason:'Destino no está vacío: no sobrescribir'};
 const operations=rows.map(row=>({store:'inventory',value:{...row}}));
 operations.push({store:'meta',value:{key:'inventoryMigration',source:'nexus_x_inventory_v1',count:rows.length,at:new Date().toISOString()}});
 await atomicEdgeWrites(db,operations);
 return {...check,copied:true,dryRun:false};
}
const safeId=value=>{
 const id=String(value||'');
 if(!/^[a-zA-Z0-9_-]{1,90}\.(?:pdf|docx|xlsx|png|jpg|jpeg|webp)$/.test(id))throw Error('Nombre de adjunto inválido');
 return id;
};
/** OPFS supports large binary assets without base64 duplication. Never auto-delete originals. */
export async function putOPFS(name,blob,{navigatorObject=globalThis.navigator,maxBytes=32*1024*1024}={}){
 safeId(name);
 if(!(blob instanceof Blob)||blob.size>maxBytes)throw Error('Adjunto no válido o excede límite');
 if(!navigatorObject?.storage?.getDirectory)throw Error('OPFS no disponible');
 const dir=await navigatorObject.storage.getDirectory(),folder=await dir.getDirectoryHandle('nexus-edge',{create:true});
 const file=await folder.getFileHandle(name,{create:true}),writer=await file.createWritable();
 try{await writer.write(blob);await writer.close()}catch(error){await writer.abort().catch(()=>{});throw error}
 return {name,size:blob.size};
}
export async function getOPFS(name,{navigatorObject=globalThis.navigator}={}){
 safeId(name);
 if(!navigatorObject?.storage?.getDirectory)throw Error('OPFS no disponible');
 const dir=await navigatorObject.storage.getDirectory(),folder=await dir.getDirectoryHandle('nexus-edge');
 return (await folder.getFileHandle(name)).getFile();
}
