/**
 * Real on-device-path MobileCLIP-S0 + PP-OCRv6 Tiny browser smoke, no cloud.
 * Browser uses the EXISTING production local engine on an isolated Edge page.
 * Synthetic capture is only a runtime smoke, NOT object recognition accuracy.
 */
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=17427,base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser=null;
try{
 let ready=false;
 for(let i=0;i<70;i++){
  try{const r=await fetch(base+'/next/demo.html');if(r.ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!ready)throw Error('Edge Lab HTTP no disponible');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 const page=await browser.newPage();page.setDefaultTimeout(240000);
 page.on('pageerror',error=>console.log('BROWSER PAGE:',error.message));
 page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER CONSOLE:',msg.text())});
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).origin===base)route.continue();
  else route.abort('blockedbyclient');
 });
 await page.goto(base+'/next/demo.html',{waitUntil:'domcontentloaded'});
 const start=performance.now();
 const info=await page.evaluate(async()=>{
  if(!globalThis.NexusOffline?.analyze)throw Error('No se cargó NEXUS Lens real');
  const visionFiles=globalThis.NEXUS_OFFLINE_ASSETS?.files.filter(f=>f.group==='vision')||[];
  if(visionFiles.length<8)throw Error('Manifiesto visual offline incompleto');
  await globalThis.NexusOffline.prepare('vision');
  const {EdgeLens}=await import('./lens-edge.js');
  const lens=new EdgeLens({inventory:[{id:'NEXUS-X-0001',name:'Ácido nítrico',formula:'HNO3'}]});
  try{
   const ready=await lens.prepare({forceWasm:true});
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
   const context=canvas.getContext('2d');
   const color=context.createLinearGradient(0,0,320,240);
   color.addColorStop(0,'#999fb1');color.addColorStop(1,'#edf0fc');
   context.fillStyle=color;context.fillRect(0,0,320,240);
   context.fillStyle='#68798a';context.fillRect(130,40,40,155);
   context.fillStyle='#aabbc7';context.fillRect(80,175,150,20);
   const result=await lens.analyze(canvas,{skipQR:true,forceWasm:true});
   if(result.identity!==null)throw Error('La visión no puede confirmar una identidad química');
   if(!['visual-class','unknown'].includes(result.status))throw Error('Estado visual inesperado');
   if(result.model!=='MobileCLIP-S0'||result.backend!=='WASM')
    throw Error('No se ejecutó MobileCLIP local en WASM: '+JSON.stringify(result));
   if(JSON.stringify(result).includes('image_embeds')||JSON.stringify(result).includes('data:image'))
    throw Error('El resultado visual filtró datos privados de imagen');
   if(ready.ocr?.runtime!=='PP-OCRv6 Tiny'||ready.ocr?.backend!=='WASM')
    throw Error('OCR local no está listo: '+JSON.stringify(ready.ocr));
   return {backend:result.backend,model:result.model,
    actualInference:true,category:result.visualClass?.label||'rechazada/no comprobada',
    accepted:result.status==='visual-class',identityConfirmed:false,
    source:result.source,visionFiles:visionFiles.length,
    ocrReady:true,ocrBackend:ready.ocr.backend,dictionarySize:ready.ocr.dictionarySize};
  }finally{lens.close()}
 });
 console.log(JSON.stringify({...info,elapsedMs:Math.round(performance.now()-start),
  networkRequestsOutsideOrigin:'blocked',
  context:'Synthetic canvas runtime smoke; no accuracy claim and NOT physical Android'},null,2));
}finally{await browser?.close().catch(()=>{});server.kill('SIGTERM')}
