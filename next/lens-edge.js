/**
 * Visual evidence bridge for the EXISTING 49-class on-device MobileCLIP-S0.
 * Uses NEXUS_OFFLINE_ASSETS and NexusOffline, never any cloud or image upload.
 *
 * MobileCLIP predicts a visual OBJECT CLASS, not a substance. Chemical identity
 * is confirmed only by exact inventory QR, never by pixels, OCR or resemblance.
 * The returned result intentionally excludes raw pixels and embeddings.
 */
const EXACT=/^NEXUS-X-\d{4}$/;
export function lensDecision({code='',inventory=[],vision=null}={}){
 const value=String(code||'').trim(),row=EXACT.test(value)?inventory.find(r=>r.id===value):null;
 const best=vision?.candidates?.[0]||null;
 const accepted=Boolean(vision?.accepted)&&Boolean(best)&&!best.reject&&
  Number.isFinite(best.similarity)&&Boolean(vision?.multiView?.agreement!==false);
 const references=(vision?.references||[])
  .filter(x=>Number.isFinite(x.similarity)&&x.similarity>=.85)
  .slice(0,3).map(x=>({recordId:x.recordId,label:x.label,similarity:Number(x.similarity.toFixed(4))}));
 const result={
  status:row?'confirmed-qr':accepted?'visual-class':'unknown',
  source:row?'exact-local-inventory':'local-mobileclip-s0',
  identity:row?{id:row.id,name:row.name||'',formula:row.formula||null}:null,
  visualClass:accepted?{id:best.id,label:best.label,group:best.group||'',
   similarity:Number(best.similarity.toFixed(4)),chemicalContainer:Boolean(best.chemicalContainer)}:null,
  visualUncertainty:vision?{accepted,rejectionReason:vision.rejectionReason||null,
   margin:Number.isFinite(vision.margin)?Number(vision.margin.toFixed(4)):null,
   views:vision.multiView?.views??null,agreement:vision.multiView?.agreement??null}:null,
  referenceSuggestions:references,
  evidenceLevel:row?'confirmed-by-exact-qr':accepted?'visual-category-only':'insufficient',
  model:vision?.model||null,backend:vision?.backend||null,
  disclaimer:'La visión local no identifica compuestos químicos, soluciones ni concentraciones. Los candidatos visuales y referencias son hipótesis, no pruebas de identidad.'
 };
 return result;
}
export async function decodeExactQr(canvas,{BarcodeDetectorConstructor=globalThis.BarcodeDetector,jsQRDecoder=globalThis.jsQR}={}){
 const width=canvas?.width,height=canvas?.height;
 if(!width||!height)throw Error('Captura QR vacía');
 if(typeof BarcodeDetectorConstructor==='function'){
  try{
   const reader=new BarcodeDetectorConstructor({formats:['qr_code']});
   const hits=await reader.detect(canvas);
   const exact=hits.map(x=>String(x.rawValue||'').trim()).find(text=>EXACT.test(text));
   if(exact)return exact;
  }catch{/* standalone fallback */}
 }
 if(typeof jsQRDecoder==='function'){
  const img=canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,width,height);
  const raw=jsQRDecoder(img.data,width,height,{inversionAttempts:'attemptBoth'})?.data;
  if(EXACT.test(String(raw||'').trim()))return raw.trim();
 }
 return null;
}
export function captureLensCanvas(source,{maxSide=960,documentObject=globalThis.document}={}){
 const w=source?.videoWidth||source?.naturalWidth||source?.width;
 const h=source?.videoHeight||source?.naturalHeight||source?.height;
 if(!w||!h||!Number.isFinite(w)||!Number.isFinite(h)||w*h>30000000)
  throw Error('Imagen vacía o excesiva');
 if(!Number.isInteger(maxSide)||maxSide<256||maxSide>1920)throw Error('Resolución incorrecta');
 const scale=Math.min(1,maxSide/Math.max(w,h));
 const canvas=documentObject.createElement('canvas');
 canvas.width=Math.max(1,Math.round(w*scale));canvas.height=Math.max(1,Math.round(h*scale));
 const context=canvas.getContext('2d',{willReadFrequently:true});
 if(!context)throw Error('Canvas 2D no disponible');
 context.drawImage(source,0,0,w,h,0,0,canvas.width,canvas.height);
 return canvas;
}
export class EdgeLens {
 constructor({engine=globalThis.NexusOffline,inventory=[],decode=decodeExactQr}={}){
  this.engine=engine;this.inventory=inventory;this.decode=decode;
 }
 async prepare({onProgress=()=>{}}={}){
  if(!this.engine?.prepareVision||!this.engine?.prepare)
   throw Error('NEXUS Lens local no preparado. Se requiere offline/core.js.');
  const ready=await this.engine.cacheStatus('vision');
  if(!ready.ready)await this.engine.prepare('vision',onProgress);
  return this.engine.prepareVision({forceWasm:false});
 }
 async analyze(source,{skipQR=false}={}){
  if(!this.engine?.analyze)throw Error('Motor visual NEXUS local ausente');
  const canvas=captureLensCanvas(source);
  try{
   const code=skipQR?null:await this.decode(canvas);
   if(code&&this.inventory.some(r=>r.id===code))
    return lensDecision({code,inventory:this.inventory});
   const vision=await this.engine.analyze(canvas);
   return lensDecision({code,inventory:this.inventory,vision});
  }finally{canvas.width=canvas.height=1}
 }
 close(){this.engine?.releaseVision?.()}
}
