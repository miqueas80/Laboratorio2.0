import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,master} from './harness.mjs';
const chain=['gemini-3.8-flash','gemini-3.7-flash','gemini-3.6-flash'];
for(const statuses of [[200],[429,200],[503,503,200],[401],[403],[400],[404,200],[429,503,503]])test('failover runtime '+statuses,async()=>{
 const attempts=[];const h=harness({stored:master.records,fetcher:(url,opts)=>{
  if(!opts?.body)return Response.json({models:chain.map(name=>({name:'models/'+name,supportedGenerationMethods:['generateContent']}))});
  attempts.push(String(url).match(/models\/(.*):generateContent/)[1]);const status=statuses[attempts.length-1];assert.ok(status,'no repetir modelos');
  return status===200?Response.json({candidates:[{content:{parts:[{text:'OK'}]}}]}):new Response('',{status});
 }});
 try{await h.api.loadMaster();h.window.localStorage.setItem('nexus_gemini_api_key_v1','private-test-key');
  if(statuses.at(-1)===200){const out=await h.api.geminiGenerate({question:'test'});assert.equal(out.model,chain[statuses.length-1]);assert.equal(h.api.health.gemini.fallbackUsed,statuses.length>1)}
  else await assert.rejects(h.api.geminiGenerate({question:'test'}));
  assert.deepEqual(attempts,chain.slice(0,statuses.length));assert.equal(h.api.health.gemini.attemptedModels.length,attempts.length);
  assert.doesNotMatch(JSON.stringify(h.api.health.gemini),/private-test-key/);
  const local=await h.api.nexusAgentTurn('Nexus busca ácido nítrico');assert.equal(local.actions[0].result.ok,true);assert.equal(h.api.state.inventory.length,111);
 }finally{h.close()}
});
test('sólo modelos disponibles, preferencia exitosa y abort sin failover',async()=>{
 let abort=false;const attempts=[];const h=harness({fetcher:(url,opts)=>{
  if(!opts?.body)return Response.json({models:chain.slice(1).map(name=>({name:'models/'+name,supportedGenerationMethods:['generateContent']}))});
  attempts.push(String(url));if(abort)throw new DOMException('cancelado','AbortError');
  if(String(url).includes('3.7'))return new Response('',{status:429});
  return Response.json({candidates:[{content:{parts:[{text:'OK'}]}}]});
 }});
 try{h.window.localStorage.setItem('nexus_gemini_api_key_v1','key');await h.api.geminiGenerate({question:'test'});await h.api.geminiGenerate({question:'test'});assert.equal(attempts.length,3);assert.match(attempts[2],/3.6/);abort=true;await assert.rejects(h.api.geminiGenerate({question:'test'}));assert.equal(attempts.length,4)}finally{h.close()}
});
