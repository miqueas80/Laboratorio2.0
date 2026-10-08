/**
 * NEXUS Edge release gates: hardware evidence cannot be manufactured by CI.
 * No photos, audio, labels, document bodies, secrets, record names or location
 * are copied into reports. Manual gates require on-device operator attestation.
 */
export const EDGE_RELEASE_CHECKS=Object.freeze([
 {id:'inventory111',kind:'automatic',label:'111 registros canónicos únicos, sin editar origen'},
 {id:'documents6',kind:'automatic',label:'Los seis documentos originales consultables en IndexedDB'},
 {id:'offline',kind:'automatic',label:'Modo avión real, Service Worker activo y shell completo'},
 {id:'lensCached',kind:'automatic',label:'MobileCLIP y OCR locales presentes en caché'},
 {id:'voiceCached',kind:'automatic',label:'Vosk español preparado en caché'},
 {id:'fps100k',kind:'automatic',label:'100.001 filas reales de prueba y p95 <= 16,67 ms con 60 FPS promedio'},
 {id:'memory80',kind:'automatic',label:'RAM total medida y <= 80 MiB en el dispositivo (no cuota de almacenamiento)'},
 {id:'androidPhysical',kind:'manual',label:'Prueba en Chrome Android real, PWA instalada y reiniciada'},
 {id:'cameraQr',kind:'manual',label:'Cámara física y QR NEXUS X 0001, coincidencia exacta'},
 {id:'visionReal',kind:'manual',label:'Vaso, Erlenmeyer, probeta, microscopio y negativos evaluados sin falsos positivos peligrosos'},
 {id:'voiceReal',kind:'manual',label:'Micrófono Vosk + «Nexus» + acciones + TTS en modo avión y ambiente con ruido'},
 {id:'p2pReal',kind:'manual',label:'Dos teléfonos en LAN sin Internet sincronizan tareas con código coincidente'},
 {id:'chemicalReview',kind:'manual',label:'Responsable de laboratorio valida fichas SDS y reglas de segregación'},
 {id:'restoreBackup',kind:'manual',label:'Respaldo restaurado con éxito; no se perdió ningún dato original'}
]);
const IDS=new Set(EDGE_RELEASE_CHECKS.map(x=>x.id));
const sanitizeBoolean=v=>v===true;
export function evaluateEdgeRelease({automatic={},manual={},performance=null}={}){
 const passed={},missing=[],notes=[];
 for(const check of EDGE_RELEASE_CHECKS){
  let ok=false;
  if(check.kind==='automatic')ok=sanitizeBoolean(automatic[check.id]);
  else ok=sanitizeBoolean(manual[check.id]);
  passed[check.id]=ok;
  if(!ok)missing.push({id:check.id,kind:check.kind,label:check.label});
 }
 if(performance&&Number.isFinite(performance.averageFPS)&&Number.isFinite(performance.p95FrameMs)){
  if(performance.averageFPS<60||performance.p95FrameMs>1000/60)
   notes.push('La fluidez promedio o p95 está por debajo del objetivo en este dispositivo.');
 }else notes.push('Rendimiento de Android sin medición válida: no se puede aprobar.');
 if(!sanitizeBoolean(automatic.memory80))
  notes.push('No se midió o no se alcanzó el límite de 80 MiB de RAM total.');
 return {total:EDGE_RELEASE_CHECKS.length,passedCount:EDGE_RELEASE_CHECKS.length-missing.length,
  ready:missing.length===0,missing,passed,notes,status:missing.length===0?'READY_FOR_HUMAN_RELEASE_REVIEW':'NOT_READY'};
}
export function createEdgeAcceptanceReport({automatic={},manual={},performance=null,source='NEXUS-X Edge RC'}={}){
 const validation=evaluateEdgeRelease({automatic,manual,performance});
 const validMetrics=performance&&Number.isFinite(performance.averageFPS)&&Number.isFinite(performance.p95FrameMs);
 // Intentionally redact source inputs beyond a small fixed safe identifier.
 const metrics=validMetrics?{averageFPS:performance.averageFPS,p95FrameMs:performance.p95FrameMs,
  frames:Number.isFinite(performance.frames)?performance.frames:null,mode:performance.mode||null}:null;
 return {
  format:'nexus-edge-acceptance-v1',
  createdAt:new Date().toISOString(),
  product:'NEXUS-X Edge',
  source:source==='NEXUS-X Edge RC'?source:'NEXUS-X Edge RC',
  automated:Object.fromEntries(EDGE_RELEASE_CHECKS.filter(x=>x.kind==='automatic')
   .map(x=>[x.id,sanitizeBoolean(automatic[x.id])])),
  operatorAttestations:Object.fromEntries(EDGE_RELEASE_CHECKS.filter(x=>x.kind==='manual')
   .map(x=>[x.id,sanitizeBoolean(manual[x.id])])),
  performance:metrics,
  decision:{status:validation.status,ready:validation.ready,
   passed:validation.passedCount,total:validation.total,
   missing:validation.missing.map(x=>x.id),notes:validation.notes},
  privacy:'No se incluyen imágenes, voz, nombres de sustancias, textos documentales, ubicaciones ni claves.'
 };
}
