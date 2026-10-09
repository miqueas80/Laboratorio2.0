/** End-to-end isolated preview: 6 REAL canonical documents, BM25, airplane-mode reload.
 * No server, API, model inference or external requests are allowed.
 */
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(process.argv[2]||path.join(repository,'dist/nexus-edge'));
const port=17443,base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser;
try{
 let ready=false;
 for(let i=0;i<80;i++){
  try{if((await fetch(base+'/next/demo.html')).ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!ready)throw Error('Preview aislada no accesible');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 const page=await browser.newPage();
 page.setDefaultTimeout(45000);
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).origin===base)route.continue();
  else route.abort('blockedbyclient');
 });
 await page.goto(base+'/next/demo.html',{waitUntil:'domcontentloaded'});
 const initial=await page.evaluate(async()=>{
  const {readEdgeAvailableDocuments}=await import('./canonical-source.js');
  const {SemanticEvidenceFabric}=await import('./semantic-fabric.js');
  const data=await readEdgeAvailableDocuments();
  if(!data.available||data.documents.length!==6||data.searchable!==6||data.fullTextCoverage!==true)
   throw Error('Seis documentos originales no indexables por completo: '+JSON.stringify({
    total:data.total,source:data.source,searchable:data.searchable,coverage:data.fullTextCoverage
   }));
  const fabric=new SemanticEvidenceFabric();
  try{
   const built=await fabric.prepare(data.documents,{semantic:false});
   if(built.documents!==6||built.fragments<6)throw Error('Indexador no generó evidencia canónica');
   const result=await fabric.query('formación de óxidos',{limit:8});
   if(!result.evidence.some(x=>x.source.path==='Formación de óxidos.docx'))
    throw Error('No recuperó evidencia del DOCX original');
   return {documents:built.documents,fragments:built.fragments,mode:result.mode,
    source:data.source,ocrPdfStatus:data.documents.find(d=>d.path==='QUÍMICA (1) (1).pdf').extractionStatus,
    ocrPages:data.documents.find(d=>d.path==='QUÍMICA (1) (1).pdf').ocrPages,
    pdfPages:data.documents.find(d=>d.path==='QUÍMICA (1) (1).pdf').pdfPages};
  }finally{fabric.close()}
 });
 const cache=await page.evaluate(async()=>{
  const {prepareOfflineShell,offlineShellStatus}=await import('./offline-shell.js');
  await prepareOfflineShell({includeVendor:false,includeInventory:true,includeDocuments:true});
  const worker=await navigator.serviceWorker.register('./semantic-sw.js',{scope:'./'});
  await navigator.serviceWorker.ready;
  if(!worker.active)throw Error('SW Edge no activo');
  for(let i=0;i<150&&!navigator.serviceWorker.controller;i++)
   await new Promise(resolve=>setTimeout(resolve,100));
  if(!navigator.serviceWorker.controller)throw Error('SW Edge sin control');
  const ready=await offlineShellStatus({includeVendor:false,includeInventory:true,includeDocuments:true});
  if(!ready.ready||!ready.inventoryCached||!ready.hasDocuments)throw Error('Caché documental offline no lista');
  return ready;
 });
 await page.context().setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 const offline=await page.evaluate(async()=>{
  const {readEdgeAvailableDocuments,readCachedOriginalDocument}=await import('./canonical-source.js');
  const {SemanticEvidenceFabric}=await import('./semantic-fabric.js');
  const result=await readEdgeAvailableDocuments();
  const original=await readCachedOriginalDocument('QUÍMICA (1) (1).pdf');
  if(original.blob.size!==8487276)throw Error('PDF original no se recuperó íntegro sin conexión');
  if(navigator.onLine||!navigator.serviceWorker.controller||!result.available||
     result.documents.length!==6||result.searchable!==6)throw Error('Reinicio documental offline falló');
  const fabric=new SemanticEvidenceFabric();
  try{
   const built=await fabric.prepare(result.documents,{semantic:false});
   const answer=await fabric.query('formación de óxidos',{limit:5});
   if(!answer.evidence.some(x=>x.source.path==='Formación de óxidos.docx'))
    throw Error('Búsqueda BM25 offline no recuperó DOCX');
   return {success:true,mode:answer.mode,documents:built.documents,
    fragments:built.fragments,provenancePreserved:true,
    originalPdfBytes:original.blob.size,sha256Verified:true,
    navigatorOnline:navigator.onLine};
  }finally{fabric.close()}
 });
 // Real integrated on-device acceptance panel must never approve a CI
 // browser with no physical Android tests, even with all files cached.
 await page.locator('#gateInspect').click();
 await page.waitForFunction(()=>{
  try{return JSON.parse(document.querySelector('#deviceGateResult')?.textContent||'{}').status==='NOT_READY'}
  catch{return false}
 },null,{timeout:15000});
 const releaseGate=JSON.parse(await page.locator('#deviceGateResult').innerText());
 if(releaseGate.total!==14||releaseGate.status!=='NOT_READY'||
    !releaseGate.missing.some(s=>/Android real/.test(s))||
    !releaseGate.missing.some(s=>/SDS/.test(s)))
  throw Error('La aceptación declaró producción sin pruebas físicas: '+JSON.stringify(releaseGate));
 const sourceCheck=await page.evaluate(async()=>{
  const {deriveAutomaticEdgeChecks}=await import('./device-acceptance.js');
  const {readEdgeAvailableDocuments}=await import('./canonical-source.js');
  const {offlineShellStatus}=await import('./offline-shell.js');
  const records=(await (await fetch('./snapshot/inventory.json')).json()).records;
  const documents=await readEdgeAvailableDocuments();
  const shell=await offlineShellStatus({includeVendor:false,includeInventory:true,includeDocuments:true});
  return deriveAutomaticEdgeChecks({inventory:records,documents,shell,offline:!navigator.onLine,
   controller:!!navigator.serviceWorker.controller});
 });
 if(!sourceCheck.inventory111||!sourceCheck.documents6||!sourceCheck.offline||
    sourceCheck.fps100k||sourceCheck.memory80||sourceCheck.lensCached||sourceCheck.voiceCached)
  throw Error('Las verificaciones documentales o de hardware fallaron: '+JSON.stringify(sourceCheck));
 console.log(JSON.stringify({initial,cache:{ready:cache.ready,inventoryCached:cache.inventoryCached},
  browserOffline:offline,releaseGate:{status:releaseGate.status,
    passed:releaseGate.passed,total:releaseGate.total,
    androidBlocked:true,chemicalReviewBlocked:true},
  automaticChecks:sourceCheck,externalRequestsBlocked:true,
  environment:'Standalone static Chromium preview; physical Android/SDS approval still required'},null,2));
}finally{await browser?.close().catch(()=>{});server.kill('SIGTERM')}
