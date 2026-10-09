/**
 * Opt-in executable lab DAG: QR -> local record -> verified SDS -> expiry ->
 * calendar write. No chemical identity is inferred from unverified visual text.
 * Read-only stages prepare data; IndexedDB atomicEdgeWrites commits at the end.
 */
import {runTransactionalPlan} from './agent-dag.js';
import {atomicEdgeWrites} from './storage.js';
import {inspectSafety} from './chemical-engine.js';
const isoDay=(date)=>{const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return y+'-'+m+'-'+d};
function expiryDate(value){
 const text=String(value||'').trim();
 let match=text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(!match){const dd=text.match(/^(\d{2})[\/.](\d{2})[\/.](\d{4})$/);if(dd)match=[text,dd[3],dd[2],dd[1]]}
 if(!match)return null;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
 const parsed=new Date(year,month-1,day,12);
 return parsed.getFullYear()===year&&parsed.getMonth()===month-1&&parsed.getDate()===day?isoDay(parsed):null;
}
export function makeInspectionRegistry({inventory=[],documents=[],today=new Date()}={}){
 if(!Array.isArray(inventory)||!Array.isArray(documents))throw Error('Fuentes locales inválidas');
 const byId=new Map(inventory.map(x=>[x.id,x]));
 return {
  observe:{write:false,prepare:async({args})=>{
   const exact=/^NEXUS-X-\d{4}$/.test(String(args.code||''))?args.code:null;
   return {value:{code:exact,visibleText:String(args.visibleText||'').slice(0,250),verifiedByQR:Boolean(exact)}};
  }},
  match:{write:false,prepare:async({results})=>{
   const observation=results.observe,record=observation.code?byId.get(observation.code):null;
   return {value:record?{id:record.id,name:record.name,formula:record.formula||'',expiry:record.expiry||null,verifiedByQR:true}:null};
  }},
  safety:{write:false,prepare:async({results})=>{
   const record=results.match,original=record?byId.get(record.id):null;
   if(!original)return {value:{available:false,reason:'No hay identidad química confirmada'}};
   const sds=inspectSafety(original),matches=documents.filter(doc=>doc?.verifiedSDS===true&&doc.recordId===record.id).slice(0,3);
   return {value:{available:sds.valid&&matches.length>0,sds:sds.valid?sds:null,
    documents:matches.map(x=>({name:x.name,path:x.path})),reason:sds.valid&&matches.length?'SDS con origen validado':'No hay SDS local verificada para esta sustancia'}};
  }},
  expiry:{write:false,prepare:async({results})=>{
   const record=results.match,date=expiryDate(record?.expiry),now=isoDay(today);
   return {value:{state:!date?'unknown':date<now?'expired':'current',date,now}};
  }},
  reminder:{write:true,prepare:async({args,results})=>{
   const record=results.match,expiry=results.expiry;
   if(!record||expiry.state!=='expired')return {value:{created:false,reason:'No se acreditó vencimiento'},writes:[]};
   const id='review-'+record.id+'-'+expiry.date;
   const text='Revisar reactivo vencido: '+record.name+' ('+record.id+'). No utilizar antes de la revisión.';
   return {value:{created:true,id,text},writes:[{store:'calendar',value:{id,date:expiry.now,text,source:'nexus-edge-expiry',recordId:record.id}}]};
  }}
 };
}
export function makeInspectionDAG(observation){
 return [
  {id:'observe',tool:'observe',args:{code:observation.code||'',visibleText:observation.visibleText||''}},
  {id:'match',tool:'match',dependsOn:['observe']},
  {id:'safety',tool:'safety',dependsOn:['match']},
  {id:'expiry',tool:'expiry',dependsOn:['match']},
  {id:'reminder',tool:'reminder',dependsOn:['expiry','safety']}
 ];
}
export async function inspectAndSchedule({observation={},inventory=[],documents=[],db,approved=false,today=new Date(),telemetry}={}){
 if(!db)throw Error('Base Edge no disponible');
 const registry=makeInspectionRegistry({inventory,documents,today});
 return runTransactionalPlan(makeInspectionDAG(observation),{registry,approved,telemetry,commit:ops=>atomicEdgeWrites(db,ops)});
}
