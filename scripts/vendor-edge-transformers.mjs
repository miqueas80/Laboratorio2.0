/**
 * Local-only release staging for Transformers.js v3.8.1, not a runtime CDN.
 * First run: npm install --no-save --ignore-scripts @huggingface/transformers@3.8.1
 * Then: node scripts/vendor-edge-transformers.mjs
 * The produced files must be deployed at the same origin; this script changes
 * only next/vendor and never the production offline models or Service Worker.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'node_modules','@huggingface','transformers','dist');
const target=path.join(root,'next','vendor');
const files=[
 ['transformers.min.js','transformers/transformers.min.js'],
 ['ort-wasm-simd-threaded.jsep.mjs','onnx/ort-wasm-simd-threaded.jsep.mjs'],
 ['ort-wasm-simd-threaded.jsep.wasm','onnx/ort-wasm-simd-threaded.jsep.wasm']
];
const pkg=JSON.parse(await fs.readFile(path.join(root,'node_modules','@huggingface','transformers','package.json'),'utf8'));
if(pkg.version!=='3.8.1')throw Error('Se requiere exactamente @huggingface/transformers@3.8.1');
for(const [source,destination] of files){
 const output=path.join(target,destination);
 await fs.mkdir(path.dirname(output),{recursive:true});
 await fs.copyFile(path.join(dist,source),output);
 const buffer=await fs.readFile(output);
 console.log(destination+' '+buffer.length+' bytes sha256 '+createHash('sha256').update(buffer).digest('hex'));
}
console.log('Runtime local preparado. Los 118 MB de pesos se instalan de forma opcional, tras autorización, mediante el caché semántico del navegador.');
