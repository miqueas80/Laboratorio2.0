/**
 * Runtime smoke test: real multilingual MiniLM ONNX inference, completely
 * local after external assets have been downloaded and SHA256-verified by CI.
 * This does not prove WebGPU, Android speed, 60 FPS or production integration.
 */
import {pipeline,env} from '../next/vendor/transformers/transformers.min.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const model='Xenova/paraphrase-multilingual-MiniLM-L12-v2';
env.allowRemoteModels=false;
env.allowLocalModels=true;
env.localModelPath=path.join(root,'next','models')+path.sep;
env.useFS=true;
env.useFSCache=false;
env.useBrowserCache=false;
env.backends.onnx.wasm.wasmPaths=path.join(root,'next','vendor','onnx')+path.sep;
env.backends.onnx.wasm.numThreads=1;

const started=performance.now();
const encoder=await pipeline('feature-extraction',model,{dtype:'q8',device:'wasm'});
const sentences=[
 '¿Qué es un matraz Erlenmeyer?',
 'El matraz Erlenmeyer es un recipiente de vidrio utilizado en el laboratorio.',
 'El equipo de fútbol ganó su último partido.'
];
const out=await encoder(sentences,{pooling:'mean',normalize:true});
const dims=Array.from(out.dims||[]);
if(dims[0]!==3||dims.at(-1)!==384)throw Error('Dimensiones de embeddings no válidas: '+dims);
const vector=i=>Array.from(out.data.slice(i*384,(i+1)*384));
const a=vector(0),b=vector(1),c=vector(2);
const cosine=(x,y)=>x.reduce((acc,v,i)=>acc+v*y[i],0);
const related=cosine(a,b),unrelated=cosine(a,c);
if(!Number.isFinite(related)||!Number.isFinite(unrelated)||related<=unrelated)
 throw Error('La prueba semántica no separó el texto científico del irrelevante: '+JSON.stringify({related,unrelated}));
console.log(JSON.stringify({model,dtype:'q8',device:'wasm',vectors:3,dimension:384,
 related:Number(related.toFixed(4)),unrelated:Number(unrelated.toFixed(4)),
 inferenceMs:Math.round(performance.now()-started),remoteModels:false},null,2));
out.dispose?.();
await encoder.dispose?.();
