/**
 * Opt-in, repeatable DESKTOP NODE benchmark for NEXUS Edge search.
 * NOT a replacement for Android battery, memory, GPU or 60 FPS measurements.
 */
import {performance} from 'node:perf_hooks';
import {buildIndex,searchIndex} from '../next/search-core.js';
import {HNSWIndex} from '../next/hnsw.js';

const inventoryTerms=['reactivo químico','matraz erlenmeyer','vaso de precipitados','ácido nítrico','probeta de laboratorio','microscopio','documento de óxidos'];
const rows=Array.from({length:100001},(_,i)=>({
 id:'SYN-'+String(i).padStart(6,'0'),
 text:inventoryTerms[i%inventoryTerms.length]+' lote '+i+' sector '+(i%80)
}));
function mib(bytes){return Number((bytes/1024/1024).toFixed(2))}
const baseHeap=process.memoryUsage().heapUsed,start=performance.now();
const index=buildIndex(rows,{maxRows:150000});
const indexMs=performance.now()-start,queries=['ácido nítrico','microscopio','matraz erlenmeyer','probeta'];
const latency=[];
for(let i=0;i<100;i++){
 const begin=performance.now();
 const hits=searchIndex(index,queries[i%queries.length],{limit:12});
 if(!hits.length)throw Error('Búsqueda sintética sin resultados');
 latency.push(performance.now()-begin);
}
const vectors=[];
for(let i=0;i<1024;i++){
 const v=Array.from({length:32},(_,j)=>Math.sin(i*.77+j*1.1)+Math.cos(i+j));
 vectors.push({id:'v-'+i,vector:v});
}
const hnswStart=performance.now(),hnsw=new HNSWIndex({dimension:32,m:10,efConstruction:40,efSearch:60});
hnsw.addAll(vectors);
const hnswMs=performance.now()-hnswStart,query=hnsw.search(vectors[200].vector,{k:1});
if(query[0].id!=='v-200')throw Error('El vecino esperado no fue encontrado');
latency.sort((a,b)=>a-b);
const report={
 environment:'Node CI, no Android',
 records:index.docs.size,terms:index.postings.size,
 indexMs:Math.round(indexMs),incrementalHeapMiB:mib(process.memoryUsage().heapUsed-baseHeap),
 heapMiB:mib(process.memoryUsage().heapUsed),rssMiB:mib(process.memoryUsage().rss),
 p50QueryMs:Number(latency[49].toFixed(3)),p95QueryMs:Number(latency[94].toFixed(3)),
 hnswCount:1024,hnswBuildMs:Math.round(hnswMs),
 disclaimer:'No mide memoria máxima del navegador ni tasa de FPS de la aplicación'
};
console.log(JSON.stringify(report,null,2));
