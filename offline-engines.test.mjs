import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,webcrypto} from 'node:crypto';
import {harness,master} from './harness.mjs';
const root=new URL('./',import.meta.url);
function loadCore(h){
 Object.defineProperty(h.document,'currentScript',{configurable:true,value:{src:'https://miqueas80.github.io/Laboratorio2.0/offline/core.js'}});
 h.loadVendor('offline/assets.js');h.loadVendor('offline/core.js');return h.window.NexusOffline;
}
test('motores: assets vendorizados íntegros y prototipos completos MobileCLIP-S0',()=>{
 const ctx={};vm.runInNewContext(fs.readFileSync(new URL('offline/assets.js',root),'utf8'),ctx);
 for(const file of ctx.NEXUS_OFFLINE_ASSETS.files){const bytes=fs.readFileSync(new URL('offline/'+file.path,root));assert.equal(bytes.length,file.bytes,file.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);}
 const ocr=ctx.NEXUS_OFFLINE_ASSETS.files.filter(file=>file.path.startsWith('v1/vision/ocr/'));
 assert.deepEqual([...ocr].map(file=>file.path).sort(),['v1/vision/ocr/PP-OCRv6_tiny_det.onnx','v1/vision/ocr/PP-OCRv6_tiny_det.yml','v1/vision/ocr/PP-OCRv6_tiny_rec.onnx','v1/vision/ocr/PP-OCRv6_tiny_rec.yml']);
 assert.equal(ocr.find(file=>file.path.endsWith('_det.onnx')).sha256,'193bab7a04fca699a6c82e6abb5b81bdb28177f0abd4062552b04908dafb19f8');
 assert.equal(ocr.find(file=>file.path.endsWith('_rec.onnx')).sha256,'9ef676d6ed3c88256a2d92c640c44f25b0c40947e111b14b8be8f594091563e6');
 const model=JSON.parse(fs.readFileSync(new URL('offline/v1/vision/prototypes.json',root))),categories=JSON.parse(fs.readFileSync(new URL('offline/lab-categories.json',root)));
 assert.equal(model.classes.length,categories.length);assert.deepEqual(model.classes.map(c=>c.id),categories.map(c=>c.id));
 assert.equal(model.classes.filter(c=>!c.reject).length,categories.filter(c=>!c.reject).length);
 for(const c of model.classes){assert.equal(c.embedding.length,512);assert.ok(Math.abs(Math.hypot(...c.embedding)-1)<1e-5);}
});

test('OCR dirigido normaliza códigos NEXUS, conserva cajas y sólo identifica con coincidencia local fuerte',async()=>{
 const h=harness({stored:master.records});try{
  await h.api.loadMaster();
  const code={runtime:'PP-OCRv6 Tiny',backend:'WASM',lines:[{text:'NEXUS-X-O001',confidence:.98,boundingBox:[1,2,30,12]}]};
  const parsed=h.api.parseLensOcrResult(code),identity=h.api.resolveLensLocalSignals({ocrResult:code});
  assert.equal(parsed.code,'NEXUS-X-0001');assert.equal(parsed.evidences[0].source,'local-ocr');assert.equal(parsed.evidences[0].type,'code-observation');assert.equal(parsed.evidences[0].boundingBox[0],1);assert.equal(parsed.evidences[0].runtime,'PP-OCRv6 Tiny');
  assert.equal(h.api.parseLensOcrResult({lines:[{text:'NEXUS-X-Q001',confidence:.99}]}).code,'');
  assert.equal(identity.status,'identified');assert.equal(identity.identity.record.id,'NEXUS-X-0001');assert.equal(identity.identity.confirmed,false);

  const formula={runtime:'PP-OCRv6 Tiny',backend:'WASM',lines:[{text:'Ácido Nítrico HNO3',confidence:.98,boundingBox:{x:1,y:2,width:40,height:10}}]};
  const textIdentity=h.api.resolveLensLocalSignals({ocrResult:formula});
  assert.equal(textIdentity.status,'identified');assert.equal(textIdentity.identity.record.formula,'HNO3');
  assert.ok(textIdentity.evidences.some(e=>e.type==='formula-observation'&&e.local));

  const weak=h.api.resolveLensLocalSignals({ocrResult:{lines:[{text:'Ácido Nítrico HNO3',confidence:.3}]}});
  assert.equal(weak.status,'unknown');assert.equal(weak.identity,null);
  const qrWins=h.api.resolveLensLocalSignals({code:'NEXUS-X-0001',ocrResult:{lines:[{text:'NEXUS-X-0002',confidence:.99}]}});
  assert.equal(qrWins.status,'confirmed');assert.equal(qrWins.identity.record.id,'NEXUS-X-0001');
  const external=h.api.fuseLensVisualContext(identity,{provider:'xkiro',model:'mock',analysis:h.api.parseLensVisionPayload({hypothesis:'fosfato',category:'reactivo',confidence:98})});
  assert.equal(external.status,'identified');assert.equal(external.identity.record.id,'NEXUS-X-0001');
  assert.ok(external.evidenceGroups.contradictions.some(item=>item.source==='xkiro'));
  assert.equal(external.evidences.some(e=>e.source==='xkiro'&&e.type==='identity'),false);
 }finally{h.close();}
});

