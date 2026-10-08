/**
 * Same-origin iframe adapter for legacy Vosk. Keeps unsafe-eval in a dedicated
 * document instead of enabling it on the main NEXUS Edge UI.
 * This is NOT a cross-origin security sandbox; deployment must audit Vosk.
 */
const SCOPE='nexus-edge-voice-v1';
export class VoiceFrameEngine{
 constructor({documentObject=globalThis.document,windowObject=globalThis.window,timeoutMs=90000}={}){
  if(!documentObject||!windowObject)throw Error('Navegador no disponible');
  this.doc=documentObject;this.win=windowObject;this.timeoutMs=timeoutMs;
  this.frame=null;this.readyPromise=null;this.requests=new Map();this.serial=0;
  this.token=this.win.crypto.randomUUID();this.callbacks=null;this.closed=false;
  this.onMessage=this.onMessage.bind(this);
  this.win.addEventListener('message',this.onMessage);
 }
 onMessage(event){
  if(!this.frame||event.source!==this.frame.contentWindow||
     event.origin!==this.win.location.origin||event.data?.scope!==SCOPE||
     event.data?.token!==this.token)return;
  const data=event.data;
  if(data.type==='ready'){this.readyResolve?.();this.readyResolve=null;return}
  if(data.type==='event'){
   const callbacks=this.callbacks;
   if(data.event==='transcript')callbacks?.onTranscript?.(data.data);
   else if(data.event==='partial')callbacks?.onPartial?.(data.data);
   else if(data.event==='status')callbacks?.onStatus?.(data.data);
   else if(data.event==='progress')this.onProgress?.(data.data);
   return;
  }
  const request=this.requests.get(data.id);if(!request)return;
  this.requests.delete(data.id);clearTimeout(request.timer);
  data.error?request.reject(Error(data.error)):request.resolve(data.result);
 }
 async #ready(){
  if(this.closed)throw Error('Voz cerrada');
  if(this.readyPromise)return this.readyPromise;
  const frame=this.doc.createElement('iframe');
  frame.src=new URL('./voice-frame.html#'+this.token,import.meta.url);
  frame.title='Motor Vosk local';
  frame.setAttribute('sandbox','allow-scripts allow-same-origin');
  frame.setAttribute('allow','microphone');
  frame.className='voice-isolated-frame';frame.hidden=true;frame.setAttribute('aria-hidden','true');
  this.frame=frame;
  this.readyPromise=new Promise((resolve,reject)=>{
   let completed=false;
   const timer=setTimeout(()=>{if(!completed){completed=true;reject(Error('Motor de voz aislado no respondió'))}},10000);
   this.readyResolve=()=>{if(!completed){completed=true;clearTimeout(timer);resolve()}};
   frame.addEventListener('error',()=>{if(!completed){completed=true;clearTimeout(timer);reject(Error('No se pudo iniciar el marco de voz'))}},{once:true});
  });
  this.doc.body.append(frame);
  return this.readyPromise;
 }
 async #request(action,args={}){
  await this.#ready();
  const id=++this.serial;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.requests.delete(id);reject(Error('Tiempo de Vosk agotado'))},this.timeoutMs);
   this.requests.set(id,{resolve,reject,timer});
   this.frame.contentWindow.postMessage({scope:SCOPE,token:this.token,id,action,args},this.win.location.origin);
  });
 }
 cacheStatus(group){
  if(group!=='voice')throw Error('Solo se permite voz local');
  return this.#request('status');
 }
 async prepare(group,onProgress=()=>{}){
  if(group!=='voice')throw Error('Solo se permite voz local');
  this.onProgress=onProgress;
  try{return await this.#request('prepare')}
  finally{this.onProgress=null}
 }
 prepareVoice(){return this.#request('prepareVoice')}
 createVoice(callbacks={}){
  this.callbacks=callbacks;
  return {
   start:options=>this.#request('start',{vocabulary:callbacks.vocabulary||[],forceWasm:true}),
   stop:()=>{this.callbacks=null;void this.#request('stop').catch(()=>{})}
  };
 }
 close(){
  if(this.closed)return;this.closed=true;
  this.callbacks=null;this.win.removeEventListener('message',this.onMessage);
  for(const request of this.requests.values()){clearTimeout(request.timer);request.reject(Error('Motor cerrado'))}
  this.requests.clear();this.frame?.remove();this.frame=null;
 }
}
