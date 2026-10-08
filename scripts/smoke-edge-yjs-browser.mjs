/** Real Chromium test using a fully bundled local Yjs module and IndexedDB. */
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=17421,base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser=null;
try{
 let up=false;
 for(let i=0;i<70;i++){
  try{const r=await fetch(base+'/next/demo.html');if(r.ok){up=true;break}}catch{}
  await new Promise(done=>setTimeout(done,100));
 }
 if(!up)throw Error('Servidor local de Yjs no inició');
 browser=await chromium.launch({headless:true,
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 const page=await browser.newPage();page.setDefaultTimeout(30000);
 await page.route('**/*',r=>{
  if(new URL(r.request().url()).origin===base)r.continue();
  else r.abort('blockedbyclient');
 });
 await page.goto(base+'/next/demo.html',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const Y=await import('./vendor/yjs/yjs.bundle.mjs');
  const {YjsLabBoard}=await import('./yjs-lab.js');
  const {openEdgeDB}=await import('./storage.js');
  const adapter=name=>({open:(_n,version)=>indexedDB.open(name,version)});
  const db1=await openEdgeDB({indexedDB:adapter('NEXUS_YJS_BROWSER_OFFLINE_1')});
  const db2=await openEdgeDB({indexedDB:adapter('NEXUS_YJS_BROWSER_OFFLINE_2')});
  const a=new YjsLabBoard({Y,db:db1,room:'browser-test'});
  const b=new YjsLabBoard({Y,db:db2,room:'browser-test'});
  a.transport={confirmed:true,send:p=>b.receive(p)};
  b.transport={confirmed:true,send:p=>a.receive(p)};
  try{
   await Promise.all([a.load(),b.load()]);
   await a.updateTask('task1',{title:'Etiquetas del laboratorio',notes:'Por preparar'});
   a.transport.confirmed=false;b.transport.confirmed=false;
   await a.updateTask('task1',{title:'Etiquetas verificadas'},{broadcast:false});
   await b.updateTask('task1',{notes:'Trabajo de cuarto año'},{broadcast:false});
   a.transport.confirmed=true;b.transport.confirmed=true;
   const beforeA=a.exportPacket(),beforeB=b.exportPacket();
   await Promise.all([a.receive(beforeB),b.receive(beforeA)]);
   const ra=a.getTask('task1'),rb=b.getTask('task1');
   if(JSON.stringify(ra)!==JSON.stringify(rb)||ra.title!=='Etiquetas verificadas'||ra.notes!=='Trabajo de cuarto año')
    throw Error('No convergieron ediciones Yjs concurrentes: '+JSON.stringify({ra,rb}));
   const restart=new YjsLabBoard({Y,db:db2,room:'browser-test'});
   await restart.load();const persisted=restart.getTask('task1');restart.close();
   if(JSON.stringify(persisted)!==JSON.stringify(ra))throw Error('No persistió el estado Yjs');
   return {version:'Yjs 13.6.32',concurrentFieldsMerged:true,persistentIndexedDB:true,
    independentReplicas:2,room:'browser-test',title:ra.title,notes:ra.notes,
    externalRequestsBlocked:true,environment:'Chromium on CI, not Android'};
  }finally{a.close();b.close();db1.close();db2.close()}
 });
 console.log(JSON.stringify(result,null,2));
}finally{await browser?.close().catch(()=>{});server.kill('SIGTERM')}
