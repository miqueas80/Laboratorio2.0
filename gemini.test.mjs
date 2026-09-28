import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';
const models={models:[{name:'models/gemini-test-flash',supportedGenerationMethods:['generateContent']}]};
const keyName='nexus_gemini_api_key_v1';
const response=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});

test('router: controles de Internet son locales y el híbrido busca antes de consultar fuera',async()=>{
 let payload;
 const h=harness({stored:master.records,fetcher:(url,opts)=>{
  if(!opts?.body)return response(models);
  payload=JSON.parse(opts.body);return response({candidates:[{content:{parts:[{text:'Resultado externo de prueba'}]},groundingMetadata:{groundingChunks:[{web:{uri:'https://example.org/reference',title:'Referencia'}}]}}]});
 }});
 try{await h.api.loadMaster();h.window.localStorage.setItem(keyName,'test-key');
  const toggle=await h.api.nexusAgentTurn('activa internet');assert.equal(toggle.route,'LOCAL');assert.equal(h.api.state.web,true);assert.equal(h.calls.length,0);
  const out=await h.api.nexusAgentTurn('Busca nuestro ácido nítrico y dime las recomendaciones actuales para almacenarlo');
  assert.equal(out.route,'HÍBRIDO');assert.equal(out.actions[0].result.ok,true);assert.match(out.answer,/LOCAL.*ácido nítrico/i);assert.match(out.answer,/EXTERNA.*Resultado/);
  assert.equal(h.api.state.view,'inventory');assert.equal(h.calls.length,2);assert.equal(payload.tools[0].google_search!=null,true);
  const text=payload.contents[0].parts.at(-1).text;assert.match(text,/HNO3/);assert.doesNotMatch(text,/NEXUS-X-0002|Armario|Estante/);
 }finally{h.close()}
});
test('Gemini: no configurado, offline, 403, 500, timeout, JSON y respuesta inválidos no dañan el núcleo',async()=>{
 for(const scenario of ['missing','offline','403','500','timeout','json','empty']){
  const h=harness({stored:master.records,online:scenario!=='offline',fetcher:(url,opts)=>{
   if(scenario==='403')return new Response('',{status:403});
   if(!opts?.body)return response(models);
   if(scenario==='500')return new Response('',{status:500});
   if(scenario==='timeout')throw new DOMException('simulated timeout','AbortError');
   if(scenario==='json')return new Response('{bad');
   return response({candidates:[{content:{parts:[{functionCall:{name:'delete_inventory_item',args:{query:'NEXUS-X-0001',confirm:true}}}]}}]});
  }});
  try{await h.api.loadMaster();h.api.state.web=true;if(scenario!=='missing')h.window.localStorage.setItem(keyName,'test-key');
   const out=await h.api.nexusAgentTurn('Información actual en Internet');assert.match(out.answer,/EXTERNA NO DISPONIBLE/,scenario);
   const local=await h.api.nexusAgentTurn('Nexus, busca ácido nítrico.');assert.equal(local.actions[0].result.ok,true,scenario);assert.equal(h.api.state.inventory.length,111);
   assert.ok(h.calls.length<=2,scenario+' retry loop');if(['missing','offline'].includes(scenario))assert.equal(h.calls.length,0);
  }finally{h.close()}
 }
});
test('documento: sólo extractos limitados, sin subir binario ni ejecutar salida remota',async()=>{
 let payload;const h=harness({fetcher:(url,opts)=>{if(!opts?.body)return response(models);payload=JSON.parse(opts.body);return response({candidates:[{content:{parts:[{text:'Texto externo <script>alert(1)</script>'},{functionCall:{name:'open_view',args:{view:'inventory'}}}]}}]})}});
 try{h.window.localStorage.setItem(keyName,'test-key');
  const out=await h.api.geminiGenerate({question:'átomos',currentDocument:{chunks:Array(12).fill('átomo '.repeat(1000)),blob:new Blob(['private binary'])}});
  assert.match(out.answer,/Texto externo/);assert.equal(payload.contents[0].parts.length,1);assert.ok(payload.contents[0].parts[0].text.length<13000);assert.equal(h.api.state.view,'dashboard');
 }finally{h.close()}
});
