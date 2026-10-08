/* Optional OffscreenCanvas preprocessing. Original QR/Lens path stays untouched. */
let canvas=null,context=null;
self.onmessage=({data})=>{
 const {id,bitmap,width=640,maxPixels=1200*1200}=data||{};
 try{
  if(typeof OffscreenCanvas!=='function')throw Error('OffscreenCanvas no disponible');
  if(!bitmap||!Number.isFinite(bitmap.width)||!Number.isFinite(bitmap.height))throw Error('ImageBitmap inválido');
  const scale=Math.min(1,Math.max(1,Math.min(1600,width))/Math.max(bitmap.width,bitmap.height));
  const w=Math.max(1,Math.round(bitmap.width*scale)),h=Math.max(1,Math.round(bitmap.height*scale));
  if(w*h>maxPixels)throw Error('Fotograma excede presupuesto');
  if(!canvas){canvas=new OffscreenCanvas(w,h);context=canvas.getContext('2d',{willReadFrequently:true})}
  canvas.width=w;canvas.height=h;context.drawImage(bitmap,0,0,w,h);
  bitmap.close?.();
  const pixels=context.getImageData(0,0,w,h);
  self.postMessage({id,result:{width:w,height:h,data:pixels.data.buffer}},[pixels.data.buffer]);
 }catch(error){bitmap?.close?.();self.postMessage({id,error:String(error?.message||error)})}
};
