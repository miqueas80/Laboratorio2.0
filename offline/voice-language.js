/* NEXUS-X Lenguaje Natural es-AR v4: determinista, local, sin modelo remoto.
 * No infiere GPIO ni ejecuta órdenes ambiguas o negadas.
 */
(function(root){
'use strict';
const SENSOR={temperatura:'temperature',grados:'temperature',humedad:'humidity',presion:'pressure',hectopascales:'pressure'};
const ON=/^(?:prende(?:me)?|prender|prendi|enciende(?:me|s)?|encende(?:me|s)?|encender|encendi|activa(?:me)?|activar|pone(?:me)? en marcha|poner en marcha)\b/;
const OFF=/^(?:apaga(?:me|s)?|apagar|apague|desactiva(?:me)?|desactivar|apagalo|apagalas)\b/;
const PLURAL=/\b(?:focos|leds|luces|lamparitas|lucecitas)\b/;
const MULTIPLE=/\b(?:todos|todas|ambos|ambas|los dos|las dos)\b/;
const LED_AFTER=/\b(?:foco|led|luz|lamparita|lucecita)\s+(?:(?:numero|nro)\s+)?(primer|primera|primero|uno|1|segundo|segunda|dos|2)\b/;
const LED_BEFORE=/\b(primer|primera|primero|uno|1|segundo|segunda|dos|2)\s+(?:foco|led|luz|lamparita|lucecita)\b/;
const NAV={
 inventario:{action:'open_view',query:'inventory'},
 materiales:{action:'open_view',query:'inventory'},
 stock:{action:'open_view',query:'inventory'},
 documentos:{action:'open_view',query:'documents'},
 archivos:{action:'open_view',query:'documents'},
 configuracion:{action:'open_view',query:'settings'},
 ajustes:{action:'open_view',query:'settings'},
 'panel principal':{action:'open_view',query:'dashboard'},
 inicio:{action:'open_view',query:'dashboard'},
 calendario:{action:'open_calendar'},agenda:{action:'open_calendar'},
 'nexus lens':{action:'open_lens'},lens:{action:'open_lens'}
};
function normalize(input){
 return String(input||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
   .replace(/[¿?¡!.,;:()[\]{}]/g,' ').replace(/\s+/g,' ').trim();
}
function strip(input){
 let n=normalize(input).replace(/\s+(?:por favor|porfa)\s*$/,'');
 for(let i=0;i<5;i++){
  const next=n.replace(/^(?:(?:hola|che|ey|oye|bueno|por favor|porfa)\s+|(?:me )?(?:podrias|podria|podes|puedes)\s+|(?:quiero|necesito|te pido|me gustaria)\s+que\s+|(?:si podes|si puedes)\s+)/,'').trim();
  if(next===n)break;
  n=next;
 }
 return n;
}
function rejected(input){
 return /^(?:no|nunca|jamas|evita|evitar|ni se te ocurra|como se|como puedo|de que manera|el profesor|mi profesor|dijeron|dijo)\b/.test(input)||
 /(?:^|\s)(?:no (?:prendas?|enciendas?|apagues?|actives?|desactives?)|nunca (?:prendas?|apagues?))\b/.test(input);
}
function sensorPlan(input){
 const found=[...new Set([...input.matchAll(/\b(temperatura|grados|humedad|presion|hectopascales)\b/g)].map(x=>SENSOR[x[1]]))];
 if(found.length!==1)return null;
 const explicit=/^(?:temperatura|humedad|presion|grados|hectopascales)(?:\s+(?:actual|del laboratorio))?$/.test(input);
 const request=/\b(?:cuanto|cuantos|cual|que|como|mide|medime|medir|revisa|revisar|consultar|consulta|decime|decir|dime|decis|informa|informes|mostrame|mostrar|mostras|muestre|muestres|marca|tenemos|hay|esta|saber|indica|indicame|informar|dame|revises|quiero|quisiera|necesito)\b/.test(input);
 if(!explicit&&!request)return null;
 return {action:'read_hardware_sensor',metric:found[0]};
}
function ledPlan(input){
 const on=ON.test(input),off=OFF.test(input);
 if(on===off)return null;
 const text=input.replace(on?ON:OFF,'').trim();
 if(PLURAL.test(text)||MULTIPLE.test(text)||/\b(?:y|o)\s+(?:el|la|los|las)?\s*(?:foco|luz|led|numero|nro)\b/.test(text))return null;
 const m=text.match(LED_AFTER)||text.match(LED_BEFORE);
 if(!m)return null;
 const id=/^(?:primer|primera|primero|uno|1)$/.test(m[1])?1:2;
 const rest=text.replace(m[0],'').replace(/\b(?:el|la|un|una|del|de|al|por favor)\b/g,' ').trim();
 if(rest)return null;
 return {action:'set_hardware_led',id,state:on?'on':'off'};
}
function navPlan(input){
 const m=input.match(/^(?:abri|abrime|abrir|abre|abreme|mostra|mostrame|mostrar|muestra|muestrame|mostras|me mostras|llevame|lleva|me lleves|llevas|ir|anda|andame|pasa|pasame|entrar|entra|quiero ver|ver|quisiera ver|necesito ver|quiero abrir)\s+(.+)$/);
 if(!m)return null;
 let target=m[1].replace(/^(?:(?:a|al|en|hacia|para)\s+)?(?:el|la|los|las)\s+/,'');
 target=target.replace(/^(?:a|al|en|hacia|para)\s+/,'')
  .replace(/^(?:seccion|apartado|pantalla|modulo|pestana|parte)\s+(?:(?:del|de la|de los|de las|de|al)\s+)?/,'')
  .replace(/^(?:el|la|los|las|del)\s+/,'').trim();
 return Object.hasOwn(NAV,target)?{...NAV[target]}:null;
}
function searchPlan(input){
 let m=input.match(/^(?:busca(?:me|s)?|buscar|buscame|encontra(?:me)?|encontrar|quiero buscar|me buscas)\s+(.+?)\s+(?:en|dentro de)\s+(?:el|la)\s+inventario$/);
 if(m){
  const query=m[1].replace(/^(?:el|la|un|una|los|las)\s+/,'').trim();
  return query.length>=3&&query.length<=120?{action:'search_inventory',query}:null;
 }
 m=input.match(/^(?:necesito encontrar|quiero encontrar|encontra(?:me)?|encontrar|busca(?:me|s)?|buscame)\s+(?:la|el|un|una)?\s*(?:sustancia|material|reactivo)\s+(.+)$/);
 if(m){const query=m[1].trim();return query.length>=3&&query.length<=120?{action:'search_inventory',query}:null;}
 m=input.match(/^(?:busca(?:me|s)?|buscar|buscame|mostrame|mostrar|quiero ver|quisiera ver|me mostras)\s+(?:los|las|un|una|el|la)?\s*(?:documentos?|archivos?)\s+(?:(?:acerca de|sobre|de|relacionados con)\s+)(.+)$/);
 if(m){const query=m[1].trim();return query.length>=3&&query.length<=120?{action:'search_documents',query}:null;}
 return null;
}
function plan(raw){
 const text=strip(raw);
 if(!text||rejected(text)||text.length>280)return null;
 return ledPlan(text)||sensorPlan(text)||navPlan(text)||searchPlan(text);
}
root.NexusVoiceLanguage={normalize,plan,version:'es-AR-v4'};
})(globalThis);
