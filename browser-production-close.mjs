// Chromium integration: node tools/browser-production-close.mjs (requires playwright).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,'playwright'):'playwright');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const prefix='/Laboratorio2.0/';
const mime={'.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.html':'text/html','.pdf':'application/pdf','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');if(!url.pathname.startsWith(prefix)){res.writeHead(404).end();return}
 const name=decodeURIComponent(url.pathname.slice(prefix.length))||'index.html';
 if(name.includes('..')){res.writeHead(403).end();return}
 try{const bytes=name==='app.js'?app.replace('\nboot();','\nglobalThis.__close={state,health,boot,setInternetMode,searchLocal,documentSearch,handleNetworkChange};\nboot();'):fs.readFileSync(path.join(root,name));res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream'}).end(bytes)}catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}${prefix}`;
let browser;const report={errors:[],githubCalls:0,gatewayCalls:[],results:[]};
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext();const page=await context.newPage();
 page.on('pageerror',error=>report.errors.push(error.message));
 await context.route('https://api.github.com/**',route=>{report.githubCalls++;route.fulfill({status:403})});
 let failed=false;
 await context.route('https://nexus-xkiro-gateway.proyectomj11.workers.dev/**',route=>{
  const endpoint=new URL(route.request().url()).pathname;report.gatewayCalls.push(endpoint);
  return route.fulfill({status:failed?503:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify(endpoint==='/health'?{ok:true}:{data:[{id:'confirmed-test',access_tier:'free'}]})});
 });
 await page.goto(base);await page.waitForFunction(()=>globalThis.__close?.state.docs.length===6,null,{timeout:60000});
 assert.equal(await page.evaluate(()=>__close.state.inventory.length),111);assert.equal(report.githubCalls,0);assert.equal(report.gatewayCalls.length,0);
 report.results.push('clean boot 111 / 6; no GitHub API; Internet OFF zero external requests');
 await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.active);
 await page.reload();await page.waitForFunction(()=>navigator.serviceWorker.controller&&globalThis.__close?.state.docs.length===6);
 await context.setOffline(true);await page.reload();await page.waitForFunction(()=>globalThis.__close?.state.docs.length===6);
 assert.equal(await page.evaluate(()=>__close.state.inventory.length),111);
 assert.ok(await page.evaluate(()=>__close.searchLocal('ácido nítrico').length));assert.ok(await page.evaluate(()=>__close.documentSearch('formulación').length));
 assert.equal(await page.evaluate(()=>__close.state.docs.some(d=>d.path.startsWith('Archivos/'))),true);
 report.results.push('controlled offline reload: 111 / 6 and inventory/document search');
 await context.setOffline(false);await page.locator('#webToggle').click();await page.waitForFunction(()=>__close.health.xkiro.status==='listo');assert.deepEqual(report.gatewayCalls.slice(-2),['/health','/models']);
 await context.setOffline(true);await page.waitForFunction(()=>__close.health.xkiro.status==='offline');await context.setOffline(false);await page.waitForFunction(()=>__close.health.xkiro.status==='listo');
 report.results.push('Internet ON automatic gateway and online reconnection (mock endpoints)');
 failed=true;await page.evaluate(()=>__close.setInternetMode(true,{force:true,silent:true}));assert.equal(await page.evaluate(()=>__close.health.xkiro.status),'error');assert.equal(await page.evaluate(()=>__close.state.inventory.length),111);
 await page.locator('#webToggle').click();const calls=report.gatewayCalls.length;await context.setOffline(true);await context.setOffline(false);assert.equal(report.gatewayCalls.length,calls);
 report.results.push('gateway failure preserves local, OFF prevents reconnection');
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
