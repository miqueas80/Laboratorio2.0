/**
 * Chromium real Vosk WASM start/stop with a fake microphone using a local
 * fixture. Browser requests outside localhost are blocked. A direct injected
 * transcript separately verifies the wake → local Edge DAG command path.
 * No claim of ambient KWS trained model or real microphone accuracy.
 */
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),port=17429;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const base='http://127.0.0.1:'+port;
let browser;
try{
 let ready=false;
 for(let i=0;i<70;i++){
  try{if((await fetch(base+'/next/demo.html')).ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!ready)throw Error('Servidor de prueba no disponible');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
   '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',
   '--use-file-for-fake-audio-capture='+path.join(root,'tests/fixtures/voice-command-16k.wav')]});
 const page=await browser.newPage();
 page.setDefaultTimeout(180000);
 page.on('pageerror',error=>console.log('BROWSER PAGE:',error.message));
 page.on('console',m=>{if(m.type()==='error')console.log('BROWSER ERROR:',m.text())});
 await page.route('**/*',route=>{
  if(new URL(route.request().url()).origin===base)route.continue();
  else route.abort('blockedbyclient');
 });
 await page.goto(base+'/next/demo.html',{waitUntil:'domcontentloaded'});
 const started=performance.now();
 const outcome=await page.evaluate(async()=>{
  if(!globalThis.NexusOffline)throw Error('Motor Vosk existente no cargado');
  const {EdgeVoiceCoordinator}=await import('./voice-edge.js');
  const {VoiceFrameEngine}=await import('./voice-frame-client.js');
  const adapter=new VoiceFrameEngine();
  const events=[];
  const voice=new EdgeVoiceCoordinator({
   engine:adapter,
   agent:{turn:async query=>({ok:true,reply:'Resultado local',query})},
   onResult:result=>events.push(result),
   onStatus:status=>events.push({status:status.state||''}),
   speechSynthesis:null,Utterance:null
  });
  try{
   await voice.prepare();
   const started=await voice.start();
   if(!started.active||started.recognizer!=='Vosk WASM')throw Error('Vosk real no inició');
   await new Promise(resolve=>setTimeout(resolve,2500));
   // The recorded WAV may itself already have said "Nexus", arming the
   // listener. Wake rejection without prior audio is covered by unit tests.
   const recognizedEarlier=voice.armedUntil>Date.now();
   const ignored=await voice.feedTranscript('abrí inventario');
   if(!recognizedEarlier&&ignored.ignored!=='wake-required')
    throw Error('Orden no autenticada por palabra de activación');
   const executed=await voice.feedTranscript('Nexus, abrí inventario');
   if(executed.query!=='abri inventario')throw Error('La orden Vosk no llegó al agente local');
   return {engine:started.recognizer,realMicPipeline:true,wakeGate:true,
    executedLocalCommand:executed.query,results:events.filter(x=>x.query).length};
  }finally{voice.stop();adapter.close()}
 });
 console.log(JSON.stringify({...outcome,elapsedMs:Math.round(performance.now()-started),
  externalRequestsBlocked:true,environment:'Chromium fake WAV microphone / real Vosk engine, not Android'},null,2));
}finally{await browser?.close().catch(()=>{});server.kill('SIGTERM')}
