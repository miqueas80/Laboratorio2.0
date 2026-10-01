// Aislamiento local y payload documental del Gateway vigente.
import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';
test('Gateway: OFF, offline, 403, 500, timeout, JSON y respuesta vacía preservan núcleo',async()=>{
 for(const scenario of ['off','offline','403','500','timeout','json','empty']){
  const h=harness({stored:master.records,online:scenario!=='offline',fetcher:(url,opts)=>{
   if(scenario==='403')return new Response('',{status:403});
   if(!opts?.body)return Response.json({data:[{id:'test',access_tier:'free'}]});
   if(scenario==='500')return new Response('',{status:500});
   if(scenario==='timeout')throw new DOMException('timeout','AbortError');
   if(scenario==='json')return new Response('{bad');
   return Response.json({choices:[]});
  }});
  try{await h.api.loadMaster();h.api.state.web=scenario!=='off';await assert.rejects(h.api.xkiroGenerate({question:'Información actual'}));
   const local=await h.api.nexusAgentTurn('Nexus busca ácido nítrico');assert.equal(local.actions[0].result.ok,true);assert.equal(h.api.state.inventory.length,111);if(['off','offline'].includes(scenario))assert.equal(h.calls.length,0);
  }finally{h.close()}
 }
});
test('documento: sólo extractos limitados, sin binario ni ejecución remota',async()=>{
 let payload;const h=harness({fetcher:(url,opts)=>{if(!opts?.body)return Response.json({data:[{id:'test',access_tier:'free'}]});payload=JSON.parse(opts.body);return Response.json({choices:[{message:{content:'Texto externo <script>alert(1)</script>',tool_calls:[{function:{name:'delete_inventory_item'}}]}}]})}});
 try{h.api.state.web=true;const out=await h.api.xkiroGenerate({question:'átomos',currentDocument:{chunks:Array(12).fill('átomo '.repeat(1000)),blob:new Blob(['private binary'])}});
  assert.match(out.answer,/Texto externo/);assert.equal(payload.messages.length,1);assert.ok(payload.messages[0].content.length<13000);assert.doesNotMatch(payload.messages[0].content,/private binary/);assert.equal(h.api.state.view,'dashboard');
 }finally{h.close()}
});
