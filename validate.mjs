import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(new URL('.',import.meta.url).pathname);
const required=['index.html','app.js','manifest.webmanifest','sw.js','inventory.json','catalogo_maestro.json','icon.svg'];
const errors=[];

for(const f of required){
  if(!fs.existsSync(path.join(root,f)))errors.push('Falta '+f);
}

let data=null;
try{data=JSON.parse(fs.readFileSync(path.join(root,'inventory.json'),'utf8'));}
catch(e){errors.push('inventory.json inválido: '+e.message)}

if(data){
  const records=Array.isArray(data.records)?data.records:[];
  const ids=records.map(x=>x?.id);
  if(data.recordCount!==records.length)errors.push(`recordCount (${data.recordCount}) != records (${records.length})`);
  if(records.length!==111)errors.push(`Se esperaban 111 registros y hay ${records.length}`);
  if(new Set(ids).size!==ids.length)errors.push('IDs duplicados');
  if(ids.length && ids[0]!=='NEXUS-X-0001')errors.push('ID inicial incorrecto');
  if(ids.length && ids.at(-1)!=='NEXUS-X-0111')errors.push('ID final incorrecto');
  if(ids.some(x=>!/^(NEXUS-X-\d{4})$/.test(String(x))))errors.push('Hay IDs con formato inválido');
  if(records.some(x=>!String(x?.name||'').trim()))errors.push('Hay registros sin nombre');
}

const js=fs.readFileSync(path.join(root,'app.js'),'utf8');
try{new vm.Script(js);}catch(e){errors.push('JavaScript inválido: '+e.message)}

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const idMatches=[...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
const seen=new Set();
for(const id of idMatches){if(seen.has(id))errors.push('ID HTML duplicado: '+id);seen.add(id)}

// Verifica selectores estáticos usados por $('#id') y evita falsos positivos de selectores dinámicos.
const domRefs=[
  ...js.matchAll(/\$\(['"]#([^'"\$]+)['"]\)/g),
  ...js.matchAll(/\$\$\(['"]#([^'"\$]+)['"]\)/g)
].map(m=>m[1]);
for(const id of new Set(domRefs))if(!seen.has(id) && !['qrOpenResult','lensOpenResult'].includes(id))errors.push('Referencia DOM inexistente: '+id);

for(const fn of ['loadMaster','importExcel','importWord','startQr','processQr','runResearch','runIntegrity']){
  if(!new RegExp(`function\\s+${fn}\\s*\\(`).test(js)&&!js.includes(`async function ${fn}(`))errors.push('Función crítica ausente: '+fn);
}

if(/function\s+geminiGenerate\s*\([^)]*\bdocument\s*=/.test(js))errors.push('geminiGenerate vuelve a sombrear document global');
if(/\basync\s+const\b/.test(js))errors.push('Declaración async const inválida detectada');
if(/Tesseract|LENS_TEXT_ENGINE|extractLensTextSignal|getLensTextWorker|preprocessLensTextSource/i.test(js))errors.push('NEXUS LENS volvió a incluir un motor OCR/Tesseract separado');
if(/\bOCR\b/i.test(html))errors.push('La interfaz volvió a exponer OCR como módulo o concepto visible');

for(const ref of ['app.js','manifest.webmanifest'])if(!html.includes(ref))errors.push('Referencia ausente: '+ref);

try{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
  if(!manifest.name||!manifest.start_url||!manifest.display)errors.push('manifest.webmanifest incompleto');
}catch(e){errors.push('manifest.webmanifest inválido: '+e.message)}

console.log(JSON.stringify({
  ok:errors.length===0,
  root,
  records:data?.records?.length??0,
  uniqueIds:data?.records?new Set(data.records.map(x=>x.id)).size:0,
  first:data?.records?.[0]?.id??null,
  last:data?.records?.at(-1)?.id??null,
  htmlIds:idMatches.length,
  errors
},null,2));
process.exitCode=errors.length?1:0;
