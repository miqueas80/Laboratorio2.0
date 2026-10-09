import test from 'node:test';
import assert from 'node:assert/strict';
import {CANONICAL_DOCS,validateCanonicalSnapshot,readCanonicalPreviewDocuments,
 readEdgeAvailableDocuments} from './next/canonical-source.js';
import {documentRows} from './next/document-fabric.js';

const good=()=>({
 schema:'nexus-edge-canonical-documents-v1',version:1,
 documents:CANONICAL_DOCS.map(d=>({
  path:d.path,name:d.path.split('/').at(-1),type:d.path.split('.').at(-1),
  originalBytes:d.size,blobRevision:d.revision,sha256:'a'.repeat(64),
  text:'Una fuente química original con formación de óxidos y reactivos de laboratorio.',
  textCharacters:76,extractionStatus:'text',pdfPages:null,ocrPages:null
 }))
});
function sample(){
 const snap=good();
 for(const d of snap.documents)d.textCharacters=d.text.length;
 return snap;
}
test('Exactly six tracked source paths and Git blob revisions are required',()=>{
 const ok=validateCanonicalSnapshot(sample());
 assert.equal(ok.documents.length,6);assert.equal(ok.total,6);assert.equal(ok.searchable,6);
 assert.equal(ok.fullTextCoverage,true);
});
test('An unexpected seventh file, duplicate, path traversal or altered Git blob is rejected',()=>{
 const seventh=sample();seventh.documents.push({...seventh.documents[0],path:'../../secret.pdf'});
 assert.throws(()=>validateCanonicalSnapshot(seventh),/inválido/);
 const wrong=sample();wrong.documents[0].blobRevision='b'.repeat(40);
 assert.throws(()=>validateCanonicalSnapshot(wrong),/procedencia/);
 const swapped=sample();swapped.documents[1].path=swapped.documents[0].path;
 assert.throws(()=>validateCanonicalSnapshot(swapped),/duplicado/);
});
test('Partial OCR is explicitly flagged as incomplete, not complete evidence coverage',()=>{
 const payload=sample();payload.documents[1].extractionStatus='ocr-partial';
 const output=validateCanonicalSnapshot(payload);
 assert.equal(output.fullTextCoverage,false);assert.equal(output.searchable,6);
});
test('Read-only canonical fixture can be indexed with lexical evidence retaining original paths',()=>{
 const out=validateCanonicalSnapshot(sample()),rows=documentRows(out.documents);
 assert.ok(rows.length>=6);
 const paths=new Set(rows.map(r=>r.source.path));
 assert.equal(paths.size,6);
 assert.ok(paths.has('QUÍMICA (1) (1).pdf'));
});
test('Canonical preview never calls a third-party endpoint',async()=>{
 let requested='';
 const payload=sample();
 const fetcher=async url=>{requested=url;return new Response(JSON.stringify(payload),{
  headers:{'Content-Type':'application/json'}})};
 const result=await readCanonicalPreviewDocuments({fetcher});
 assert.equal(result.documents.length,6);assert.ok(requested.endsWith('/next/snapshot/canonical-documents.json'));
});
test('If production IDB absent, fallback to strict six-file static preview without writes',async()=>{
 const payload=sample();
 const source=await readEdgeAvailableDocuments({
  indexedDB:{databases:async()=>[]},
  fetcher:async()=>new Response(JSON.stringify(payload))
 });
 assert.equal(source.available,true);assert.equal(source.source,'six-canonical-docs-isolated-preview');
});
test('Missing or altered preview cannot manufacture six indexed documents',async()=>{
 const source=await readEdgeAvailableDocuments({
  indexedDB:{databases:async()=>[]},
  fetcher:async()=>new Response('Not found',{status:404})
 });
 assert.equal(source.available,false);assert.equal(source.documents.length,0);
});
