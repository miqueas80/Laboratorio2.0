/* Optional experimental model-only Service Worker.
 * Scope must remain /next/. This cache is distinct from production SW.
 * A verified receipt is required before serving ANY model asset.
 */
'use strict';
const CACHE='nexus-edge-semantic-model-v2';
const ROOT=new URL(self.registration.scope);
const PREFIX=new URL('./models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/',ROOT).pathname;
const RECEIPT=new URL('./models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/__nexus_installed_v2.json',ROOT).href;
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(!['GET','HEAD'].includes(request.method))return;
 const url=new URL(request.url);
 if(url.origin!==ROOT.origin||!url.pathname.startsWith(PREFIX))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const receipt=await cache.match(RECEIPT);
  if(!receipt?.ok)return new Response('Modelo no validado. Completá la instalación explícita.',{status:503});
  const hit=await cache.match(url.href);
  if(!hit)return new Response('Modelo no preparado. Usá el instalador explícito.',{status:503});
  if(request.method==='HEAD')return new Response(null,{status:200,headers:{
   'Content-Type':hit.headers.get('Content-Type')||'application/octet-stream',
   'Content-Length':hit.headers.get('Content-Length')||''
  }});
  return hit;
 })());
});
