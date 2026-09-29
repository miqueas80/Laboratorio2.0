import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.dirname(new URL(import.meta.url).pathname);
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const inv=JSON.parse(fs.readFileSync(path.join(root,'inventory.json'),'utf8'));
const errors=[]; const pass=[];
const ok=(name,cond,detail='')=>{if(cond)pass.push(`PASS ${name}${detail?` — ${detail}`:''}`);else errors.push(`FAIL ${name}${detail?` — ${detail}`:''}`)};
try{new vm.Script(app,{filename:'app.js'});ok('app.js syntax',true)}catch(e){ok('app.js syntax',false,e.message)}
const ids=inv.records.map(x=>x.id); ok('inventory 111 baseline',ids.length===111,String(ids.length)); ok('inventory IDs unique',new Set(ids).size===ids.length); ok('inventory IDs canonical',ids.every(x=>/^NEXUS-X-\d{4}$/.test(x)));
ok('no legacy document.createElement bug',!app.includes('document.createElement('));
ok('DOM createElement shim present',app.includes('const DOM = globalThis.document')&&app.includes('DOM.createElement('));
ok('single central executor', (app.match(/async function executeAssistantAction\(/g)||[]).length===1);
ok('sequence all-steps semantics',app.includes('results.length===steps.length && results.every(x=>x?.ok)'));
ok('destructive inventory confirmation schema',/name:'delete_inventory_item'[\s\S]{0,500}confirm:\{type:'boolean'\}/.test(app));
ok('destructive calendar confirmation schema',/name:'delete_calendar_event'[\s\S]{0,500}confirm:\{type:'boolean'\}/.test(app));
ok('agent audit ring',app.includes('agentAudit')&&app.includes('state.agentAudit.slice(0,10)'));
ok('local chained commands',app.includes("n.split(/\\s+y\\s+/")&&app.includes("return {action:'sequence',steps:plans}"));
ok('calendar local command',app.includes("return {action:'open_calendar'}"));
ok('repository result propagated',app.includes("return {ok:failed.length===0")&&app.includes("const r=await syncRepository()"));
ok('NEXUS LENS local evidence gate',app.includes('runNexusLensPipeline')&&app.includes('buildNexusLensContext')&&app.includes("match:'exact-code'")&&app.includes('decodeLensCode'));
ok('NEXUS LENS without standalone OCR/Tesseract',!/Tesseract|LENS_TEXT_ENGINE|extractLensTextSignal|getLensTextWorker|preprocessLensTextSource/i.test(app)&&!/\bOCR\b/i.test(html));
ok('NEXUS LENS multimodal visual path',app.includes('getLensVisionProvider')&&app.includes('fuseLensVisualContext')&&app.includes('visibleText')&&app.includes('formulaCandidates'));
ok('camera avoids ultra-wide',app.includes('score-=140')&&app.includes('telephoto'));
ok('voice wake word',app.includes('const VOICE_WAKE=/\\bnexus'));
ok('voice auto restart',app.includes('voiceRestartTimer=setTimeout'));
ok('voice barge-in',app.includes('voiceSpeaking&&wake')&&app.includes('speechSynthesis?.cancel'));
ok('service worker core cache',fs.existsSync(path.join(root,'sw.js'))&&fs.readFileSync(path.join(root,'sw.js'),'utf8').includes("'./app.js'"));
ok('manifest present',fs.existsSync(path.join(root,'manifest.webmanifest')));
ok('no demo mode added',!app.includes('MODO EXPOSICIÓN')&&!html.includes('MODO EXPOSICIÓN'));
console.log(pass.join('\n'));
console.log(`\nFINAL AUDIT: ${pass.length} checks passed, ${errors.length} failed`);
if(errors.length){console.error(errors.join('\n'));process.exit(1)}
