import {EdgeSearchClient} from './search-client.js';
import {createVirtualList} from './virtual-list.js';
import {inspectMigration} from './storage.js';
import {evaluateStorage} from './chemical-engine.js';
const $=id=>document.getElementById(id);
let client=null,records=null;
const virtual=createVirtualList($('virtual'),{rowHeight:44,renderRow:(row)=>{const el=document.createElement('div');el.className='virtual-row';el.textContent=row.id+' · '+row.text;return el}});
async function getRecords(){
 if(records)return records;
 const res=await fetch('../inventory.json',{cache:'no-store'});
 if(!res.ok)throw Error('No se pudo cargar inventario canónico: HTTP '+res.status);
 const parsed=await res.json();
 if(!Array.isArray(parsed.records))throw Error('Inventario inválido');
 records=parsed.records;return records;
}
function output(node,value){$(node).textContent=typeof value==='string'?value:JSON.stringify(value,null,2)}
async function task(fn,node){
 try{await fn()}catch(error){output(node,'Error: '+String(error.message||error))}
}
function makeRows(rows){return rows.map(r=>({id:r.id,text:[r.id,r.name,r.formula,r.location,r.cas].filter(Boolean).join(' ')}))}
async function build(rows){
 client?.close();client=new EdgeSearchClient();
 const started=performance.now(),info=await client.build(rows);
 virtual.setRows(rows);
 output('results',{...info,ms:Math.round(performance.now()-started),note:'Tiempo solo orientativo: no es una prueba de 60 FPS ni de memoria RAM.'});
}
$('load').onclick=()=>task(async()=>build(makeRows(await getRecords())),'results');
$('stress').onclick=()=>task(async()=>{
 const rows=Array.from({length:100001},(_,i)=>({id:'SYN-'+String(i).padStart(6,'0'),text:'reactivo sintético de demostración codigo '+i}));
 await build(rows);
},'results');
$('search').onclick=()=>task(async()=>{if(!client)throw Error('Primero prepará un índice');output('results',await client.query($('query').value,{limit:10}))},'results');
$('integrity').onclick=()=>task(async()=>output('checks',inspectMigration(await getRecords())),'checks');
$('safety').onclick=()=>task(async()=>output('checks',evaluateStorage(await getRecords())),'checks');
window.addEventListener('pagehide',()=>client?.close(),{once:true});
