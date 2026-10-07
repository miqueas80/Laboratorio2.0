import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {harness,master} from './harness.mjs';
const app=fs.readFileSync(new URL('app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('index.html',import.meta.url),'utf8');
function canvas(h){
 let captures=0;h.window.HTMLCanvasElement.prototype.getContext=function(){return {drawImage:()=>{captures++},getImageData:()=>({width:320,height:240,data:Uint8ClampedArray.from({length:320*240*4},(_,i)=>i%4===3?255:(Math.floor(i/4)%2?210:40))})}};
 h.window.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/jpeg;base64,YQ==';return ()=>captures;
}
test('QR/Lens DOM, recursos locales, OCR sin Tesseract y versiones sincronizadas',()=>{
 for(const id of ['view-qr','qrVideo','view-lens','lensVideo','lensPermissionBtn','lensStartBtn','lensStopBtn','lensCameraSelect'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.doesNotMatch(app+html,/Tesseract|ocrOutput|view-vision|visionVideo|LENS_TEXT_ENGINE|preprocessLensText/);
 assert.match(app,/function parseLensOcrResult/);assert.match(app,/source:'local-ocr'/);
 assert.match(app,/loadScript\('\.\/jsQR.js','jsQR'\)/);assert.ok(fs.existsSync(new URL('jsQR.js',import.meta.url)));
 assert.match(app,/if\(!raw\)raw=await decodeQrVideoFrame/);assert.match(app,/if\(raw\)\{state.scanBusy=true;processQr\(raw\);return\}/);
 const sw=fs.readFileSync(new URL('sw.js',import.meta.url),'utf8'),version='2026.10.07-r30-lens-final';assert.match(sw,/'\.\/jsQR.js'/);assert.equal(app.match(/APP_VERSION='([^']+)'/)[1],version);assert.equal(sw.match(/VERSION='([^']+)'/)[1],version);
});
test('QR stops tracks, clears video, no retained image; Lens remains independent',async()=>{
 const h=harness({stored:master.records});try{await h.api.loadMaster();let qr=0,lens=0;h.api.state.stream={getTracks:()=>[{stop:()=>qr++},{stop:()=>qr++}]};h.api.state.lensStream={getTracks:()=>[{stop:()=>lens++}]};
 h.api.processQr('NEXUS-X-0001');assert.equal(qr,2);assert.equal(lens,0);assert.equal(h.api.state.stream,null);assert.equal(h.document.querySelector('#qrVideo').srcObject,null);assert.doesNotMatch(h.document.querySelector('#qrResult').innerHTML,/<img|data:image/);
 h.api.stopLensCamera();assert.equal(lens,1);assert.equal(h.api.state.lensStream,null);
 }finally{h.close()}
});
test('Lens permission, selected camera, start and stop all tracks',async()=>{
 const h=harness();try{let stops=0;const constraints=[];h.window.navigator.mediaDevices={enumerateDevices:async()=>[{kind:'videoinput',deviceId:'main',label:'Principal'},{kind:'videoinput',deviceId:'tele',label:'Telephoto'}],getUserMedia:async c=>{constraints.push(c);return {getTracks:()=>[{stop:()=>stops++},{stop:()=>stops++}]}}};h.window.HTMLMediaElement.prototype.play=async()=>{};
 assert.equal(await h.api.requestLensCameraPermission(),true);assert.equal(stops,2);await h.api.startLensCamera();assert.ok(h.api.state.lensStream);assert.equal(h.api.state.stream,null);
 h.document.querySelector('#lensCameraSelect').value='main';await h.api.startLensCamera();assert.equal(constraints.at(-1).video.deviceId.exact,'main');h.api.stopLensCamera();assert.equal(stops,6);
 }finally{h.close()}
});
test('Lens native BarcodeDetector then jsQR fallback',async()=>{
 const h=harness();try{canvas(h);let fallback=0;h.window.jsQR=()=>{fallback++;return {data:'NEXUS-X-0001'}};h.window.BarcodeDetector=class{async detect(){return [{rawValue:'native'}]}};
 assert.equal(await h.api.decodeLensCode({width:320,height:240}),'native');assert.equal(fallback,0);h.window.BarcodeDetector=class{async detect(){throw new Error('not supported')}};
 assert.equal(await h.api.decodeLensCode({width:320,height:240}),'NEXUS-X-0001');assert.equal(fallback,1);
 }finally{h.close()}
});
for(const mode of ['exact','offline','disabled','gateway-unavailable','visual','failed','poor'])test('Lens pipeline '+mode,async()=>{
 let visualCalls=0;const h=harness({stored:master.records,online:mode!=='offline',fetcher:(url,opts)=>{
 if(mode==='gateway-unavailable')return new Response('',{status:503});
 if(!opts?.body)return Response.json({data:[{id:'vision-test',access_tier:'free',capabilities:{vision:true}}]});
 visualCalls++;if(mode==='failed')return new Response('',{status:503});
 const body=JSON.parse(opts.body);assert.equal(body.messages[0].content.filter(p=>p.type==='image_url').length,1);
 return Response.json({choices:[{message:{content:JSON.stringify({hypothesis:'Ácido Nítrico',confidence:80,formulaCandidates:['HNO3']})}}]});
 }});
 try{await h.api.loadMaster();h.api.state.catalog=[...h.api.state.inventory];await h.api.indexDocument({name:'Nitrico.txt',path:'local:nitrico',type:'TXT',text:'NEXUS-X-0001 Ácido Nítrico HNO3'});h.api.state.docIndexReady=true;
 const count=canvas(h);if(mode==='poor')h.window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},getImageData:()=>({data:new Uint8ClampedArray(320*240*4),width:320,height:240})});
 h.window.jsQR=()=>mode==='exact'?{data:'NEXUS-X-0001'}:null;h.api.state.web=mode!=='disabled';if(mode!=='gateway-unavailable')h.window.localStorage.setItem('nexus_gemini_api_key_v1','key');
 const result=await h.api.runNexusLensPipeline({width:320,height:240});assert.equal(result.ok,true);assert.equal(h.api.state.lensBusy,false);assert.doesNotMatch(JSON.stringify(h.api.state.lensLastContext),/data:image/);
 if(mode==='exact'){assert.equal(result.status,'confirmed');assert.ok(result.evidences.some(e=>e.source==='inventory'));assert.ok(result.evidences.some(e=>e.source==='catalog'));assert.ok(result.documents.length);assert.equal(h.calls.length,0)}
 else if(mode==='visual'){assert.equal(result.status,'unknown');assert.equal(result.identity,null);assert.equal(visualCalls,1);assert.equal(h.api.shouldSearchLensWeb(result),false);assert.ok(result.evidences.some(e=>e.type==='visual-rejection'))}
 else {assert.equal(result.identity,null);assert.equal(visualCalls,mode==='failed'?1:0);if(mode!=='poor')assert.ok(result.evidences.some(e=>e.type==='local-ocr-status'))}
 if(mode!=='poor')assert.equal(count(),3,'one capture plus quality sample and QR decoding copies');
 }finally{h.close()}
});
test('quality is metadata, visual fusion cannot replace confirmed code; web gate',()=>{
 const h=harness();try{canvas(h);const quality=h.api.analyzeLensImageQuality({width:320,height:240,getContext:()=>({getImageData:()=>({data:new Uint8ClampedArray(320*240*4)})})});
 assert.equal(h.api.buildNexusLensContext([quality]).identity,null);assert.equal(quality.metadata.qualityOnly,true);assert.equal(h.api.shouldSearchLensWeb(h.api.buildNexusLensContext([quality])),false);
 h.api.state.inventory=master.records;const local=h.api.resolveLensLocalSignals({code:'NEXUS-X-0001'});const fused=h.api.fuseLensVisualContext(local,{provider:'mock',analysis:h.api.parseLensVisionPayload({hypothesis:master.records[1].name,confidence:90}),model:'mock'});
 assert.equal(fused.identity.record.id,'NEXUS-X-0001');assert.equal(fused.status,'confirmed');assert.ok(fused.evidenceGroups.contradictions.some(item=>item.source==='mock'));
 assert.ok(fused.evidences.some(e=>e.source==='mock'&&e.type==='visual-rejection'));
 assert.equal(fused.evidences.filter(e=>e.type==='identity'&&e.metadata?.match==='visual-context').length,0);assert.equal(h.api.shouldSearchLensWeb(fused),false);assert.equal(h.api.shouldSearchLensWeb(fused,{expanded:true}),true);
 }finally{h.close()}
});

test('catálogo real inicia y conserva los IDs NEXUS',async()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('catalogo_maestro.json',import.meta.url),'utf8'));
 const h=harness({stored:master.records,fetcher:()=>Response.json(catalog)});try{await h.api.loadMaster();await h.api.loadCatalogMaster();assert.equal(h.api.state.inventory.length,111);assert.equal(h.api.state.catalog.length,111);assert.equal(h.api.resolveLensLocalSignals({code:'NEXUS-X-0001'}).status,'confirmed')}finally{h.close()}
});
