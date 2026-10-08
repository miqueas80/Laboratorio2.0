/**
 * Experimental NEXUS IA local planner. No LLM and NO network calls.
 *
 * Queries existing inventory plus verified document evidence by using the DAG
 * registry. Never infers chemistry from a camera guess and never silently
 * executes calendar, hardware, or other mutating commands. UI navigation is
 * a declarative view request, to be fulfilled by an explicitly allowed adapter.
 */
import {buildIndex,searchIndex} from './search-core.js';
import {runTransactionalPlan} from './agent-dag.js';

const fold=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const intent=message=>{
 const text=fold(message).replace(/^nexus(?:[ ,.:;-]+)?/,'').trim();
 if(!text||text.length>1500)throw Error('Consulta vacía o demasiado extensa');
 const navigate=/\b(?:abri|abrime|abre|abrir|mostra|mostrame|muestra|mostrar|anda a|ir a)\b/.test(text);
 const view=/\b(?:inventario|materiales|reactivos)\b/.test(text)?'inventory':
  /\b(?:documentos|archivos|fabric)\b/.test(text)?'documents':
  /\b(?:lens|camara|escaner)\b/.test(text)?'lens':null;
 const search=/\b(?:busca|buscame|buscar|encontra|encontrame|encontrar|que documentos|cuales documentos|donde esta|que tenemos sobre)\b/.test(text);
 const count=/\b(?:cuantos|cuantas|cantidad|total|numero de)\b/.test(text)&&/\b(?:inventario|registros|materiales|reactivos)\b/.test(text);
 const safety=/\b(?:compatibilidad|incompatibilidad|reaccion|peligro|almacenar juntos|guardar juntos)\b/.test(text);
 const mutation=/\b(?:recordame|recuerdame|crea|crear|agrega|agregar|elimina|borra|borrar|cambia|cambiar|mueve|mover)\b/.test(text);
 const query=text.replace(/^.*?\b(?:busca|buscame|buscar|encontra|encontrame|encontrar|sobre|de)\b\s*(?:el|la|los|las|un|una)?\s*/,'')
  .replace(/^(?:en|del|la|el|un|una|inventario|documentos)\s+/,'').trim();
 return {text,view,navigate,search,count,safety,mutation,query:query||text};
};
export function parseEdgeIntent(message){return intent(message)}
function recordText(row){
 return [row.id,row.name,row.formula,row.cas,row.category,row.location].filter(Boolean).join(' ');
}
export class NexusEdgeAgent {
 constructor({inventory=[],fabric=null,maxResults=6}={}){
  if(!Array.isArray(inventory)||inventory.length>150000)throw Error('Inventario inválido');
  const found=new Set();
  for(const row of inventory){
   if(typeof row?.id!=='string'||!row.id||found.has(row.id))throw Error('Registro sin ID único');
   found.add(row.id);
  }
  this.inventory=inventory;this.fabric=fabric;
  this.limit=Math.min(20,Math.max(1,maxResults));
  this.byId=new Map(inventory.map(record=>[record.id,record]));
  this.index=buildIndex(inventory.map(record=>({id:record.id,text:recordText(record)})));
 }
 plan(message){
  const i=intent(message),nodes=[];
  // Every step is an explicit read-only registered operation in the DAG.
  if(i.view&&i.navigate)nodes.push({id:'view',tool:'suggestView',args:{view:i.view}});
  if(i.count)nodes.push({id:'count',tool:'count'});
  if(i.safety)nodes.push({id:'safe',tool:'safetyGuard'});
  else if(i.search){
   if(i.view==='documents'||/\b(documentos|archivos|pdf|word|excel)\b/.test(i.text)){
    nodes.push({id:'lookup',tool:'findDocuments',args:{query:i.query}});
   }else nodes.push({id:'lookup',tool:'findInventory',args:{query:i.query},
    dependsOn:nodes.some(n=>n.id==='view')?['view']:[]});
  }
  if(i.mutation)nodes.push({id:'writeGuard',tool:'mutationGuard'});
  if(!nodes.length&&/\b(?:que podes hacer|ayuda|funciones|capacidades)\b/.test(i.text))
   nodes.push({id:'help',tool:'help'});
  if(!nodes.length)nodes.push({id:'unknown',tool:'unknown'});
  return {intent:i,nodes};
 }
 async turn(message,{signal=null}={}){
  const {nodes,intent:i}=this.plan(message);
  const registry={
   suggestView:{prepare:async({args})=>({value:{view:args.view,supported:args.view!=='lens'}})},
   count:{prepare:async()=>({value:{count:this.inventory.length}})},
   findInventory:{prepare:async({args})=>{
    const raw=args.query.trim();
    const exact=this.byId.get(raw.toUpperCase());
    const found=exact?[{id:exact.id,score:1}]:
     searchIndex(this.index,raw,{limit:this.limit});
    return {value:found.map(hit=>{
     const record=this.byId.get(hit.id);
     return {id:record.id,name:record.name||'Sin nombre',formula:record.formula||null,
      category:record.category||null,source:'inventory',score:hit.score};
    })};
   }},
   findDocuments:{prepare:async({args})=>{
    if(!this.fabric||typeof this.fabric.query!=='function')return {value:{ready:false,evidence:[]}};
    // Supports SemanticEvidenceFabric.query {mode,evidence} and EvidenceFabric.query []
    const found=await this.fabric.query(args.query,{limit:this.limit});
    return {value:{ready:true,evidence:Array.isArray(found)?found:(found.evidence||[]),
     mode:Array.isArray(found)?'lexical':found.mode||'unknown'}};
   }},
   safetyGuard:{prepare:async()=>({value:{
    verified:false,reason:'La compatibilidad química requiere sustancias exactas y SDS verificadas. No inferir seguridad por nombre o aspecto.'}})},
   mutationGuard:{prepare:async()=>({value:{
    allowed:false,reason:'Una instrucción que modifica datos necesita una herramienta específica y confirmación.'}})},
   help:{prepare:async()=>({value:['Consultar inventario local','Buscar evidencia en documentos','Solicitar vistas de inventario y documentos','Informar límites de seguridad']})},
   unknown:{prepare:async()=>({value:{supported:false}})}
  };
  const execution=await runTransactionalPlan(nodes,{registry,signal,commit:async writes=>{
   if(writes.length)throw Error('El asistente local no admite mutaciones implícitas');
   return {committed:0};
  }});
  if(!execution.ok)return {...execution,reply:'No se pudo completar la consulta local.',viewRequest:null,evidence:[]};
  const results=execution.results;
  const viewRequest=results.view?.supported?results.view.view:null;
  const inventory=Array.isArray(results.lookup)?results.lookup:null;
  const docs=results.lookup&&!Array.isArray(results.lookup)?results.lookup:null;
  let reply='Puedo consultar las herramientas locales disponibles; no tengo evidencia suficiente para esa pregunta.';
  if(results.writeGuard)reply='No realicé cambios. Para modificar datos hace falta una herramienta explícita y confirmación.';
  else if(results.safe)reply=results.safe.reason;
  else if(results.count)reply='El inventario consultado tiene '+results.count.count+' registros.';
  else if(inventory)reply=inventory.length?
   'Encontré '+inventory.length+' coincidencia(s) en el inventario local.':'No encontré coincidencias en el inventario local.';
  else if(docs)reply=!docs.ready?'Los documentos todavía no están indexados para esta sesión.':
   docs.evidence.length?'Encontré '+docs.evidence.length+' fragmento(s) de documentos con fuente.':'No encontré evidencia documental suficiente.';
  else if(results.help)reply='Puedo consultar inventario y documentos locales y sugerir navegación. Las acciones que cambian datos requieren confirmación.';
  else if(viewRequest)reply='Vista solicitada: '+viewRequest+'. Su apertura depende de la interfaz conectada.';
  return {ok:true,reply,viewRequest,inventory:inventory||[],evidence:docs?.evidence||[],
   mode:docs?.mode||'local-lexical',safeToExecute:false,steps:nodes.map(n=>n.tool)};
 }
}
