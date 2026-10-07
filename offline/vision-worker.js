'use strict';
// One capture at a time. The learned image encoder and all runtime files are local.
importScripts('./v1/vision/ort.webgpu.min.js');
ort.env.wasm.wasmPaths = new URL('./v1/vision/', self.location.href).href;
ort.env.wasm.numThreads = 1; // GitHub Pages does not supply COOP/COEP.
ort.env.wasm.proxy = false;
let session, prototypes, backend = '', loading, busy = false;
async function initialize(forceWasm = false) {
  if (session && (!forceWasm || backend === 'WASM')) return;
  if (loading) return loading;
  loading = (async () => {
    if (session) { await session.release(); session = null; }
    prototypes ||= await (await fetch('./v1/vision/prototypes.json')).json();
    const model = new URL('./v1/vision/mobileclip-s0.onnx', self.location.href).href;
    if (!forceWasm && self.navigator.gpu) {
      try {
        session = await ort.InferenceSession.create(model, {executionProviders:['webgpu'], freeDimensionOverrides:{batch_size:1}});
        backend = 'WebGPU';
      } catch (_) { session = null; }
    }
    if (!session) {
      session = await ort.InferenceSession.create(model, {executionProviders:['wasm'], freeDimensionOverrides:{batch_size:1}});
      backend = 'WASM';
    }
  })();
  try { await loading; } finally { loading = null; }
}
function normalized(values) {
  const size = Math.hypot(...values);
  if (!Number.isFinite(size) || size < 1e-8) throw new Error('Embedding visual inválido');
  return Array.from(values, x => x / size);
}
function rank(embedding) {
  const rows = prototypes.classes.map(c => ({id:c.id, label:c.label, group:c.group, reject:!!c.reject,
    chemicalContainer:!!c.chemicalContainer, similarity:c.embedding.reduce((s,v,i)=>s+v*embedding[i],0)}))
    .sort((a,b)=>b.similarity-a.similarity);

  // Open-set gate: MobileCLIP siempre devuelve "algo más parecido".
  // NEXUS sólo acepta cuando la evidencia supera umbral, margen y clases negativas.
  // Estos valores son scores de similitud, NO probabilidades calibradas.
  const best=rows[0],runner=rows[1];
  const margin=best.similarity-runner.similarity;
  const nearestReject=rows.find(row=>row.reject);
  const rejectGap=nearestReject?best.similarity-nearestReject.similarity:Infinity;

  const accepted=
    !best.reject &&
    best.similarity>=.24 &&
    margin>=.012 &&
    rejectGap>=.01;

  let rejectionReason='';
  if(best.reject)rejectionReason='out-of-domain';
  else if(best.similarity<.24)rejectionReason='low-similarity';
  else if(margin<.012)rejectionReason='ambiguous';
  else if(rejectGap<.01)rejectionReason='negative-class-close';

  return {accepted,rejectionReason,margin,rejectGap,candidates:rows.slice(0,4)};
}
self.onmessage = async ({data}) => {
  const {id, type} = data;
  if (busy) { self.postMessage({id,error:'Motor ocupado'}); return; }
  busy = true;
  try {
    await initialize(!!data.forceWasm);
    if (type === 'prepare') { self.postMessage({id,result:{backend,model:prototypes.model}}); return; }
    const started = performance.now();
    // Preprocessing: RGB float32 [0,1], 256x256, exact model card configuration.
    const input = new ort.Tensor('float32', new Float32Array(data.pixels), [1,3,256,256]);
    let output;
    try { output = await session.run({pixel_values:input}); }
    catch (error) {
      if (backend !== 'WebGPU') throw error;
      await initialize(true);
      output = await session.run({pixel_values:input});
    } finally { input.dispose(); }
    const embedding = normalized(output.image_embeds.data);
    for (const tensor of Object.values(output)) tensor.dispose();
    self.postMessage({id,result:{...rank(embedding),embedding,backend,model:prototypes.model,
      durationMs:Math.round(performance.now()-started),at:new Date().toISOString()}});
  } catch (error) { self.postMessage({id,error:error.message||String(error)}); }
  finally { busy = false; }
};
