import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './cloudflare/worker.js';
const origin='https://miqueas80.github.io',env={XKIRO_API_KEY:'private-server-secret'};
const req=(path,options={})=>new Request('https://gateway.example'+path,{...options,headers:{Origin:origin,...options.headers}});
const chat=(payload={},headers={})=>req('/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({model:'test',messages:[{role:'user',content:'Hola'}],...payload})});
test('Worker health, CORS oficial, preflight, método, Content-Type y tamaño',async()=>{
 assert.equal((await worker.fetch(req('/health'),env)).status,200);
 const health=await worker.fetch(req('/health'),env);assert.equal(health.headers.get('Access-Control-Allow-Origin'),origin);assert.doesNotMatch(await health.text(),/private-server-secret/);
 assert.equal((await worker.fetch(req('/models',{headers:{Origin:'https://evil.example'}}),env)).status,403);
 assert.equal((await worker.fetch(req('/health',{headers:{Origin:'https://evil.example'}}),env)).status,403);
 assert.equal((await worker.fetch(req('/models',{method:'OPTIONS'}),env)).status,204);
 assert.equal((await worker.fetch(req('/health',{method:'POST'}),env)).status,405);
 assert.equal((await worker.fetch(req('/models',{method:'POST'}),env)).status,405);
 assert.equal((await worker.fetch(chat({}, {'Content-Type':'text/plain'}),env)).status,415);
 assert.equal((await worker.fetch(chat({}, {'Content-Length':String(4*1024*1024)}),env)).status,413);
 assert.equal((await worker.fetch(chat({messages:[{content:'x'.repeat(3*1024*1024+1)}]}),env)).status,413);
 assert.equal((await worker.fetch(req('/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:'bad'}),env)).status,400);
});
test('Worker models/chat proxy, sanitización y credencial exclusivamente upstream',async()=>{
 const original=globalThis.fetch;let seen;
 globalThis.fetch=async(url,init)=>{seen={url,init};return Response.json({choices:[{message:{content:'OK'}}]})};
 try{
  assert.equal((await worker.fetch(req('/models'),env)).status,200,'binding opcional');
  const response=await worker.fetch(chat({temperature:99,max_tokens:99999,stream:true,tools:[{evil:true}]}),env);assert.equal(response.status,200);
  assert.equal(seen.init.headers.Authorization,'Bearer '+env.XKIRO_API_KEY);assert.ok(seen.init.signal instanceof AbortSignal);
  const payload=JSON.parse(seen.init.body);assert.equal(payload.temperature,2);assert.equal(payload.max_tokens,4096);assert.deepEqual(Object.keys(payload).sort(),['max_tokens','messages','model','temperature']);
 }finally{globalThis.fetch=original}
});
test('Worker 401/403/429/5xx y Retry-After no filtran errores upstream ni secretos',async()=>{
 const original=globalThis.fetch;
 try{for(const status of [401,403,429,500,503]){
  globalThis.fetch=async()=>new Response('error '+env.XKIRO_API_KEY,{status,headers:{'Retry-After':'120'}});
  const response=await worker.fetch(chat(),env);assert.equal(response.status,status);assert.equal(response.headers.get('Retry-After'),'120');assert.equal(response.headers.get('Access-Control-Expose-Headers'),'Retry-After');assert.doesNotMatch(await response.text(),/private-server-secret/);
 }
 globalThis.fetch=async()=>{throw new Error(env.XKIRO_API_KEY)};let response=await worker.fetch(chat(),env);assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/private-server-secret/);
 globalThis.fetch=async()=>{throw new DOMException('timeout','AbortError')};assert.equal((await worker.fetch(chat(),env)).status,504);
 }finally{globalThis.fetch=original}
});
test('Worker rate limiter binding produce 429 con Retry-After',async()=>{
 const response=await worker.fetch(req('/models'),{...env,NEXUS_RATE_LIMITER:{limit:async()=>({success:false})}});assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');
});
test('Worker timeout cancela upstream mediante AbortSignal',async()=>{
 const originalFetch=globalThis.fetch,originalTimer=globalThis.setTimeout,originalClear=globalThis.clearTimeout;let timeout;
 globalThis.setTimeout=(fn,ms)=>{timeout=ms;queueMicrotask(fn);return 0};globalThis.clearTimeout=()=>{};
 globalThis.fetch=async(url,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError'))));
 try{const response=await worker.fetch(chat(),env);assert.equal(timeout,25000);assert.equal(response.status,504)}finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalTimer;globalThis.clearTimeout=originalClear}
});
