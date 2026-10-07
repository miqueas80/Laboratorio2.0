#!/usr/bin/env python3
from __future__ import annotations
from pathlib import Path
import subprocess, sys, re

BASE_SHA = "b18f1d53a8c1d0132d5292ebe11a56a127d824fd"
TARGET_BRANCH = "voice-r31-conversation"
APP_VERSION_OLD = "2026.10.07-r30-lens-final"
APP_VERSION_NEW = "2026.10.07-r31-voice-conversation"

ROOT = Path.cwd()
FILES = [
    ROOT / "app.js",
    ROOT / "offline" / "core.js",
    ROOT / "sw.js",
    ROOT / "harness.mjs",
]
NEW_TEST = ROOT / "voice-r31.test.mjs"

def run(*args, check=True, capture=False):
    kwargs = {"cwd": ROOT, "text": True}
    if capture:
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE
    p = subprocess.run(args, **kwargs)
    if check and p.returncode:
        if capture:
            print(p.stdout, end="")
            print(p.stderr, end="", file=sys.stderr)
        raise RuntimeError(f"Falló: {' '.join(args)}")
    return p

def git(*args):
    return run("git", *args, capture=True).stdout.strip()

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: esperaba exactamente 1 coincidencia y encontré {count}. No se aplicó el parche.")
    return text.replace(old, new, 1)

