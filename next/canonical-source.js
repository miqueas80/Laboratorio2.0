/**
 * Read-only canonical document text snapshot in the isolated Edge distribution.
 * The six ORIGINAL binaries and manifest remain unchanged. No production DB
 * is ever upgraded or written; fallback to IndexedDB is read-only.
 */
import {readPublishedDocumentCache} from './document-source.js';
export const CANONICAL_DOCS=Object.freeze([
 {path:'Formación de óxidos.docx',size:677101,revision:'08d7616ff076d6d98a9462bca3a5b0f327a5fa19'},
 {path:'QUÍMICA (1) (1).pdf',size:8487276,revision:'448c6830fed0786a782245e44588a4ebbcce54c1'},
 {path:'Sustancias_Lab. de CN_.xlsx',size:24949,revision:'34a5424dcadcf860e9df9ade089cc6ac302304b8'},
 {path:'Sustancias_Lab_BASE_NEXUS-X.docx',size:42080,revision:'5517a72817607aa623fd2dfa79162d1462644be1'},
 {path:'Unidad 4 - Formulacion y nomenclatura.pdf',size:354964,revision:'7cd5adf5dfb471975aed049543c29730b2a611d0'},
 {path:'Archivos/Copia_Reacciones de formación de compuestos inorgánicos -1.pdf',size:81422,revision:'da8a3b3ffe4de60d6de8168876c4531f04f9f1b2'}
]);
export function validateCanonicalSnapshot(snapshot){
 if(!snapshot||snapshot.schema!=='nexus-edge-canonical-documents-v1'||
    snapshot.version!==1||!Array.isArray(snapshot.documents)||snapshot.documents.length!==6)
  throw Error('Snapshot de los seis documentos canónicos inválido');
 const expected=new Map(CANONICAL_DOCS.map(d=>[d.path,d])),seen=new Set();
 const documents=[];
 for(const doc of snapshot.documents){
  const ref=expected.get(doc?.path);
  if(!ref||seen.has(ref.path)||doc.originalBytes!==ref.size||doc.blobRevision!==ref.revision||
    !/^[0-9a-f]{64}$/.test(String(doc.sha256||''))||
    typeof doc.text!=='string'||doc.text.length>650000||doc.textCharacters!==doc.text.length||
    !['text','truncated','no-text','error','ocr-partial','ocr-complete'].includes(doc.extractionStatus))
   throw Error('Documento canónico inesperado, duplicado o sin procedencia verificada');
  seen.add(ref.path);
  documents.push({
   path:ref.path,name:ref.path.split('/').at(-1),type:ref.path.split('.').at(-1),
   text:doc.text,extractionStatus:doc.extractionStatus,
   pdfPages:Number.isInteger(doc.pdfPages)?doc.pdfPages:null,
   ocrPages:Number.isInteger(doc.ocrPages)?doc.ocrPages:null,
   sourceKind:'git-verified-read-only'
  });
 }
 const searchable=documents.filter(x=>x.text.trim().length>32).length;
 return {available:true,documents,total:6,limited:false,
  searchable,unreadable:6-searchable,source:'six-canonical-docs-isolated-preview',
  note:searchable===6?'Seis documentos extraídos, verificar cobertura de páginas.':
  'Una o más fuentes contienen poco o ningún texto; podrían requerir OCR dirigido.'};
}
export async function readCanonicalPreviewDocuments({
 fetcher=globalThis.fetch,url=new URL('./snapshot/canonical-documents.json',import.meta.url)
}={}){
 const target=new URL(url,import.meta.url);
 if(target.origin!==new URL(import.meta.url).origin)throw Error('Origen documental externo no permitido');
 const response=await fetcher(target.href,{cache:'default'});
 if(!response?.ok||response.type==='opaque')throw Error('Copia documental canónica no disponible en esta instalación');
 const length=Number(response.headers?.get('Content-Length')||0);
 if(length>6*1024*1024)throw Error('Índice documental excede límite');
 const text=await response.text();
 if(text.length>6*1024*1024)throw Error('Índice documental excede límite');
 let parsed;
 try{parsed=JSON.parse(text)}catch{throw Error('Índice documental JSON inválido')}
 return validateCanonicalSnapshot(parsed);
}
export async function readEdgeAvailableDocuments({indexedDB=globalThis.indexedDB,fetcher=globalThis.fetch}={}){
 let published;
 try{published=await readPublishedDocumentCache({indexedDB})}
 catch(error){published={available:false,documents:[],reason:String(error.message||error)}}
 if(published.available===true&&published.documents.length===6&&published.limited!==true)
  return {...published,source:'production-documents-read-only'};
 try{return await readCanonicalPreviewDocuments({fetcher})}
 catch(error){
  if(published.available===true&&published.documents.length)
   return {...published,source:'production-documents-partial-read-only',
    reason:'Snapshot no disponible: '+String(error.message||error).slice(0,180)};
  return {available:false,documents:[],total:0,source:'none',
   reason:'Los seis documentos canónicos no están indexados ni disponibles en esta instalación'};
 }
}
