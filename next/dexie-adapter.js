/**
 * Optional experimental Dexie adapter. It does not alter or upgrade
 * NEXUS_X_DOCUMENTS_V2 or the current production localStorage inventory.
 * Requires a locally vendored Dexie.js constructor explicitly injected.
 */
export const DEXIE_EDGE_DB='NEXUS_X_EDGE_DEXIE_DEV_V1';
const TABLES=Object.freeze({inventory:'id',calendar:'id',mutation_log:'id',attachments:'id',meta:'key'});
export async function openDexieEdge({Dexie,dbName=DEXIE_EDGE_DB}={}){
 if(typeof Dexie!=='function')throw Error('Dexie.js local no está disponible');
 if(dbName!=='NEXUS_X_EDGE_DEXIE_DEV_V1'&&!/^NEXUS_X_EDGE_TEST_[A-Z0-9_]{1,40}$/.test(dbName))
  throw Error('Nombre de base no permitido; no se puede abrir producción');
 const db=new Dexie(dbName);
 db.version(1).stores(TABLES);
 await db.open();
 return {
  raw:db,close:()=>db.close(),
  async all(table){if(!Object.hasOwn(TABLES,table))throw Error('Tabla inválida');return db.table(table).toArray()},
  async commit(operations){
   if(!Array.isArray(operations)||operations.length>1000)throw Error('Operaciones inválidas');
   const tables=[...new Set(operations.map(op=>op.store))];
   if(tables.some(table=>!Object.hasOwn(TABLES,table)))throw Error('Tabla desconocida');
   if(!operations.length)return {committed:0};
   await db.transaction('rw',...tables.map(name=>db.table(name)),async()=>{
    for(const op of operations){
     const t=db.table(op.store),key=op.store==='meta'?'key':'id';
     if(op.type==='delete'){
      const id=op.value?.[key];if(!id)throw Error('Clave de borrado inválida');
      await t.delete(id);
     }else{
      if(!op.value||!op.value[key])throw Error('Registro sin clave');
      await t.put(op.value);
     }
    }
   });
   return {committed:operations.length};
  }
 };
}
