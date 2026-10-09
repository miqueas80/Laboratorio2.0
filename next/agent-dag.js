/**
 * NEXUS transactional DAG for local-only actions. External calls and UI effects
 * are not rollback-safe and are deliberately rejected as transactional writes.
 */
const NODE_MAX=24;
export function compilePlan(nodes,registry){
 if(!Array.isArray(nodes)||!nodes.length||nodes.length>NODE_MAX)throw Error('Cantidad de pasos inválida');
 const byId=new Map();
 for(const node of nodes){
  if(!node||typeof node.id!=='string'||!/^[a-zA-Z0-9_-]{1,50}$/.test(node.id)||byId.has(node.id))throw Error('Paso duplicado o inválido');
  if(!registry?.[node.tool]||typeof registry[node.tool].prepare!=='function')throw Error('Herramienta no registrada: '+node.tool);
  byId.set(node.id,{...node,dependsOn:Array.isArray(node.dependsOn)?node.dependsOn:[]});
 }
 const result=[],visiting=new Set(),visited=new Set();
 function visit(node){
  if(visiting.has(node.id))throw Error('El DAG contiene un ciclo');
  if(visited.has(node.id))return;
  visiting.add(node.id);
  for(const dep of node.dependsOn){if(!byId.has(dep))throw Error('Dependencia inexistente: '+dep);visit(byId.get(dep))}
  visiting.delete(node.id);visited.add(node.id);result.push(node);
 }
 for(const node of byId.values())visit(node);
 return result;
}
/**
 * Prepare is read-only; side effects are represented as transaction operations.
 * commit() must use one atomic IndexedDB transaction; no remote rollback claims.
 * @returns {Promise<{ok:boolean,results:object,committed:number}>}
 */
export async function runTransactionalPlan(nodes,{registry,commit,approved=false,signal,telemetry}={}){
 const ordered=compilePlan(nodes,registry),requiresApproval=ordered.some(n=>registry[n.tool].write===true);
 if(requiresApproval&&!approved)return {ok:false,reason:'CONFIRMATION_REQUIRED',committed:0,results:{}};
 if(typeof commit!=='function')throw Error('No hay adaptador de transacciones');
 const results={},operations=[];
 try{
  for(const node of ordered){
   if(signal?.aborted)throw Error('Cancelado por el usuario');
   const tool=registry[node.tool];
   if(tool.external===true||tool.uiEffect===true)throw Error('Efecto irreversible no permitido dentro de transacción');
   const prepared=await tool.prepare({args:node.args||{},results,signal});
   if(!prepared||typeof prepared!=='object')throw Error('Resultado de preparación inválido');
   if(!tool.write&&prepared.writes?.length)throw Error('Herramienta de lectura intentó escribir');
   const writes=prepared.writes||[];
   if(!Array.isArray(writes))throw Error('Mutaciones mal formadas');
   operations.push(...writes);
   results[node.id]=prepared.value??null;
  }
  if(signal?.aborted)throw Error('Cancelado por el usuario');
  const receipt=await commit(operations);
  telemetry?.log?.('info','dag-commit',{nodes:ordered.length,writes:operations.length});
  return {ok:true,results,committed:receipt?.committed??operations.length};
 }catch(error){
  telemetry?.log?.('error','dag-abort',{error:String(error?.message||error),prepared:Object.keys(results).length});
  return {ok:false,reason:String(error?.message||error),results:{},committed:0};
 }
}
