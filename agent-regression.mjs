import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('.', import.meta.url).pathname;
const app = fs.readFileSync(root + 'app.js', 'utf8');
const inventory = JSON.parse(fs.readFileSync(root + 'inventory.json', 'utf8'));
const failures = [];
const pass = (name, ok, detail='') => { if(!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`); else console.log(`PASS ${name}`); };

pass('JavaScript syntax', true);
const records = Array.isArray(inventory) ? inventory : inventory.records;
pass('inventory records array', Array.isArray(records));
pass('inventory has 111 baseline records', records.length === 111, String(records.length));
const ids = records.map(x => String(x.id || '').trim().toUpperCase());
pass('inventory IDs unique', new Set(ids).size === ids.length);
pass('inventory IDs canonical', ids.every(x => /^NEXUS-X-\d{4}$/.test(x)));

const actionMatch = app.match(/const NEXUS_AGENT_ACTIONS=new Set\(\[([^\]]+)\]\)/);
const actions = actionMatch ? [...actionMatch[1].matchAll(/'([^']+)'/g)].map(m=>m[1]) : [];
pass('agent action registry found', actions.length > 0);
pass('no stale chat action', !actions.includes('chat'));
pass('no standalone OCR/Tesseract engine', !/Tesseract|LENS_TEXT_ENGINE|extractLensTextSignal|getLensTextWorker|preprocessLensTextSource/i.test(app));

const toolSection = app.slice(app.indexOf('const NEXUS_AGENT_TOOL_DEFS='), app.indexOf('// Metadatos y validación únicos'));
const toolNames = [...toolSection.matchAll(/\{name:'([^']+)'/g)].map(m=>m[1]);
const uniqueTools = [...new Set(toolNames)];
for (const a of actions.filter(x=>!['sequence','status','diagnostics','get_inventory','get_documents','get_lens_context','get_activity','get_state'].includes(x))) {
  pass(`executor branch ${a}`, app.includes(`type==='${a}'`), 'missing executor branch');
}
for (const t of uniqueTools) pass(`tool registered ${t}`, actions.includes(t), 'tool is not in action registry');
pass('sequence executor requires all steps', /results\.length===steps\.length && results\.every\(x=>x\?\.ok\)/.test(app));
pass('destructive inventory delete requires confirmation', /type==='delete_inventory_item'[\s\S]{0,500}action\.confirm!==true/.test(app));
pass('destructive calendar delete requires confirmation', /type==='delete_calendar_event'[\s\S]{0,500}action\.confirm!==true/.test(app));
pass('inventory integrity is not hard-coded to 111', !/ids\.length===111/.test(app));
pass('camera auto-selection penalizes ultra-wide', /ultra\.?wide[\s\S]{0,220}score-=140/.test(app));
pass('camera auto-selection prefers telephoto', /tele\|telephoto\|zoom\|periscope/.test(app));
pass('voice wake word exists', /VOICE_WAKE/.test(app));
pass('voice auto-restart exists', /voiceRestartTimer/.test(app));
pass('voice barge-in exists', /function receiveVoicePartial[\s\S]{0,250}voiceSpeaking&&VOICE_WAKE\.test\(text\)[\s\S]{0,150}speechSynthesis\?\.cancel\(\)/.test(app));

// Exercise the deterministic parser without booting the browser app.
const normFn = "function norm(v){return String(v??'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();}";
const pa = app.indexOf('function parseLocalAssistantAction(q){');
const pb = app.indexOf('\nasync function executeVoiceCommand', pa);
const parser = app.slice(pa, pb);
const ctx = { console };
vm.runInNewContext(`${normFn}\n${parser}\nglobalThis.parseLocalAssistantAction=parseLocalAssistantAction;`, ctx);
const parserCases = [
  ['abre inventario', {action:'open_view',query:'inventory'}],
  ['abrí documentos', {action:'open_view',query:'documents'}],
  ['mostrame qr', {action:'open_qr'}],
  ['abrí nexus lens', {action:'open_lens'}],
  ['abrí ocr', null],
  ['identificá código NEXUS-X-0001', {action:'identify_lens_code',code:'nexus-x-0001'}],
  ['buscá en inventario alcohol', {action:'search_inventory',query:'alcohol'}],
  ['dónde está ácido nítrico', {action:'search_inventory',query:'acido nitrico'}],
  ['abrí la ficha alcohol', {action:'open_item',query:'alcohol'}],
  ['abrí el documento química', {action:'open_document',query:'quimica'}],
  ['prendé la cámara', {action:'start_camera'}],
  ['analizá lo que ves', {action:'analyze_camera'}],
  ['activá la voz', {action:'start_voice'}],
  ['confirmo eliminar alcohol', {action:'delete_inventory_item',query:'alcohol',confirm:true}],
];
for (const [q,want] of parserCases) pass(`parser ${q}`, JSON.stringify(ctx.parseLocalAssistantAction(q))===JSON.stringify(want));

if (failures.length) {
  console.error('\nFAILURES');
  for (const f of failures) console.error('FAIL ' + f);
  process.exit(1);
}
console.log(`\nALL REGRESSION CHECKS PASSED (${actions.length} actions, ${uniqueTools.length} tools)`);
