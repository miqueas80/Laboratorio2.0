/**
 * Real desktop Chromium acceptance for 100001 rows + virtual DOM and the
 * read-only Spanish NEXUS agent UI. This does not prove 60 FPS on Android.
 */
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=17423,base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser=null;
try{
 let ready=false;
 for(let i=0;i<70;i++){
  try{const r=await fetch(base+'/next/demo.html');if(r.ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!ready)throw Error('No se pudo iniciar Edge Lab local');
 browser=await chromium.launch({
  headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-gpu','--enable-precise-memory-info','--disable-dev-shm-usage']
 });
 const page=await browser.newPage({viewport:{width:1365,height:768}});
 page.setDefaultTimeout(45000);
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).origin===base)route.continue();
  else route.abort('blockedbyclient');
 });
 await page.goto(base+'/next/demo.html',{waitUntil:'domcontentloaded'});
 await page.locator('#stress').click();
 await page.waitForFunction(()=>{
  try{return JSON.parse(document.querySelector('#results')?.textContent||'{}').count===100001}catch{return false}
 },null,{timeout:35000});
 const before=await page.evaluate(()=>{
  const target=document.querySelector('#virtual');
  const info=JSON.parse(document.querySelector('#results').textContent);
  return {count:info.count,buildMs:info.ms,visible:target.querySelectorAll('.virtual-row').length,
   heap:performance.memory?.usedJSHeapSize||null};
 });
 if(before.count!==100001||before.visible>40)throw Error('Virtualización no redujo los nodos DOM: '+JSON.stringify(before));
 await page.evaluate(()=>{
  const target=document.querySelector('#virtual');
  target.scrollTop=44*55555;target.dispatchEvent(new Event('scroll'));
 });
 await page.waitForFunction(()=>document.querySelector('#virtual')?.textContent.includes('SYN-055555'),null,{timeout:10000});
 const after=await page.evaluate(()=>{
  const target=document.querySelector('#virtual');
  return {visible:target.querySelectorAll('.virtual-row').length,
   has55k:target.textContent.includes('SYN-055555'),heap:performance.memory?.usedJSHeapSize||null};
 });
 if(after.visible>40||!after.has55k)throw Error('Rango DOM tras scroll incorrecto: '+JSON.stringify(after));
 await page.locator('#agentText').fill('Nexus, abrí inventario y buscá ácido nítrico');
 await page.locator('#agentAsk').click();
 await page.waitForFunction(()=>{
  try{
   const result=JSON.parse(document.querySelector('#agentOutput')?.textContent||'{}');
   return result?.inventory?.[0]?.id==='NEXUS-X-0001';
  }catch{return false}
 },null,{timeout:25000});
 const agent=JSON.parse(await page.locator('#agentOutput').innerText());
 if(agent.safeToExecute!==false||agent.viewRequest!=='inventory')throw Error('Agente ejecutó acción no permitida');
 const performance=await page.evaluate(async()=>{
  const {benchmarkAnimation}=await import('./benchmarks.js');
  return benchmarkAnimation({durationMs:900});
 });
 console.log(JSON.stringify({rows:before.count,browserWorkerBuildMs:before.buildMs,
  initialVisibleNodes:before.visible,scrolledVisibleNodes:after.visible,
  deepScrollPassed:after.has55k,heapBeforeMiB:before.heap?+(before.heap/1048576).toFixed(2):null,
  heapAfterMiB:after.heap?+(after.heap/1048576).toFixed(2):null,
  fps:performance,agent:{id:agent.inventory[0].id,view:agent.viewRequest,
   didNotMutate:agent.safeToExecute===false},
  externalRequestsBlocked:true,environment:'Chromium desktop CI, not Android'},null,2));
}finally{await browser?.close().catch(()=>{});server.kill('SIGTERM')}
