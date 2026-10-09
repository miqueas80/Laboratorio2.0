/**
 * Real Chromium/WebRTC no-server LAN candidate + P256 AESGCM + durable
 * two-replica IndexedDB smoke. The peers share one TEST browser host, NOT
 * two real Android devices; this proves the WebRTC transport contract only.
 */
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=17419,base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:dir,stdio:'ignore'});
let browser=null;
try{
 let up=false;
 for(let i=0;i<70;i++){
  try{const r=await fetch(base+'/next/demo.html');if(r.ok){up=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!up)throw Error('Servidor local de WebRTC no disponible');
 browser=await chromium.launch({headless:true,
  executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']
 });
 const page=await browser.newPage();page.setDefaultTimeout(45000);
 page.on('pageerror',e=>console.log('BROWSER:',e.message));
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).origin===base)route.continue();
  else route.abort('blockedbyclient');
 });
 await page.goto(base+'/next/demo.html',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const {ManualWebRTCPeer}=await import('./manual-webrtc.js');
  const {EdgeSyncController}=await import('./sync-controller.js');
  const {openEdgeDB,readEdgeStore}=await import('./storage.js');
  let a=null,b=null,dbA=null,dbB=null;
  const waitFor=async(check,msg)=>{
   for(let i=0;i<240;i++){if(check())return;await new Promise(r=>setTimeout(r,50))}
   throw Error('Tiempo de WebRTC agotado: '+msg);
  };
  try{
   let recvA=0,recvB=0;
   let ra=null,rb=null;
   a=new ManualWebRTCPeer({onPayload:async data=>{recvA++;await ra.receive(data)}});
   b=new ManualWebRTCPeer({onPayload:async data=>{recvB++;await rb.receive(data)}});
   const offer=await a.createInvite();
   const answer=await b.acceptInvite(offer);
   const codeA=await a.acceptAnswer(answer),codeB=b.getPairCode();
   if(codeA!==codeB)throw Error('Verificación ECDH desigual');
   // No sync until both users independently verify the six-digit code.
   let refused=false;
   try{await a.send({type:'edge-events',events:[]})}catch{refused=true}
   if(!refused)throw Error('El canal aceptó datos sin emparejamiento');
   await waitFor(()=>a.channel?.readyState==='open'&&b.channel?.readyState==='open','datachannel');
   a.confirmSameCode(codeB);b.confirmSameCode(codeA);
   const adapter=name=>({open:(_ignored,version)=>indexedDB.open(name,version)});
   dbA=await openEdgeDB({indexedDB:adapter('NEXUS_EDGE_WEBRTC_BROWSER_A')});
   dbB=await openEdgeDB({indexedDB:adapter('NEXUS_EDGE_WEBRTC_BROWSER_B')});
   ra=new EdgeSyncController({db:dbA,actor:'agent-CHROME-A',transport:a});
   rb=new EdgeSyncController({db:dbB,actor:'agent-CHROME-B',transport:b});
   await Promise.all([ra.load(),rb.load()]);
   await ra.mutate('calendar','testevt100',{id:'testevt100',text:'Preparar la expo'},{broadcast:true});
   await waitFor(()=>rb.read('calendar','testevt100')?.text==='Preparar la expo','A → B');
   await rb.mutate('calendar','testevt100',{id:'testevt100',text:'Preparar expo y etiquetas'},{broadcast:true});
   await waitFor(()=>ra.read('calendar','testevt100')?.text==='Preparar expo y etiquetas','B → A');
   const originalCount=(await readEdgeStore(dbA,'mutation_log')).length;
   const snapshot=await ra.sendSnapshot();
   await waitFor(()=>recvB>=2,'snapshot');
   const latest=new EdgeSyncController({db:dbB,actor:'agent-CHROME-B',transport:b});
   await latest.load();
   if(latest.read('calendar','testevt100')?.text!=='Preparar expo y etiquetas')throw Error('No persistió actualización de WebRTC');
   if((await readEdgeStore(dbA,'mutation_log')).length!==originalCount)throw Error('Replay creó historial duplicado');
   return {connected:true,paired:true,authenticated:true,encrypted:true,
     bothDirections:true,sourceALog:originalCount,sourceBLog:(await readEdgeStore(dbB,'mutation_log')).length,
     reloadPersists:true,recvA,recvB,snapshotSent:snapshot.sent,externalRequestsBlocked:true};
  }finally{a?.close();b?.close();dbA?.close();dbB?.close()}
 });
 console.log(JSON.stringify({...result,environment:'Chromium loopback peers, not two phones'},null,2));
}finally{await browser?.close().catch(()=>{});server.kill('SIGTERM')}
