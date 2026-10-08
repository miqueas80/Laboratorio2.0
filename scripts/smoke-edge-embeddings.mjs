/**
 * Real Chromium browser smoke: multilingual ONNX q8 inference from a local HTTP
 * server using a Web Worker. External host requests are BLOCKED. Requires
 * the GitHub Action to vendor the runtime and download verified model weights.
 * Does not establish performance on Android/WebGPU.
 */
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=17417,base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser=null;
try{
 let ready=false;
 for(let i=0;i<70;i++){
  try{const response=await fetch(base+'/next/embedding-worker.js');if(response.ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!ready)throw Error('Servidor de prueba local no disponible');
 browser=await chromium.launch({
  headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']
 });
 const page=await browser.newPage();
 page.setDefaultTimeout(180000);
 page.on('console',message=>{if(message.type()==='error')console.log('BROWSER CONSOLE:',message.text())});
 page.on('pageerror',error=>console.log('BROWSER PAGE ERROR:',error.message));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base)route.abort('blockedbyclient');
  else route.continue();
 });
 await page.goto(base+'/next/demo.html',{waitUntil:'domcontentloaded'});
 const started=performance.now();
 const data=await page.evaluate(async()=>{
  const {LocalEmbeddingClient}=await import('./embedding-client.js');
  const client=new LocalEmbeddingClient({timeoutMs:150000});
  try{
   const status=await client.status();
   if(!status.installed)throw Error('Modelo local no preparado: '+JSON.stringify(status));
   const state=await client.prepare();
   const samples=[
    '¿Qué es un matraz Erlenmeyer?',
    'Un matraz Erlenmeyer es un recipiente de vidrio que se utiliza en el laboratorio.',
    'El equipo de fútbol ganó la final en el estadio.'
   ];
   const vectors=await client.embed(samples,{batchSize:3});
   if(vectors.length!==3||vectors.some(row=>row.length!==384||row.some(v=>!Number.isFinite(v))))
    throw Error('Embedding inválido o dimensión inesperada');
   const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
   const related=dot(vectors[0],vectors[1]),unrelated=dot(vectors[0],vectors[2]);
   if(related<=unrelated)throw Error('Sin recuperación semántica pertinente: '+JSON.stringify({related,unrelated}));
   const {EvidenceFabric}=await import('./fabric-client.js');
   const {documentRows}=await import('./document-fabric.js');
   const documents=[
    {name:'Guía del material de vidrio',path:'guias/erlenmeyer.md',
     chunks:[samples[1]]},
    {name:'Noticias deportivas',path:'noticias/deportes.md',
     chunks:[samples[2]]}
   ];
   const sourceRows=documentRows(documents);
   const sourceVectors=await client.embed(sourceRows.map(x=>x.text));
   const fabric=new EvidenceFabric();
   try{
    await fabric.build(documents,{vectors:sourceVectors});
    const evidence=await fabric.query(samples[0],{vector:vectors[0],limit:2});
    if(!evidence.length||evidence[0].source.path!=='guias/erlenmeyer.md')
     throw Error('RAG no recuperó el documento científico correcto: '+JSON.stringify(evidence));
    if(!(evidence[0].similarity>0.1))
     throw Error('El índice híbrido no utilizó la similitud vectorial: '+JSON.stringify(evidence));
    return {model:state.model,backend:state.backend,dimension:384,
     vectors:3,related,unrelated,ragSource:evidence[0].source.path,
     ragSimilarity:evidence[0].similarity,ragFragments:evidence.length};
   }finally{fabric.close()}
  }finally{client.close()}
 });
 const prepared=await page.evaluate(async()=>{
  const {prepareOfflineShell,offlineShellStatus}=await import('./offline-shell.js');
  const {prepareSemanticAssets,semanticCacheStatus}=await import('./model-provisioner.js');
  // The CI files were already downloaded and SHA256-checked. This fetcher
  // reads them from SAME ORIGIN to populate browser CacheStorage.
  const prefix='https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/resolve/main/';
  const fetcher=(url,options)=>{
   if(!String(url).startsWith(prefix))throw Error('Origen remoto inesperado');
   return fetch('./models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/'+String(url).slice(prefix.length),options);
  };
  await prepareOfflineShell({includeVendor:true,includeInventory:true});
  await prepareSemanticAssets({fetcher});
  const registration=await navigator.serviceWorker.register('./semantic-sw.js',{scope:'./'});
  await navigator.serviceWorker.ready;
  if(!registration.active)throw Error('Service Worker offline no activo');
  if(!navigator.serviceWorker.controller){
   await new Promise((resolve,reject)=>{
    const limit=setTimeout(()=>reject(Error('La pestaña no quedó controlada por SW')),15000);
    navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(limit);resolve()},{once:true});
   });
  }
  const shell=await offlineShellStatus({includeInventory:true}),model=await semanticCacheStatus();
  if(!shell.ready||!model.installed)throw Error('Preparación offline incompleta');
  return {shellFiles:shell.cached,modelFiles:model.files,inventoryCached:shell.inventoryCached,controlled:!!navigator.serviceWorker.controller};
 });
 await page.context().setOffline(true);
 await page.reload({waitUntil:'domcontentloaded'});
 const offline=await page.evaluate(async()=>{
  const {LocalEmbeddingClient}=await import('./embedding-client.js');
  const client=new LocalEmbeddingClient({timeoutMs:150000});
  try{
   const state=await client.prepare();
   const vectors=await client.embed(['Matraz Erlenmeyer de vidrio'],{batchSize:1});
   if(vectors.length!==1||vectors[0].length!==384)throw Error('Modelo offline no generó 384 dimensiones');
   return {success:true,backend:state.backend,dimension:vectors[0].length,
    networkOnline:navigator.onLine,serviceWorker:!!navigator.serviceWorker.controller};
  }finally{client.close()}
 });
 await page.locator('#load').click();
 await page.waitForFunction(()=>{
  try{return JSON.parse(document.querySelector('#results')?.textContent||'{}').count===111}catch{return false}
 },null,{timeout:20000});
 const inventoryOffline=JSON.parse(await page.locator('#results').innerText());
 console.log(JSON.stringify({...data,elapsedMs:Math.round(performance.now()-started),
  browserOffline:offline,inventoryOfflineCount:inventoryOffline.count,prepared,
  externalRequestsBlocked:true,environment:'headless Chromium / WASM, not Android'},null,2));
}finally{
 await browser?.close().catch(()=>{});
 server.kill('SIGTERM');
}
