/*
 * Experimental local-model companion Service Worker for /offline/ only.
 * Installed ONLY by Edge Lab with explicit operator action.
 *
 * Reuses the SAME hashed CacheStorage entries created by NexusOffline.prepare()
 * (no second copy of model weights) and NEVER purges or modifies the stable
 * production caches. No remote fallback when navigator is offline.
 */
'use strict';
const PREFIX=new URL(self.registration.scope).pathname;
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(url.origin!==self.location.origin||!url.pathname.startsWith(PREFIX)||
    !['GET','HEAD'].includes(request.method))return;
 event.respondWith((async()=>{
  const cached=await caches.match(url.href);
  // Prefer online update of script assets; for model files only use verified
  // snapshots produced by the explicit NexusOffline.prepare() workflow.
  const model=/\.(?:onnx|wasm|tar\.gz)$/.test(url.pathname);
  if(model&&cached)return request.method==='HEAD'?new Response(null,{status:200}):cached;
  try{
   const response=await fetch(request);
   if(response.ok)return response;
   if(cached)return request.method==='HEAD'?new Response(null,{status:200}):cached;
   return response;
  }catch{
   if(cached)return request.method==='HEAD'?new Response(null,{status:200}):cached;
   return new Response('El recurso local no está preparado para modo avión.',{status:503});
  }
 })());
});