test('cliente OCR se resuelve y exige modelos preparados antes de crear el worker',async()=>{
 const h=harness();try{
  const api=loadCore(h);
  await assert.rejects(api.recognizeText({}),/Modelo no disponible/);
 }finally{h.close();}
});

test('MobileCLIP multi-view es como máximo dos inferencias y conserva letterbox',()=>{
 const core=fs.readFileSync(new URL('offline/core.js',root),'utf8'),worker=fs.readFileSync(new URL('offline/vision-worker.js',root),'utf8');
 assert.match(core,/pixelsFor\(source,'center'\),pixelsFor\(source,'letterbox'\)/);
 assert.match(core,/fillStyle='#808080'/);assert.match(worker,/slice\(0,2\)/);
 assert.match(worker,/multiView:\{views:results\.length,agreement/);
 assert.match(worker,/multi-view-disagreement/);
});

test('prototipos admiten prompts específicos y negativos de objetos fuera de dominio',()=>{
 const categories=JSON.parse(fs.readFileSync(new URL('offline/lab-categories.json',root),'utf8')),generator=fs.readFileSync(new URL('scripts/build-visual-prototypes.py',root),'utf8');
 const byId=new Map(categories.map(item=>[item.id,item]));
 for(const id of ['vial','ampoule','syringe','sample-container','nail-polish','perfume','beverage','household-jar','retail-medicine'])assert.ok(byId.has(id),id);
 assert.ok(byId.get('pipette').prompts.includes('medicine dosing pipette'));
 assert.ok(byId.get('dropper').prompts.includes('medicine dropper'));
 assert.match(generator,/item\.get\('prompts'\)/);
});

test('Lens open-set rechaza similitud baja, ambigüedad y cercanía a clases negativas',()=>{
 const worker=fs.readFileSync(new URL('offline/vision-worker.js',root),'utf8');
 assert.match(worker,/best\.similarity>=\.24/);
 assert.match(worker,/margin>=\.012/);
 assert.match(worker,/rejectGap>=\.01/);
 assert.match(worker,/rejectionReason='low-similarity'/);
 assert.match(worker,/rejectionReason='ambiguous'/);
 assert.match(worker,/rejectionReason='negative-class-close'/);
});
test('voz nativa exige disponibilidad del idioma Y processLocally real; nunca activa reconocimiento cloud',async()=>{
 const h=harness();try{const api=loadCore(h);let created=0;
 h.window.SpeechRecognition=class{constructor(){created++;}static async available(){return 'available';}};
 assert.equal(await api.nativeVoice(),null);
 h.window.SpeechRecognition=class{constructor(){this.processLocally=false;}static async available({langs,processLocally}){assert.equal(processLocally,true);return langs[0]==='es-AR'?'unavailable':'available';}};
 const local=await api.nativeVoice();assert.equal(local.lang,'es-ES');assert.equal(local.recognizer.processLocally,true);assert.equal(h.calls.length,0);
 }finally{h.close();}
});
test('preparación detecta corrupción y no borra datos de producción',async()=>{
 const h=harness();try{const entries=new Map();h.window.crypto=webcrypto;Object.defineProperty(h.window,'crypto',{value:webcrypto});h.window.caches={open:async()=>({match:async url=>entries.get(url)?.clone(),delete:async url=>entries.delete(url),put:async(url,response)=>entries.set(url,response)})};const api=loadCore(h);
 await assert.rejects(api.prepare('voice'),/incompleta|incorrecta/);assert.equal(entries.size,0);assert.equal((await api.cacheStatus('voice')).ready,false);
 }finally{h.close();}
});
test('fusión local cruza inventario, catálogo y documentos sin elevar visión sola a identidad química',async()=>{
 const h=harness({stored:master.records,online:false});try{
  await h.api.loadMaster();const before=JSON.stringify(h.api.state.inventory);
  // Test data exists only inside the isolated in-memory harness.
  const ref={id:'NEXUS-X-9000',name:'Matraz Erlenmeyer',formula:'',location:'Banco 1'};
  h.api.state.inventory=[...h.api.state.inventory,ref];h.api.state.catalog=[ref];
  await h.api.indexDocument({name:'Uso del Erlenmeyer.txt',path:'local:erlenmeyer',type:'TXT',text:'Uso de matraz Erlenmeyer en el laboratorio.'});
  const result=h.api.fuseLensLocalVision(h.api.buildNexusLensContext([]),{accepted:true,backend:'WASM',model:'MobileCLIP-S0',margin:.04,candidates:[{id:'erlenmeyer',label:'Matraz Erlenmeyer',group:'Material de laboratorio',similarity:.4}],references:[]});
  assert.equal(result.status,'hypothesis');assert.equal(result.identity.confirmed,false);assert.ok(result.evidences.some(e=>e.source==='inventory'));assert.ok(result.evidences.some(e=>e.source==='catalog'));assert.ok(result.documents.length);assert.equal(JSON.stringify(h.api.state.inventory.slice(0,111)),before);
  const external=h.api.fuseLensVisualContext(result,{provider:'xkiro',analysis:h.api.parseLensVisionPayload({hypothesis:'Ácido Nítrico',confidence:99}),model:'mock'});assert.equal(external.identity.record.id,ref.id);assert.equal(external.status,'hypothesis');
  const qr=h.api.resolveLensLocalSignals({code:'NEXUS-X-0001'});const fused=h.api.buildNexusLensContext([...result.evidences,...qr.evidences]);assert.equal(fused.status,'confirmed');assert.equal(fused.identity.record.id,'NEXUS-X-0001');
 }finally{h.close();}
});
test('sin QR y sin red: pipeline llama al modelo local y tolera su caída',async()=>{
 const h=harness({stored:master.records,online:false});try{await h.api.loadMaster();h.api.state.docIndexReady=true;h.window.jsQR=()=>null;
 h.window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},getImageData:()=>({width:320,height:240,data:Uint8ClampedArray.from({length:320*240*4},(_,i)=>i%4===3?255:(Math.floor(i/4)%2?40:200))})});
 let inference=0;h.window.NexusOffline={analyze:async()=>{inference++;return {accepted:true,backend:'WASM',model:'MobileCLIP-S0',candidates:[{label:'Microscopio',group:'Microscopía',similarity:.43}],embedding:Array(512).fill(0)};}};
 const local=await h.api.runNexusLensPipeline({width:320,height:240});assert.equal(inference,1);assert.equal(local.status,'hypothesis');assert.equal(local.local,true);assert.equal(h.calls.length,0);
 h.window.NexusOffline.analyze=async()=>{throw new Error('Modelo no disponible');};const failure=await h.api.runNexusLensPipeline({width:320,height:240});assert.equal(failure.ok,true);assert.equal(h.api.state.inventory.length,111);assert.equal(h.api.state.lensBusy,false);
 }finally{h.close();}
});
