/**
 * Browser-only performance verification. Numeric FPS is never reported until
 * actual requestAnimationFrame samples are captured from the target device.
 */
export function frameMetrics(stamps,{targetFPS=60}={}){
 if(!Array.isArray(stamps)||stamps.length<2||stamps.some(x=>!Number.isFinite(x)))throw Error('Muestras de render inválidas');
 const intervals=[];
 for(let i=1;i<stamps.length;i++){
  const interval=stamps[i]-stamps[i-1];
  if(interval<=0)throw Error('Tiempos de render fuera de orden');
  intervals.push(interval);
 }
 const sorted=[...intervals].sort((a,b)=>a-b);
 const total=stamps.at(-1)-stamps[0],avg=total/intervals.length;
 const percentile=p=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)];
 return {
  frames:intervals.length,durationMs:Math.round(total),averageFPS:Number((1000/avg).toFixed(1)),
  p95FrameMs:Number(percentile(.95).toFixed(2)),
  slowFrames:intervals.filter(ms=>ms>1000/targetFPS).length,
  targetFPS,metTarget:1000/avg>=targetFPS&&percentile(.95)<=1000/targetFPS
 };
}
export async function benchmarkAnimation({durationMs=1500,requestFrame=globalThis.requestAnimationFrame,now=()=>performance.now()}={}){
 if(!requestFrame||durationMs<100||durationMs>10000)throw Error('API de animación o duración no disponible');
 const stamps=[];
 await new Promise(resolve=>{
  const start=now();
  function tick(timestamp){
   stamps.push(timestamp);
   if(now()-start>=durationMs&&stamps.length>=2)resolve();
   else requestFrame(tick);
  }
  requestFrame(tick);
 });
 return frameMetrics(stamps);
}
export async function memoryEstimate(){
 if(globalThis.performance?.measureUserAgentSpecificMemory){
  try{const result=await performance.measureUserAgentSpecificMemory();return {bytes:result.bytes,method:'measureUserAgentSpecificMemory',supported:true}}
  catch(e){return {bytes:null,supported:false,reason:String(e.message||e)}}
 }
 return {bytes:null,supported:false,reason:'El navegador no expone una medición precisa de memoria'};
}
