import test from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {buildIndex,searchIndex} from './next/search-core.js';
import {documentRows,chunkEvidence,mergeDocumentEvidence} from './next/document-fabric.js';
import {readPublishedDocumentCache} from './next/document-source.js';
import {EvidenceFabric} from './next/fabric-client.js';
import {SemanticEvidenceFabric} from './next/semantic-fabric.js';

function fakeSearch(){
 let index;
 return {
  async build(rows,opts){index=buildIndex(rows,opts);return {count:index.docs.size,terms:index.postings.size}},
  async query(query,opts){return searchIndex(index,query,opts)},
  close(){}
 };
}
const sample=[
 {name:'Formación de óxidos',path:'Formación de óxidos.docx',type:'DOCX',
  chunks:['Los óxidos se forman al combinar oxígeno con un elemento.', 'Reglas de nomenclatura de óxidos básicos y ácidos.']},
 {name:'Seguridad del laboratorio',path:'seguridad.pdf',type:'PDF',
  chunks:['Revisar etiquetas, medidas de protección y los protocolos de seguridad.']}
];

test('Fabric fragmenta con solapamiento sin inventar texto ni romper el orden',()=>{
 const text='En el laboratorio se estudian procesos de oxidación y reducción. '.repeat(50);
 const parts=chunkEvidence(text,{size:210,overlap:30});
 assert.ok(parts.length>1);assert.ok(parts.every(part=>part.end>part.start));
 assert.equal(parts[0].start,0);
 assert.equal(parts[0].text,parts[0].text.trim());
 assert.throws(()=>chunkEvidence('abc',{size:8}),/inválidos/);
});
test('Fabric conserva título, ruta y número del fragmento exacto',()=>{
 const rows=documentRows(sample);
 assert.equal(rows.length,3);
 const e=mergeDocumentEvidence(rows,[{id:rows[0].id,score:.9,lexical:1.8,similarity:null}]);
 assert.equal(e[0].source.path,'Formación de óxidos.docx');
 assert.equal(e[0].source.index,0);
 assert.match(e[0].excerpt,/óxidos/);
 assert.throws(()=>documentRows([sample[0],sample[0]]),/duplicada/);
});
test('Fabric BM25 devuelve evidencia de documentos reales sin red',async()=>{
 const fabric=new EvidenceFabric({search:fakeSearch()});
 const prepared=await fabric.build(sample);
 assert.equal(prepared.fragments,3);
 const found=await fabric.query('nomenclatura de óxidos');
 assert.equal(found[0].source.path,'Formación de óxidos.docx');
 assert.match(found[0].excerpt,/nomenclatura/i);
 assert.equal((await fabric.query('quasar extraterrestre')).length,0);
 fabric.close();
});
test('Fabric híbrido combina vectores reales inyectados con BM25',async()=>{
 const fabric=new EvidenceFabric({search:fakeSearch()});
 const docs=[{name:'Vasos',path:'vasos.txt',chunks:['Recipientes de vidrio']},{name:'Balanza',path:'balanza.txt',chunks:['Pesar reactivos']}];
 await fabric.build(docs,{vectors:[[1,0],[0,1]]});
 const result=await fabric.query('',{vector:[0,1],limit:2});
 assert.equal(result[0].source.path,'balanza.txt');
 assert.ok(result[0].similarity>.99);
 fabric.close();
});
test('Motor semántico ausente conserva búsqueda BM25 y declara la limitación',async()=>{
 const fabric=new EvidenceFabric({search:fakeSearch()});
 const encoder={async status(){return {installed:false}},close(){},async prepare(){throw Error('No debe cargar modelo')},async embed(){throw Error('No debe generar vectores')}};
 const hybrid=new SemanticEvidenceFabric({fabric,encoder});
 const init=await hybrid.prepare(sample,{semantic:true});
 assert.equal(init.mode,'lexical');assert.match(init.reason,/no instalado/i);
 const res=await hybrid.query('protección');
 assert.equal(res.mode,'lexical');assert.equal(res.evidence[0].source.path,'seguridad.pdf');
 hybrid.close();
});
test('Puente documental abre readonly y no modifica los documentos preexistentes',async()=>{
 const request=indexedDB.open('NEXUS_EDGE_DOC_FABRIC_TEST',1);
 const db=await new Promise((resolve,reject)=>{
  request.onupgradeneeded=()=>request.result.createObjectStore('documents',{keyPath:'path'});
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('documents','readwrite');
  tx.objectStore('documents').put({...sample[0],blob:new Blob(['archivo maestro'])});
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });db.close();
 const result=await readPublishedDocumentCache({indexedDB,database:'NEXUS_EDGE_DOC_FABRIC_TEST'});
 assert.equal(result.available,true);assert.equal(result.documents.length,1);
 assert.equal(result.documents[0].path,sample[0].path);
 assert.equal('blob' in result.documents[0],false);
 assert.match(result.documents[0].chunks[0],/óxidos/);
});
test('Puente documental no crea ni migra una base si no existe',async()=>{
 const result=await readPublishedDocumentCache({indexedDB,database:'NEXUS_EDGE_NONEXISTENT_DOCS_92382'});
 assert.equal(result.available,false);
 assert.equal(result.documents.length,0);
});
