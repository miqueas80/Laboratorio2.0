/* Opt-in same-origin model cache overlay scoped ONLY to /next/.
 * Model files are fetched and verified only after the user's explicit action.
 * This worker never intercepts the production PWA scope or writes its cache.
 */
'use strict';
const CACHE='nexus-edge-semantic-model-v1';
const ROOT=new URL(self.registration.scope);
const PREFIX=new URL('./models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/',ROOT).pathname;
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(!['GET','HEAD'].includes(request.method))return;
 const url=new URL(request.url);
 if(url.origin!==ROOT.origin||!url.pathname.startsWith(PREFIX))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),hit=await cache.match(url.href);
  if(!hit)return new Response('Modelo semántico no preparado. Usá el instalador explícito.',{status:503});
  if(request.method==='HEAD')return new Response(null,{status:200,headers:{'Content-Type':hit.headers.get('Content-Type')||'application/octet-stream','Content-Length':hit.headers.get('Content-Length')||''}});
  return hit;
 })());
});
