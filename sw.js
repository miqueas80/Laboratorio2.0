'use strict';
// Incrementar VERSION junto con APP_VERSION cuando cambie cualquier recurso CORE.
const VERSION='2026.09.28-r2';
const SCOPE=new URL(self.registration.scope);
const PREFIX='nexus-x-shell:'+encodeURIComponent(SCOPE.pathname)+':';
const CACHE=PREFIX+VERSION;
const CORE=['./','./index.html','./app.js','./manifest.webmanifest','./icon.svg',
 './icons/icon-192.png','./icons/icon-512.png','./inventory.json','./document-worker.js',
 './vendor/jszip.min.js','./vendor/xlsx.full.min.js','./vendor/jsQR.js',
 './vendor/pdf.mjs','./vendor/pdf.worker.mjs'];
const URLS=new Set(CORE.map(path=>new URL(path,SCOPE).href));

self.addEventListener('install',event=>{
 // Instalación completa o ninguna: no sustituir un núcleo operativo a medias.
 event.waitUntil((async()=>{
  try{const cache=await caches.open(CACHE);await cache.addAll([...URLS].map(url=>new Request(url,{cache:'reload'})))}
  catch(error){await caches.delete(CACHE);throw error}
 })());
 // Sin skipWaiting: todas las pestañas de la versión anterior deben cerrarse.
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==SCOPE.origin||!url.pathname.startsWith(SCOPE.pathname))return;
 const clean=new URL(url);clean.search='';clean.hash='';
 // HTML y lectores pertenecen a la misma versión. No actualizar archivos sueltos.
 const target=request.mode==='navigate'?new URL('./index.html',SCOPE).href:clean.href;
 if(!URLS.has(target))return;
 event.respondWith((async()=>{
  const cached=await (await caches.open(CACHE)).match(target);
  if(cached)return cached;
  try{return await fetch(request)}catch{return new Response('Recurso local no disponible. Reconectá para reparar la instalación.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}})}
 })());
});
