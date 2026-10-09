import test from 'node:test';
import assert from 'node:assert/strict';
import {EdgeLens,lensDecision,decodeExactQr,captureLensCanvas,readLabelRegion} from './next/lens-edge.js';
import {EdgeVoiceCoordinator,parseWakeWord} from './next/voice-edge.js';
import {JSDOM} from 'jsdom';

const records=[{id:'NEXUS-X-0001',name:'Ácido nítrico',formula:'HNO3'}];
const glass={id:'erlenmeyer',label:'Matraz Erlenmeyer',similarity:.43,reject:false,group:'Vidrio'};
const bottle={id:'reagent-bottle',label:'Frasco de reactivo',chemicalContainer:true,similarity:.55,reject:false};

test('Lens MobileCLIP acepta solo clase de objeto: jamás formula o sustancia desde píxeles',()=>{
 const v=lensDecision({inventory:records,vision:{accepted:true,candidates:[glass],model:'MobileCLIP-S0',
  multiView:{views:2,agreement:true},references:[{recordId:'NEXUS-X-0001',label:'sugerencia',similarity:.92}]}});
 assert.equal(v.status,'visual-class');assert.equal(v.visualClass.label,'Matraz Erlenmeyer');
 assert.equal(v.identity,null);assert.equal(v.evidenceLevel,'visual-category-only');
 assert.equal(v.referenceSuggestions.length,1);
 assert.equal('embedding' in v,false);
});
test('Lens frasco de reactivo NO permite inferir su contenido',()=>{
 const v=lensDecision({inventory:records,vision:{accepted:true,candidates:[bottle]}});
 assert.equal(v.status,'visual-class');assert.equal(v.visualClass.chemicalContainer,true);
 assert.equal(v.identity,null);assert.match(v.disclaimer,/no identifica compuestos/i);
});
test('Lens rechaza negativos y desacuerdos entre las dos vistas',()=>{
 const rejected=lensDecision({vision:{accepted:false,candidates:[{id:'nail-polish',reject:true,similarity:.69}],rejectionReason:'out-of-domain'}});
 assert.equal(rejected.status,'unknown');assert.equal(rejected.identity,null);
 const disagree=lensDecision({vision:{accepted:true,candidates:[glass],multiView:{views:2,agreement:false}}});
 assert.equal(disagree.status,'unknown');assert.equal(disagree.visualClass,null);
});
test('Lens identidad se confirma exclusivamente si QR exacto coincide con inventario',()=>{
 const yes=lensDecision({code:'NEXUS-X-0001',inventory:records,vision:{accepted:false}});
 assert.equal(yes.status,'confirmed-qr');assert.equal(yes.identity.formula,'HNO3');
 const nonexistent=lensDecision({code:'NEXUS-X-9999',inventory:records,vision:{accepted:true,candidates:[bottle]}});
 assert.equal(nonexistent.identity,null);
 const malformed=lensDecision({code:'NEXUS-X-0001 otro',inventory:records});
 assert.equal(malformed.identity,null);
});
test('QR local intenta BarcodeDetector y solo acepta códigos exactos NEXUS',async()=>{
 const canvas={width:300,height:300};
 const reader=class{async detect(){return [{rawValue:'NEXUS-X-0001'}]}};
 assert.equal(await decodeExactQr(canvas,{BarcodeDetectorConstructor:reader}), 'NEXUS-X-0001');
 const spoof=class{async detect(){return [{rawValue:'producto comercial'}]}};
 assert.equal(await decodeExactQr(canvas,{BarcodeDetectorConstructor:spoof}),null);
});
test('Lens utiliza el motor MobileCLIP ya existente y libera pixeles al finalizar',async()=>{
 const dom=new JSDOM('<div></div>');const original=dom.window.document.createElement.bind(dom.window.document);
 let released=false;
 dom.window.document.createElement=tag=>{
  const element=original(tag);
  if(tag==='canvas'){
   element.getContext=()=>({drawImage(){}});
   Object.defineProperty(element,'width',{get:()=>released?1:256,set:value=>{if(value===1)released=true},configurable:true});
   Object.defineProperty(element,'height',{get:()=>released?1:256,set:value=>{if(value===1)released=true},configurable:true});
  }
  return element;
 };
 let analyzed=0,freed=0;
 const engine={
  analyze:async()=>{analyzed++;return {accepted:true,candidates:[glass],model:'MobileCLIP-S0'}},
  releaseVision:()=>freed++
 };
 const lens=new EdgeLens({engine,inventory:records,decode:async()=>null,documentObject:dom.window.document});
 try{
  const output=await lens.analyze({width:300,height:250},{skipQR:true});
  assert.equal(output.visualClass.id,'erlenmeyer');
  assert.equal(analyzed,1);assert.equal(released,true);
  lens.close();assert.equal(freed,1);
 }finally{dom.window.close()}
});
test('Lens prepare uses offline model cache and does not download after READY',async()=>{
 let downloads=0,prepares=0;
 const engine={cacheStatus:async()=>({ready:true}),prepare:async()=>downloads++,prepareVision:async()=>{prepares++;return {backend:'WASM'}}};
 const lens=new EdgeLens({engine});
 assert.equal((await lens.prepare()).backend,'WASM');
 assert.equal(downloads,0);assert.equal(prepares,1);
});
test('Parser wake word accents and unrelated narration',()=>{
 assert.deepEqual(parseWakeWord('Nexus, abrí inventario'),{wake:true,command:'abri inventario'});
 assert.equal(parseWakeWord('nexos, buscá ácido nítrico').wake,true);
 assert.equal(parseWakeWord('Estoy leyendo un texto').wake,false);
});
function speechHarness(){
 let callbacks=null,starts=[],stops=0,cancel=0,spoken=[],now=10000;
 const engine={createVoice:o=>{callbacks=o;return {start:async opts=>starts.push(opts),stop:()=>stops++}},
  cacheStatus:async()=>({ready:true}),prepare:async()=>{throw Error('No should prepare')},
  prepareVoice:async()=>({ready:true})};
 const agent={turn:async text=>({ok:true,reply:'Encontré resultados',input:text,inventory:[]})};
 const results=[];
 class Utterance{constructor(text){this.text=text}}
 const synth={getVoices:()=>[{lang:'es-AR',localService:true,name:'local AR'}],speak:u=>spoken.push(u),cancel:()=>cancel++};
 const voice=new EdgeVoiceCoordinator({engine,agent,onResult:v=>results.push(v),speechSynthesis:synth,Utterance,now:()=>now});
 return {voice,get callbacks(){return callbacks},starts,get stops(){return stops},get cancel(){return cancel},spoken,results,setTime:t=>now=t};
}
test('Vosk offline is forced on both Internet ON/OFF, and wake is mandatory',async()=>{
 const h=speechHarness();await h.voice.start();
 assert.deepEqual(h.starts,[{forceWasm:true}]);
 const ignored=await h.voice.feedTranscript('abrí inventario');
 assert.equal(ignored.ignored,'wake-required');
 const result=await h.voice.feedTranscript('Nexus, abrí inventario');
 assert.equal(result.input,'abri inventario');
 assert.equal(h.results.length,1);assert.equal(h.spoken.length,1);
 h.voice.stop();assert.equal(h.stops,1);
});
test('Partial Nexus arms second turn, can interrupt local TTS and suppress echo',async()=>{
 const h=speechHarness();await h.voice.start();
 await h.voice.feedTranscript('Nexus, abrí inventario');
 const before=h.cancel;
 h.voice.feedPartial('Nexus');
 assert.equal(h.cancel,before+1);
 const echoed=await h.voice.feedTranscript('Encontré resultados');
 assert.equal(echoed.ignored,'tts-echo');
 const follow=await h.voice.feedTranscript('buscá probeta');
 assert.equal(follow.input,'busca probeta');
 h.voice.stop();
});
test('Expired wake window refuses accidental commands, stop rejects queued results',async()=>{
 const h=speechHarness();await h.voice.start();h.voice.feedPartial('Nexus');
 h.setTime(20000);
 const ignored=await h.voice.feedTranscript('borra todo');
 assert.equal(ignored.ignored,'wake-required');
 h.voice.stop();
 assert.equal((await h.voice.feedTranscript('Nexus abrí inventario')).ignored,'stale');
});
test('Speech output only selects a local Spanish voice, never a cloud TTS',async()=>{
 const h=speechHarness();await h.voice.start();
 h.voice.synth.getVoices=()=>[{lang:'es-AR',localService:false,name:'remota'}];
 assert.equal(h.voice.speak('Test'),false);
 assert.equal(h.spoken.length,0);
 h.voice.stop();
});

test('OCR dirigido observa solo región seleccionada, nunca certifica identidad química',async()=>{
 let seen=null;
 const image={width:600,height:400,ownerDocument:{createElement:()=>{
  const cropped={width:0,height:0,getContext:()=>({drawImage(){}})};
  return cropped;
 }}};
 const engine={recognizeText:async target=>{
  seen={width:target.width,height:target.height};
  return {lines:[{text:'ÁCIDO NÍTRICO',confidence:.92},{text:'HNO3',confidence:.8}]};
 }};
 const result=await readLabelRegion(image,engine,{x:.25,y:.25,width:.5,height:.5});
 assert.deepEqual(seen,{width:300,height:200});
 assert.equal(result.verifiedChemicalIdentity,false);
 assert.equal(result.lines[0].text,'ÁCIDO NÍTRICO');
 assert.match(result.limitation,/No demuestra sustancia/i);
 await assert.rejects(readLabelRegion(image,engine,{x:.9,y:.9,width:.5,height:.5}),/fuera de la captura/);
});
