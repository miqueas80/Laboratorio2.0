/**
 * Experimental speech coordinator reusing the EXISTING NEXUS Vosk WASM
 * recognizer. No browser remote SpeechRecognition and no online speech API.
 * Wake word is transcript-based (NOT a separate neural KWS model).
 * Local TTS is optional; echo-suppression prevents feedback loops.
 */
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
 .replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
const wake=/^(?:nexus|nexos|nexo)(?:\s+|$)/;
export function parseWakeWord(text){
 const normalized=fold(text);
 const match=normalized.match(wake);
 return {wake:Boolean(match),command:match?normalized.slice(match[0].length).trim():normalized};
}
export class EdgeVoiceCoordinator {
 constructor({engine=globalThis.NexusOffline,agent,onResult=()=>{},onStatus=()=>{},
  speechSynthesis=globalThis.speechSynthesis,Utterance=globalThis.SpeechSynthesisUtterance,
  now=()=>Date.now(),armMs=6500,echoMs=1500}={}){
  if(!agent?.turn)throw Error('Agente local requerido');
  this.engine=engine;this.agent=agent;this.onResult=onResult;this.onStatus=onStatus;
  this.synth=speechSynthesis;this.Utterance=Utterance;this.now=now;this.armMs=armMs;this.echoMs=echoMs;
  this.listening=false;this.epoch=0;this.session=null;this.armedUntil=-Infinity;
  this.lastSpeech='';this.echoUntil=-Infinity;this.speaking=false;this.busy=Promise.resolve();
 }
 #status(value){this.onStatus(value)}
 async prepare(onProgress=()=>{}){
  if(!this.engine?.cacheStatus||!this.engine?.prepare)throw Error('Vosk local no disponible');
  const status=await this.engine.cacheStatus('voice');
  if(!status.ready)await this.engine.prepare('voice',onProgress);
  return this.engine.prepareVoice();
 }
 async start(){
  if(this.listening)return {active:true};
  if(!this.engine?.createVoice)throw Error('Reconocimiento Vosk no disponible');
  const epoch=++this.epoch;
  this.listening=true;
  this.session=this.engine.createVoice({
   vocabulary:['nexus','abrí','inventario','documentos','buscá','ácido nítrico','probeta','matraz','ayuda','estado','lens'],
   onTranscript:value=>this.#receive(value,epoch),
   onPartial:value=>this.#partial(value,epoch),
   onStatus:value=>this.#status({type:'voice',...value})
  });
  try{
   // The production implementation uses forceWasm, keeping recognition local.
   await this.session.start({forceWasm:true});
   if(epoch!==this.epoch)return {active:false};
   this.#status({type:'voice',state:'Escucha Vosk local activa'});
   return {active:true,recognizer:'Vosk WASM',wake:'Nexus'};
  }catch(error){
   this.stop();throw error;
  }
 }
 #partial(text,epoch){
  if(epoch!==this.epoch||!this.listening)return;
  const {wake:hasWake}=parseWakeWord(text);
  if(hasWake){
   this.armedUntil=this.now()+this.armMs;
   if(this.speaking)this.interrupt('wake word durante TTS');
  }
 }
 #receive(text,epoch){
  if(epoch!==this.epoch||!this.listening)return Promise.resolve({ignored:'stale'});
  // Serialize speech turns so two Vosk results cannot execute out of order.
  const operation=this.busy.then(()=>this.#handle(text,epoch));
  this.busy=operation.catch(()=>{});
  return operation;
 }
 async #handle(text,epoch){
  if(epoch!==this.epoch||!this.listening)return {ignored:'stopped'};
  const {wake:hasWake,command}=parseWakeWord(text);
  const normalized=fold(text);
  if(!hasWake&&normalized&&this.now()<this.echoUntil&&
     (this.lastSpeech.includes(normalized)||normalized.includes(this.lastSpeech)))
   return {ignored:'tts-echo'};
  if(hasWake){this.armedUntil=this.now()+this.armMs;
   if(this.speaking)this.interrupt('wake word');}
  const armed=hasWake||this.now()<=this.armedUntil;
  if(!armed)return {ignored:'wake-required'};
  if(!command){this.#status({type:'voice',state:'Escuchando comando después de Nexus'});return {awaiting:true}}
  this.armedUntil=-Infinity;
  const response=await this.agent.turn(command);
  if(epoch!==this.epoch||!this.listening)return {ignored:'stopped'};
  this.onResult(response);
  if(response?.reply)this.speak(response.reply);
  return response;
 }
 feedTranscript(text){return this.#receive(text,this.epoch)}
 feedPartial(text){this.#partial(text,this.epoch)}
 speak(text){
  if(!this.listening||!this.synth||typeof this.Utterance!=='function')return false;
  const voice=this.synth.getVoices?.().find(v=>v.localService!==false&&/^es-AR$/i.test(v.lang))||
   this.synth.getVoices?.().find(v=>v.localService===true&&/^es(-|$)/i.test(v.lang));
  // No cloud fallback when local Spanish speech synthesis is unavailable.
  if(!voice){this.#status({type:'tts',state:'Sin voz española local; respuesta en pantalla'});return false}
  const clean=String(text||'').trim().slice(0,480);
  if(!clean)return false;
  this.interrupt('new speech');
  const utterance=new this.Utterance(clean);
  utterance.lang=voice.lang;utterance.voice=voice;utterance.rate=1;
  this.speaking=true;this.lastSpeech=fold(clean);this.echoUntil=this.now()+this.echoMs;
  const token=this.epoch;
  utterance.onend=utterance.onerror=()=>{
   if(token===this.epoch){this.speaking=false;this.echoUntil=this.now()+this.echoMs}
  };
  this.synth.speak(utterance);return true;
 }
 interrupt(reason='interrumpido'){
  if(this.speaking){this.synth?.cancel?.();this.speaking=false;this.#status({type:'tts',state:reason})}
 }
 stop(){
  this.epoch++;this.listening=false;this.armedUntil=-Infinity;
  this.interrupt('detenido');
  this.session?.stop?.();this.session=null;this.#status({type:'voice',state:'Detenido'});
 }
}
