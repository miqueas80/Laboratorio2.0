/**
 * Android device acceptance panel. All visible results are release gates,
 * not certifications. No model weights, audio, camera frames, document text,
 * chemical details, passwords or API keys are collected/exported.
 */
import {EDGE_RELEASE_CHECKS,evaluateEdgeRelease,createEdgeAcceptanceReport} from './acceptance.js';
import {inspectMigration} from './storage.js';
import {readEdgeAvailableDocuments} from './canonical-source.js';
import {offlineShellStatus} from './offline-shell.js';

export function deriveAutomaticEdgeChecks({
 inventory=[],documents=null,shell=null,voice=null,vision=null,offline=false,
 controller=false,performance=null,visibleCount=0,memoryMiB=null,memoryVerified=false
}={}){
 const verifiedInventory=inspectMigration(inventory);
 const docs=documents?.available===true&&documents?.limited!==true&&
   documents?.documents?.length===6&&documents?.total===6;
 const perf=performance?.mode==='active-virtual-scroll'&&visibleCount>=100001&&
   Number.isFinite(performance?.averageFPS)&&Number.isFinite(performance?.p95FrameMs)&&
   performance.averageFPS>=60&&performance.p95FrameMs<=1000/60;
 return {
  inventory111:verifiedInventory.ready===true,
  documents6:Boolean(docs),
  offline:offline===true&&controller===true&&shell?.ready===true&&shell?.inventoryCached===true,
  lensCached:vision?.ready===true,
  voiceCached:voice?.ready===true,
  fps100k:perf===true,
  memory80:memoryVerified===true&&Number.isFinite(memoryMiB)&&memoryMiB>0&&memoryMiB<=80
 };
}
export function setupDeviceAcceptance({
 documentObject=globalThis.document,windowObject=globalThis.window,
 readInventory,performanceResult=()=>null,virtualMetrics=()=>({count:0}),
 output=()=>{}
}={}){
 if(!documentObject||!windowObject||typeof readInventory!=='function')
  throw Error('Dispositivo o inventario no disponible');
 const $=id=>documentObject.getElementById(id);
 const holder=$('deviceGateChecks');
 if(!holder)throw Error('Panel de aceptación no encontrado');
 const manualChecks=EDGE_RELEASE_CHECKS.filter(x=>x.kind==='manual');
 const selected=new Map();
 for(const check of manualChecks){
  const label=documentObject.createElement('label');
  const input=documentObject.createElement('input');
  input.type='checkbox';input.dataset.gate=check.id;
  input.addEventListener('change',()=>selected.set(check.id,input.checked));
  label.append(input,documentObject.createTextNode(' '+check.label));
  holder.append(label);
 }
 let last=null;
 async function inspect(){
  let inventory=[],documents=null,shell=null,voice=null,vision=null;
  try{inventory=await readInventory()}catch{}
  try{documents=await readPublishedDocumentCache()}catch{}
  try{shell=await offlineShellStatus({includeInventory:true,includeVendor:false})}catch{}
  const engine=windowObject.NexusOffline;
  try{voice=await engine?.cacheStatus?.('voice')}catch{}
  try{vision=await engine?.cacheStatus?.('vision')}catch{}
  const memoryMiB=Number($('gateMemory').value);
  const memoryVerified=$('gateMemoryAttest').checked&&$('gateMemory').value.trim()!=='';
  const performance=performanceResult();
  const automatic=deriveAutomaticEdgeChecks({
   inventory,documents,shell,voice,vision,
   offline:windowObject.navigator.onLine===false,
   controller:Boolean(windowObject.navigator.serviceWorker?.controller),
   performance,visibleCount:virtualMetrics()?.count||0,memoryMiB,memoryVerified
  });
  const manual=Object.fromEntries(manualChecks.map(c=>[c.id,selected.get(c.id)===true]));
  last=createEdgeAcceptanceReport({automatic,manual,performance});
  const decision=evaluateEdgeRelease({automatic,manual,performance});
  output('deviceGateResult',{
   status:decision.status,passed:decision.passedCount,total:decision.total,
   missing:decision.missing.map(x=>x.label),
   memorySource:memoryVerified?'medición manual Android declarada':'sin evidencia válida',
   notes:decision.notes,
   disclaimer:'Este informe NO sustituye una evaluación de seguridad ni demuestra aptitud física sin pruebas en dispositivos.'
  });
  return last;
 }
 async function exportReport(){
  const report=await inspect();
  const blob=new Blob([JSON.stringify(report,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const anchor=documentObject.createElement('a');
  anchor.href=url;anchor.download='nexus-edge-aceptacion-android.json';
  documentObject.body.append(anchor);anchor.click();anchor.remove();
  windowObject.setTimeout(()=>URL.revokeObjectURL(url),2000);
 }
 const scan=()=>inspect().catch(error=>output('deviceGateResult','Error del diagnóstico: '+String(error?.message||error).slice(0,300)));
 const download=()=>exportReport().catch(error=>output('deviceGateResult','Error exportando informe: '+String(error?.message||error).slice(0,300)));
 $('gateInspect').addEventListener('click',scan);
 $('gateExport').addEventListener('click',download);
 return {
  inspect,get lastReport(){return last},
  close(){
   $('gateInspect').removeEventListener('click',scan);
   $('gateExport').removeEventListener('click',download);
   holder.replaceChildren();
  }
 };
}
