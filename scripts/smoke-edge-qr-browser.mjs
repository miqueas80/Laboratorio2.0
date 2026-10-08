/**
 * Actual jsQR + exact-inventory acceptance in Chromium, not mocked QR bytes.
 * The existing 444-byte fixture is decoded locally in the browser. No camera
 * permission is needed in CI, but physical camera still requires Android QA.
 */
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const port=17437,base='http://127.0.0.1:'+port;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let browser=null;
try{
 let ready=false;
 for(let i=0;i<70;i++){
  try{const r=await fetch(base+'/next/demo.html');if(r.ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!ready)throw Error('Servidor Edge no disponible');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage']});
 const page=await browser.newPage();
 page.setDefaultTimeout(20000);
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).origin===base)route.continue();
  else route.abort('blockedbyclient');
 });
 await page.goto(base+'/next/demo.html',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  if(typeof window.jsQR!=='function')throw Error('jsQR local no cargó');
  const {decodeExactQr,EdgeLens}=await import('./lens-edge.js');
  const response=await fetch('../tests/fixtures/nexus-qr.png');
  if(!response.ok)throw Error('Fixture QR ausente');
  const bitmap=await createImageBitmap(await response.blob());
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(320,bitmap.width*6);
  canvas.height=Math.max(320,bitmap.height*6);
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.imageSmoothingEnabled=false;
  const size=Math.min(canvas.width*.85,canvas.height*.85);
  ctx.drawImage(bitmap,(canvas.width-size)/2,(canvas.height-size)/2,size,size);
  bitmap.close();
  const code=await decodeExactQr(canvas,{BarcodeDetectorConstructor:null,jsQRDecoder:window.jsQR});
  if(code!=='NEXUS-X-0001')throw Error('jsQR no leyó el código NEXUS real: '+code);
  const lens=new EdgeLens({inventory:[{id:'NEXUS-X-0001',name:'Ácido nítrico',formula:'HNO3'}],
   decode:frame=>decodeExactQr(frame,{BarcodeDetectorConstructor:null,jsQRDecoder:window.jsQR}),
   engine:{analyze:async()=>{throw Error('Con QR exacto NO se debe activar inferencia visual')}}});
  const identified=await lens.analyze(canvas);
  if(identified.status!=='confirmed-qr'||identified.identity?.id!=='NEXUS-X-0001')
   throw Error('Lens no confirmó identidad solo mediante QR exacto');
  const noise=document.createElement('canvas');noise.width=noise.height=320;
  noise.getContext('2d').fillRect(0,0,320,320);
  const negative=await decodeExactQr(noise,{BarcodeDetectorConstructor:null,jsQRDecoder:window.jsQR});
  if(negative!==null)throw Error('QR inventado en captura negativa');
  return {fixture:'nexus-qr.png',scanner:'local jsQR',decoded:code,
   exactInventoryMatch:true,visionSkippedOnExactQr:true,negativeCanvasRejected:true,
   noCloudRequests:true,environment:'Chromium desktop; Android physical camera untested'};
 });
 console.log(JSON.stringify(result,null,2));
}finally{await browser?.close().catch(()=>{});server.kill('SIGTERM')}