def regex_replace_once(text, pattern, replacement, label, flags=0):
    out, count = re.subn(pattern, lambda _m: replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: esperaba exactamente 1 coincidencia y encontré {count}. No se aplicó el parche.")
    return out

def ensure_repo():
    if not (ROOT / ".git").exists():
        raise RuntimeError("Ejecutá este archivo desde la raíz del repositorio Laboratorio2.0.")
    for f in FILES:
        if not f.exists():
            raise RuntimeError(f"Falta {f.relative_to(ROOT)}.")
    if NEW_TEST.exists():
        raise RuntimeError("voice-r31.test.mjs ya existe. Este parche parece haber sido aplicado.")
    status = git("status", "--porcelain")
    if status:
        raise RuntimeError("El repositorio tiene cambios sin guardar. Commit/stash antes de aplicar r31.\n" + status)
    try:
        run("git", "merge-base", "--is-ancestor", BASE_SHA, "HEAD", check=True, capture=True)
    except Exception:
        raise RuntimeError(f"HEAD no deriva del main r30 esperado ({BASE_SHA[:12]}). No se modifica nada.")
    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if branch == "main":
        existing = run("git", "show-ref", "--verify", "--quiet", f"refs/heads/{TARGET_BRANCH}", check=False)
        if existing.returncode == 0:
            raise RuntimeError(f"La rama {TARGET_BRANCH} ya existe. Revisala o eliminála antes de reintentar.")
        run("git", "switch", "-c", TARGET_BRANCH)
        branch = TARGET_BRANCH
    print(f"Rama de trabajo: {branch}")

CALENDAR_HELPERS = r'''
const NEXUS_CALENDAR_MONTHS=Object.freeze({enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,setiembre:8,octubre:9,noviembre:10,diciembre:11});
const NEXUS_CALENDAR_WEEKDAYS=Object.freeze({domingo:0,lunes:1,martes:2,miercoles:3,jueves:4,viernes:5,sabado:6});
function calendarLocalNoon(value=new Date()){return new Date(value.getFullYear(),value.getMonth(),value.getDate(),12,0,0,0)}
function calendarAddDays(value,days){const d=calendarLocalNoon(value);d.setDate(d.getDate()+days);return d}
function calendarDateFromParts(year,month,day){
 const d=new Date(year,month,day,12,0,0,0);
 return d.getFullYear()===year&&d.getMonth()===month&&d.getDate()===day?d:null;
}
function resolveNaturalCalendarDate(input,now=new Date()){
 const n=norm(input).replace(/[¿?¡!,;]+/g,' ').replace(/\s+/g,' ').trim(),today=calendarLocalNoon(now);
 let m=n.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
 if(m){const d=calendarDateFromParts(Number(m[1]),Number(m[2])-1,Number(m[3]));return d?isoDate(d):null}
 if(/\bpasado\s+manana\b/.test(n))return isoDate(calendarAddDays(today,2));
 if(/\bmanana\b/.test(n))return isoDate(calendarAddDays(today,1));
 if(/\bhoy\b/.test(n))return isoDate(today);
 m=n.match(/\b(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/);
 if(m){
  let year=m[3]?Number(m[3]):today.getFullYear();if(year<100)year+=2000;
  let d=calendarDateFromParts(year,Number(m[2])-1,Number(m[1]));
  if(d&&!m[3]&&d<today)d=calendarDateFromParts(year+1,Number(m[2])-1,Number(m[1]));
  return d?isoDate(d):null;
 }
 m=n.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?\b/);
 if(m){
  let year=m[3]?Number(m[3]):today.getFullYear(),month=NEXUS_CALENDAR_MONTHS[m[2]],d=calendarDateFromParts(year,month,Number(m[1]));
  if(d&&!m[3]&&d<today)d=calendarDateFromParts(year+1,month,Number(m[1]));
  return d?isoDate(d):null;
 }
 m=n.match(/\b(?:(proximo|proxima)\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
 if(m){
  const target=NEXUS_CALENDAR_WEEKDAYS[m[2]];let delta=(target-today.getDay()+7)%7;
  if(m[1]&&delta===0)delta=7;
  return isoDate(calendarAddDays(today,delta));
 }
 return null;
}
function removeNaturalCalendarDateText(input){
 let s=norm(input).replace(/[¿?¡!,;]+/g,' ').replace(/\s+/g,' ').trim();
 const patterns=[
  /\bpasado\s+manana\b/g,/\bmanana\b/g,/\bhoy\b/g,
  /\b\d{4}-\d{1,2}-\d{1,2}\b/g,/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g,
  /\b\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?\b/g,
  /\b(?:(?:proximo|proxima)\s+)?(?:domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/g
 ];
 for(const pattern of patterns)s=s.replace(pattern,' ');
 return s.replace(/\s+/g,' ').trim();
}
function cleanCalendarTaskText(input){
 let s=removeNaturalCalendarDateText(input)
  .replace(/^(?:para|el|la|de|del|a)\s+/,'')
  .replace(/^(?:un|una)\s+/,'')
  .replace(/^(?:la\s+|el\s+)?(?:tarea|evento|recordatorio)\s*(?:de\s+)?/,'')
  .replace(/^(?:para|el|la|de|del|a)\s+/,'')
  .replace(/\s+(?:para|el|la|de|del|a)\s*$/,'')
  .replace(/\s+/g,' ').trim();
 return s;
}
function extractCalendarDraft(input,now=new Date()){
 let n=norm(input).replace(/[¿?¡!.,;:]+/g,' ').replace(/\s+/g,' ').trim()
  .replace(/^(?:por favor|porfa|porfavor)\s+/,'')
  .replace(/^(?:nexus(?:[- ]?x)?|nexo|nexos)\s+/,'').trim();
 let m=n.match(/^(agendame|agenda|agendar|recordame|recuerdame|programame|programa|programar)\b\s*(.*)$/);
 if(!m){
  m=n.match(/^(agrega|agregar|anade|anadir|crea|crear|anota|anotar)\s+(?:(?:un|una)\s+)?(tarea|evento|recordatorio)\b\s*(.*)$/);
  if(!m)return null;
  n=m[3]||'';
 }else n=m[2]||'';
 n=n.replace(/^(?:(?:un|una)\s+)?(?:tarea|evento|recordatorio)\b\s*/,'').trim();
 const date=resolveNaturalCalendarDate(n,now);
 const text=cleanCalendarTaskText(n);
 return {kind:'calendar-create',date:date||'',text};
}
function calendarDateLabel(date){
 if(!isValidCalendarDate(date))return String(date||'');
 return new Intl.DateTimeFormat('es-AR',{weekday:'long',day:'numeric',month:'long'}).format(new Date(date+'T12:00:00'));
}
function clearVoicePendingIntent({keepAwaiting=false}={}){
 clearTimeout(voicePendingTimer);voicePendingTimer=null;voicePendingIntent=null;
 if(!keepAwaiting)voiceAwaitingCommand=false;
}
function voicePendingPrompt(pending=voicePendingIntent){
 if(!pending?.text)return 'Claro. ¿Qué tarea querés agregar?';
 if(!pending?.date)return `Perfecto. ¿Para qué día querés agendar ${pending.text}?`;
 return '';
}
function setVoicePendingIntent(draft){
 clearTimeout(voicePendingTimer);
 voicePendingIntent={kind:'calendar-create',text:String(draft?.text||'').trim(),date:String(draft?.date||''),expiresAt:Date.now()+25000};
 voiceAwaitingCommand=true;
 voicePendingTimer=setTimeout(()=>{voicePendingIntent=null;voicePendingTimer=null;voiceAwaitingCommand=false;if(voiceMonitoring&&!voiceSpeaking)$('#voiceStatusText').textContent='Dormido · esperando “Nexus”';},25000);
 return voicePendingIntent;
}
async function handleVoicePendingTurn(input){
 if(!voicePendingIntent)return false;
 const raw=String(input||'').trim(),n=norm(raw).replace(/[¿?¡!.,;:]+/g,' ').replace(/\s+/g,' ').trim();
 if(/^(?:cancela|cancelar|cancela eso|olvidalo|olvida|dejalo|deja eso|no importa)$/.test(n)){
  clearVoicePendingIntent();speakText('De acuerdo. Cancelé la tarea pendiente.');return true;
 }
 const pending={...voicePendingIntent},date=resolveNaturalCalendarDate(raw);
 if(!pending.date&&date)pending.date=date;
 if(!pending.text){
  const text=cleanCalendarTaskText(raw);
  if(text&&!/^(?:hoy|manana|pasado manana|domingo|lunes|martes|miercoles|jueves|viernes|sabado)$/.test(text))pending.text=text;
 }
 if(!pending.text||!pending.date){
  setVoicePendingIntent(pending);speakText(voicePendingPrompt(pending));return true;
 }
 clearVoicePendingIntent();
 const action={action:'create_calendar_event',date:pending.date,text:pending.text};
 const result=await executeAssistantAction(action,{speak:false,origin:'voice'});
 const answer=fastAgentAnswer(action,result);
 state.agentHistory.push({role:'user',text:raw},{role:'assistant',text:'LOCAL · '+answer});state.agentHistory=state.agentHistory.slice(-12);
 speakText(answer);return true;
}
'''

FAST_ANSWER = r'''function fastAgentAnswer(action,result){
  if(!result)return 'No se recibió un resultado de la operación.';
  if(!result.ok)return result.error||'No pude completar la orden.';
  if(['status','diagnostics'].includes(action.action))return `El sistema está ${result.data.integrity.ok?'correcto':'para revisar'}. Hay ${result.data.integrity.recordCount} registros y ${state.docs.length} documentos locales.`;
  if(action.action==='search_inventory'){
   const rows=result.data?.results||[];if(!rows.length)return 'No encontré coincidencias en el inventario local.';
   const top=rows[0];let answer=`Encontré ${rows.length} coincidencia${rows.length===1?'':'s'}. La mejor es ${top.name}`;
   if(top.formula)answer+=`, fórmula ${top.formula}`;if(top.location)answer+=`, ubicada en ${top.location}`;return answer+'.';
  }
  if(action.action==='search_documents'){
   const rows=result.data?.results||[];if(!rows.length)return 'No encontré documentos relacionados en el índice local.';
   return `Encontré ${rows.length} documento${rows.length===1?'':'s'} relacionado${rows.length===1?'':'s'}. ${rows.slice(0,3).map(r=>r.name).join(', ')}.`;
  }
  if(action.action==='open_item')return result.data?.name?`Listo. Abrí la ficha de ${result.data.name}.`:'Listo. Abrí la ficha solicitada.';
  if(action.action==='open_document')return result.data?.name?`Listo. Abrí ${result.data.name}.`:'Listo. Abrí el documento solicitado.';
  if(action.action==='open_calendar')return 'Abrí tu calendario.';
  if(action.action==='create_calendar_event'){
   const row=result.result||action;return `Listo. Agendé ${row.text} para ${calendarDateLabel(row.date)}.`;
  }
  if(action.action==='delete_calendar_event')return 'Listo. Eliminé el evento del calendario.';
  if(action.action==='research')return 'Listo. Inicié la investigación local.';
  if(action.action==='open_qr')return 'Abrí el escáner QR.';
  if(action.action==='open_lens')return 'NEXUS Lens está listo.';
  if(action.action==='start_lens_camera')return result.ok?'Cámara de NEXUS Lens iniciada.':'No pude iniciar la cámara de NEXUS Lens.';
  if(action.action==='stop_lens_camera')return 'Cámara de NEXUS Lens detenida.';
  if(action.action==='start_camera')return result.ok?'Cámara iniciada.':'No pude iniciar la cámara.';
  if(action.action==='stop_camera')return 'Cámara detenida.';
  if(action.action==='toggle_web')return result.result?'Internet activado.':'Internet desactivado.';
  if(action.action==='export_inventory')return 'Listo. Exporté el inventario.';
  if(action.action==='export_report')return 'Listo. Exporté el informe.';
  if(action.action==='open_view'){
   const names={dashboard:'inicio',inventory:'inventario',research:'investigación',ai:'NEXUS IA',documents:'documentos',reports:'informes',settings:'ajustes'};
   return `Listo. Abrí ${names[action.view||action.query]||'el módulo solicitado'}.`;
  }
  if(action.action==='sequence')return result.ok?'Listo. Ejecuté toda la secuencia.':'No pude completar toda la secuencia.';
  return result.ok?'Listo.':'No pude completar la orden.';
}'''

TTS_BLOCK = r'''function spanishVoiceScore(voice){
 const lang=String(voice?.lang||'').toLowerCase();let score=0;
 if(lang==='es-ar')score=300;else if(lang==='es-es')score=230;else if(lang.startsWith('es-'))score=180;else if(lang==='es')score=160;else return -1;
 if(voice?.localService)score+=25;
 return score;
}
function selectSpanishVoice(voices,{allowRemote=false}={}){
 return (voices||[]).filter(v=>spanishVoiceScore(v)>=0&&(allowRemote||v.localService)).sort((a,b)=>spanishVoiceScore(b)-spanishVoiceScore(a))[0]||null;
}
function selectLocalSpanishVoice(voices){return selectSpanishVoice(voices,{allowRemote:false})}
function speechTextForTTS(text){
 let s=String(text??'')
  .replace(/(?:^|\n)\s*(?:LOCAL|EXTERNA(?: NO DISPONIBLE)?)\s*·\s*/g,' ')
  .replace(/\n\s*(?:Fuentes:|Sin fuentes web verificables).*$/is,'')
  .replace(/https?:\/\/\S+/gi,' ')
  .replace(/[*_`#]/g,' ')
  .replace(/\s+/g,' ').trim();
 if(s.length>650){const cut=s.slice(0,650),stop=Math.max(cut.lastIndexOf('. '),cut.lastIndexOf('? '),cut.lastIndexOf('! '));s=(stop>180?cut.slice(0,stop+1):cut.trimEnd()+'…');}
 return s;
}
function speakText(text,{forceLocal=false}={}){
 if(!globalThis.speechSynthesis)return false;
 const synth=globalThis.speechSynthesis,voices=synth.getVoices(),online=navigator.onLine!==false&&!forceLocal;
 const voice=selectSpanishVoice(voices,{allowRemote:online}),localFallback=selectLocalSpanishVoice(voices);
 if(!voice&&!online){
  if(globalThis.NexusOffline)globalThis.NexusOffline.diagnostics.voice.tts='Sin voz española local instalada';
  $('#voiceStatusText').textContent='Salida de voz pendiente: instalá una voz española offline en Android y tocá Probar voz.';return false;
 }
 const spoken=speechTextForTTS(text);if(!spoken)return false;
 const token=++voiceUtteranceId;synth.cancel();voiceSpeaking=true;
 voiceLastSpoken=spoken.replace(/\bnexus(?:[- ]?x)?\b/gi,'el sistema');
 const utterance=new SpeechSynthesisUtterance(voiceLastSpoken);if(voice)utterance.voice=voice;utterance.lang=voice?.lang||'es-AR';utterance.rate=.98;utterance.pitch=1;
 if(globalThis.NexusOffline)globalThis.NexusOffline.diagnostics.voice.tts={name:voice?.name||'voz predeterminada',language:utterance.lang,local:Boolean(voice?.localService),mode:online?'híbrida':'local'};
 const finish=()=>{if(token!==voiceUtteranceId)return;voiceSpeaking=false;if(voiceMonitoring){if(voicePendingIntent){voiceAwaitingCommand=true;$('#voiceStatusText').textContent='Te escucho · respuesta pendiente';}else $('#voiceStatusText').textContent='Dormido · esperando “Nexus”';}};
 utterance.onend=finish;
 utterance.onerror=()=>{if(token!==voiceUtteranceId)return;if(online&&!forceLocal&&localFallback&&voice!==localFallback){voiceSpeaking=false;speakText(spoken,{forceLocal:true});return}finish();};
 synth.speak(utterance);return true;
}'''

NEW_TEST_CONTENT = r'''import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {harness,master} from './harness.mjs';

function voiceEngine(h){
 let callbacks;
 h.window.NexusOffline={diagnostics:{voice:{}},nativeVoice:async()=>null,cacheStatus:async()=>({ready:true}),createVoice:options=>{callbacks=options;return {start:async()=>options.onStatus({state:'Fallback local activo'}),stop(){}};}};
 h.window.navigator.mediaDevices={getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})};
 return {get callbacks(){return callbacks}};
}
function localSpeech(h){
 let last=null,count=0;
 h.window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
 h.window.speechSynthesis={getVoices:()=>[{name:'local AR',lang:'es-AR',localService:true}],cancel(){},speak:u=>{last=u;count++;}};
 return {get last(){return last},get count(){return count}};
}

test('r31 voz: Vosk usa dictado libre y no la gramática cerrada',()=>{
 const source=fs.readFileSync(new URL('./offline/core.js',import.meta.url),'utf8');
 assert.match(source,/new model\.KaldiRecognizer\(context\.sampleRate\)/);
 assert.doesNotMatch(source,/new model\.KaldiRecognizer\(context\.sampleRate\s*,\s*grammar\(/);
});

test('r31 calendario: entiende fechas naturales de forma determinista',()=>{
 const h=harness({stored:master.records,online:false});try{
  const now=new Date(2026,9,7,12);
  assert.equal(h.api.resolveNaturalCalendarDate('mañana',now),'2026-10-08');
  assert.equal(h.api.resolveNaturalCalendarDate('pasado mañana',now),'2026-10-09');
  assert.equal(h.api.resolveNaturalCalendarDate('el viernes',now),'2026-10-09');
  assert.equal(h.api.resolveNaturalCalendarDate('9 de octubre',now),'2026-10-09');
  assert.equal(h.api.resolveNaturalCalendarDate('12/10',now),'2026-10-12');
  const draft=h.api.extractCalendarDraft('Nexus, agregá para mañana la tarea preparar reactivos',now);
  assert.equal(draft.date,'2026-10-08');assert.equal(draft.text,'preparar reactivos');
 }finally{h.close();}
});

test('r31 calendario: una orden natural completa llega al Action Registry',async()=>{
 const h=harness({stored:master.records,online:false});try{
  await h.api.loadMaster();
  const a=h.api.parseLocalAssistantAction('Nexus, agendá para 2026-10-09 preparar la expo');
  assert.equal(a.action,'create_calendar_event');assert.equal(a.date,'2026-10-09');assert.match(a.text,/preparar la expo/);
 }finally{h.close();}
});

test('r31 voz: conversación de calendario continúa sin repetir wake word',async()=>{
 const h=harness({stored:master.records,online:false});try{
  await h.api.loadMaster();const engine=voiceEngine(h),speech=localSpeech(h);await h.api.startVoiceRecognition();
  await engine.callbacks.onTranscript('Nexus agregá una tarea');assert.match(speech.last.text,/qué tarea/i);speech.last.onend?.();
  await engine.callbacks.onTranscript('preparar reactivos');assert.match(speech.last.text,/qué día|para qué día/i);speech.last.onend?.();
  await engine.callbacks.onTranscript('mañana');assert.equal(h.api.calendarEvents().length,1);assert.match(h.api.calendarEvents()[0].text,/preparar reactivos/i);assert.match(speech.last.text,/agend/i);
 }finally{h.api.stopVoiceRecognition();h.close();}
});

test('r31 voz: cada acción habla una sola vez y con respuesta natural',async()=>{
 const h=harness({stored:master.records,online:false});try{
  await h.api.loadMaster();const engine=voiceEngine(h),speech=localSpeech(h);await h.api.startVoiceRecognition();
  const before=speech.count;await engine.callbacks.onTranscript('Nexus abrí inventario');assert.equal(speech.count,before+1);assert.match(speech.last.text,/inventario/i);assert.doesNotMatch(speech.last.text,/LOCAL\s*·/i);
 }finally{h.api.stopVoiceRecognition();h.close();}
});

test('r31 TTS: offline no usa cloud; online puede usar español remoto',()=>{
 let h=harness({online:false});try{
  let said=null;h.window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};h.window.speechSynthesis={getVoices:()=>[{name:'cloud AR',lang:'es-AR',localService:false}],cancel(){},speak:u=>said=u};
  assert.equal(h.api.speakText('Listo'),false);assert.equal(said,null);
 }finally{h.close();}
 h=harness({online:true});try{
  let said=null;h.window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};h.window.speechSynthesis={getVoices:()=>[{name:'cloud AR',lang:'es-AR',localService:false}],cancel(){},speak:u=>said=u};
  assert.equal(h.api.speakText('LOCAL · Listo. Abrí el calendario.'),true);assert.equal(said.voice.localService,false);assert.doesNotMatch(said.text,/LOCAL\s*·/);
 }finally{h.close();}
});
'''

def patch_app(text: str) -> str:
    text = replace_once(text, f"const APP_VERSION='{APP_VERSION_OLD}';", f"const APP_VERSION='{APP_VERSION_NEW}';", "app.js APP_VERSION")
    old_state = "let voiceRecognition=null;let voiceListening=false;let voiceMonitoring=false;let voiceSpeaking=false;let voiceAwaitingCommand=false;let voiceWakeTimer=null;let voiceRestartTimer=null;let voiceCommandQueue=Promise.resolve();"
    new_state = "let voiceRecognition=null;let voiceListening=false;let voiceMonitoring=false;let voiceSpeaking=false;let voiceAwaitingCommand=false;let voiceWakeTimer=null;let voiceRestartTimer=null;let voicePendingIntent=null;let voicePendingTimer=null;let voiceCommandQueue=Promise.resolve();"
    text = replace_once(text, old_state, new_state, "app.js estado de voz")
    marker = "function localAssistantResponse(q){"
    if text.count(marker) != 1:
        raise RuntimeError("app.js: no encontré punto único para helpers de calendario/voz.")
    text = text.replace(marker, CALENDAR_HELPERS + "\n" + marker, 1)
    text = regex_replace_once(text, r"function fastAgentAnswer\(action,result\)\{.*?\n\}\nconst NEXUS_AGENT_ACTIONS=", FAST_ANSWER + "\nconst NEXUS_AGENT_ACTIONS=", "app.js fastAgentAnswer", flags=re.S)
    parse_start = """function parseLocalAssistantAction(q){
  const raw=String(q||'').trim();
  let n=norm(raw).replace(/[¿?¡!.,;:]+/g,' ').replace(/\\s+/g,' ').trim();
  if(!n)return null;
  // Las órdenes encadenadas se resuelven localmente cuando cada tramo es inequívoco."""
    parse_new = """function parseLocalAssistantAction(q){
  const raw=String(q||'').trim();
  let n=norm(raw).replace(/[¿?¡!.,;:]+/g,' ').replace(/\\s+/g,' ').trim();
  if(!n)return null;
  const calendarDraft=extractCalendarDraft(raw);
  if(calendarDraft?.date&&calendarDraft.text)return {action:'create_calendar_event',date:calendarDraft.date,text:calendarDraft.text};
  // Las órdenes encadenadas se resuelven localmente cuando cada tramo es inequívoco."""
    text = replace_once(text, parse_start, parse_new, "app.js parser calendario natural")
    old_exec = "async function executeVoiceCommand(q){const out=await nexusAgentTurn(q,{speak:true});return Boolean(out);}"
    new_exec = """async function executeVoiceCommand(q){
 const raw=String(q||'').trim();if(!raw)return false;
 if(voicePendingIntent&&await handleVoicePendingTurn(raw))return true;
 const draft=extractCalendarDraft(raw);
 if(draft&&(!draft.text||!draft.date)){const pending=setVoicePendingIntent(draft);speakText(voicePendingPrompt(pending));return true;}
 const out=await nexusAgentTurn(raw,{speak:true});return Boolean(out);
}"""
    text = replace_once(text, old_exec, new_exec, "app.js executeVoiceCommand")
    old_resolve_tail = """ if(planned)return {kind:'LOCAL',local:planned};
 if(/(?:que es|explica|explicame|como funciona|informacion externa)/.test(n))return {kind:'EXTERNO',externalQuery:q};
 return {kind:'LOCAL',local:null};"""
    new_resolve_tail = """ if(planned)return {kind:'LOCAL',local:planned};
 if(/(?:que es|explica|explicame|como funciona|informacion externa)/.test(n))return {kind:'EXTERNO',externalQuery:q};
 if(state.web&&navigator.onLine)return {kind:'EXTERNO',externalQuery:q};
 return {kind:'LOCAL',local:null};"""
    text = replace_once(text, old_resolve_tail, new_resolve_tail, "app.js conversación online")
    text = regex_replace_once(text, r"function selectLocalSpanishVoice\(voices\)\{.*?\n\}\nfunction initVoice\(\)\{", TTS_BLOCK + "\nfunction initVoice(){", "app.js TTS híbrido", flags=re.S)
    old_stop = """function stopVoiceRecognition({manual=true}={}){
  voiceMonitoring=false;voiceListening=false;voiceAwaitingCommand=false;voiceSpeaking=false;
  clearTimeout(voiceWakeTimer);clearTimeout(voiceRestartTimer);"""
    new_stop = """function stopVoiceRecognition({manual=true}={}){
  voiceMonitoring=false;voiceListening=false;voiceAwaitingCommand=false;voiceSpeaking=false;
  clearTimeout(voiceWakeTimer);clearTimeout(voiceRestartTimer);clearTimeout(voicePendingTimer);voicePendingTimer=null;voicePendingIntent=null;"""
    text = replace_once(text, old_stop, new_stop, "app.js stop voice pending")
    return text

def patch_core(text: str) -> str:
    return replace_once(text, "recognizer=new model.KaldiRecognizer(context.sampleRate,grammar(vocabulary));", "recognizer=new model.KaldiRecognizer(context.sampleRate);", "offline/core.js dictado libre Vosk")

def patch_sw(text: str) -> str:
    return replace_once(text, f"const VERSION='{APP_VERSION_OLD}';", f"const VERSION='{APP_VERSION_NEW}';", "sw.js VERSION")

def patch_harness(text: str) -> str:
    old = "'receiveVoiceTranscript','receiveVoicePartial','selectLocalSpanishVoice','speakText'"
    new = "'receiveVoiceTranscript','receiveVoicePartial','selectLocalSpanishVoice','selectSpanishVoice','speechTextForTTS','speakText','resolveNaturalCalendarDate','extractCalendarDraft','handleVoicePendingTurn'"
    return replace_once(text, old, new, "harness exports r31")

def main():
    ensure_repo()
    originals = {p: p.read_text(encoding="utf-8") for p in FILES}
    try:
        patched = {
            ROOT/"app.js": patch_app(originals[ROOT/"app.js"]),
            ROOT/"offline"/"core.js": patch_core(originals[ROOT/"offline"/"core.js"]),
            ROOT/"sw.js": patch_sw(originals[ROOT/"sw.js"]),
            ROOT/"harness.mjs": patch_harness(originals[ROOT/"harness.mjs"]),
        }
        for p,content in patched.items(): p.write_text(content,encoding="utf-8")
        NEW_TEST.write_text(NEW_TEST_CONTENT,encoding="utf-8")
        print("Aplicado NEXUS Voice r31. Ejecutando validación...")
        run("node","--check","app.js")
        run("node","--check","offline/core.js")
        run("node","--check","sw.js")
        run("git","diff","--check")
        run("npm","test")
        print("\nNEXUS VOICE r31 — PASS")
        print("Rama:", git("rev-parse","--abbrev-ref","HEAD"))
        print("Versión:", APP_VERSION_NEW)
        print("\nCambios listos SIN commit y SIN push.")
        print("Probá físicamente voz offline/online y recién después hacé commit.")
    except Exception as error:
        print("\nFALLÓ LA VALIDACIÓN:", error, file=sys.stderr)
        for p,content in originals.items(): p.write_text(content,encoding="utf-8")
        if NEW_TEST.exists(): NEW_TEST.unlink()
        print("Los archivos fueron restaurados al estado anterior.", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
