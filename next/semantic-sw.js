/* Experimental /next/-only PWA and model cache. Independent of stable NEXUS SW.
 * Models NEVER trigger a network fallback. The shell is network-first while
 * online and cache-fallback in airplane mode, after explicit preparation.
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
 const PARENT=new URL('../',ROOT);
 const sensorAsset=url.pathname.startsWith(new URL('./offline/',PARENT).pathname)||
   url.pathname===new URL('./jsQR.js',PARENT).pathname;
 if(url.origin!==ROOT.origin||(!url.pathname.startsWith(ROOT.pathname)&&!sensorAsset))return;
 const canonical=new URL(url);canonical.search='';canonical.hash='';
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const asHead=response=>new Response(null,{status:200,headers:{
   'Content-Type':response.headers.get('Content-Type')||'application/octet-stream',
   'Content-Length':response.headers.get('Content-Length')||''
  }});
  if(url.pathname.startsWith(PREFIX)){
   const receipt=await cache.match(RECEIPT);
   if(!receipt?.ok)return new Response('Modelo sin validar. Completá la instalación explícita.',{status:503});
   const hit=await cache.match(canonical.href);
   if(!hit)return new Response('Modelo no preparado. Usá el instalador explícito.',{status:503});
   return request.method==='HEAD'?asHead(hit):hit;
  }
  // Never cache automatically here: prep happens only through offline-shell.js.
  try{
   const live=await fetch(request);
   if(live.ok)return live;
   const cached=await cache.match(canonical.href);
   return cached?(request.method==='HEAD'?asHead(cached):cached):live;
  }catch{
   const cached=await cache.match(canonical.href);
   return cached?(request.method==='HEAD'?asHead(cached):cached):new Response('Recurso Edge no preparado para modo avión.',{status:503});
  }
 })());
});
