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
test('motores: archivos vendorizados íntegros, 35 categorías reales y embeddings de 512 dimensiones',()=>{
 const ctx={};vm.runInNewContext(fs.readFileSync(new URL('offline/assets.js',root),'utf8'),ctx);
 for(const file of ctx.NEXUS_OFFLINE_ASSETS.files){const bytes=fs.readFileSync(new URL('offline/'+file.path,root));assert.equal(bytes.length,file.bytes,file.path);assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256,file.path);}
 const model=JSON.parse(fs.readFileSync(new URL('offline/v1/vision/prototypes.json',root)));assert.equal(model.classes.filter(c=>!c.reject).length,35);
 for(const c of model.classes){assert.equal(c.embedding.length,512);assert.ok(Math.abs(Math.hypot(...c.embedding)-1)<1e-5);}
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
