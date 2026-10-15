import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// Non-invasive web quality gates. This file never writes to institutional data.
const root=fileURLToPath(new URL('.',import.meta.url));
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const app=read('app.js');
const sw=read('sw.js');
const html=read('index.html');

test('NEXUS: application and service worker release versions stay synchronized',()=>{
 const appVersion=app.match(/\bconst\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
 const swVersion=sw.match(/\bconst\s+VERSION\s*=\s*['"]([^'"]+)['"]/);
 assert.ok(appVersion,'APP_VERSION must exist');
 assert.ok(swVersion,'service worker VERSION must exist');
 assert.equal(appVersion[1],swVersion[1],'never deploy mixed offline shell versions');
});

test('NEXUS: every atomic offline shell asset exists and remains same-origin',()=>{
 const raw=sw.match(/\bconst\s+CORE\s*=\s*\[([\s\S]*?)\];/);
 assert.ok(raw,'the atomic CORE cache manifest must exist');
 const files=[...raw[1].matchAll(/['"]([^'"]+)['"]/g)].map(m=>m[1]);
 assert.ok(files.length>=20,'unexpectedly small offline shell');
 assert.equal(files.length,new Set(files).size,'duplicate cache entries');
 for(const file of files){
  assert.ok(file.startsWith('./'),'CORE entries must be relative URLs: '+file);
  const normalized=path.normalize(file);
  assert.ok(!normalized.split(path.sep).includes('..'),'path escape from shell: '+file);
  const local=file==='./'?'index.html':file.slice(2);
  assert.ok(fs.existsSync(path.join(root,local)), 'missing offline shell file: '+file);
 }
});

test('NEXUS: offline models remain optional and have integrity metadata',()=>{
 const context={};
 context.globalThis=context;
 vm.runInNewContext(read('offline/assets.js'),context);
 const manifest=context.NEXUS_OFFLINE_ASSETS;
 assert.ok(manifest?.version);
 assert.ok(Array.isArray(manifest.files)&&manifest.files.length>0);
 const names=new Set();
 for(const item of manifest.files){
  assert.ok(['voice','vision'].includes(item.group),'unknown optional engine group');
  assert.match(item.path,/^[a-z0-9_./-]+$/i);
  assert.ok(!item.path.split('/').includes('..'),'path traversal in models');
  assert.ok(Number.isSafeInteger(item.bytes)&&item.bytes>0,'missing model size');
  assert.match(item.sha256,/^[a-f0-9]{64}$/,'missing model checksum');
  assert.ok(!names.has(item.path),'duplicate model path');
  names.add(item.path);
 }
 assert.match(sw,/MODEL_CACHE/);
 assert.match(sw,/MODEL_URLS/);
});

test('NEXUS: install stays atomic and does not forcibly replace active clients',()=>{
 assert.match(sw,/cache\.addAll\(/,'atomic offline shell cache is required');
 assert.match(sw,/caches\.delete\(CACHE\)/,'failed install must discard partial shell');
 assert.doesNotMatch(sw,/\.skipWaiting\s*\(/,'do not force activation mid-session');
 assert.doesNotMatch(sw,/\.claim\s*\(/,'do not seize uncontrolled sessions');
});

test('NEXUS: installable PWA keeps local scope and bundled icons',()=>{
 const manifest=JSON.parse(read('manifest.webmanifest'));
 assert.equal(manifest.start_url,'./');
 assert.equal(manifest.scope,'./');
 assert.equal(manifest.id,'./');
 assert.equal(manifest.display,'standalone');
 assert.ok(manifest.icons.some(i=>i.sizes==='192x192'));
 assert.ok(manifest.icons.some(i=>i.sizes==='512x512'));
 for(const icon of manifest.icons){
  assert.ok(!/^(?:https?:)?\/\//i.test(icon.src),'PWA icons must be local');
  assert.ok(fs.existsSync(path.join(root,icon.src)),'missing PWA icon '+icon.src);
 }
 assert.match(html,/<html\s+lang="es"/i);
 assert.match(html,/rel="manifest"/i);
});

test('NEXUS: preserve baseline browser security and accessible motion preference',()=>{
 assert.match(html,/http-equiv="Content-Security-Policy"/i);
 assert.match(html,/object-src\s+'none'/i);
 assert.match(html,/prefers-reduced-motion/i);
 assert.match(html,/name="viewport"/i);
});
