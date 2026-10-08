/**
 * The sole experimental document allowing the legacy Vosk worker's dynamic
 * protobuf function generation. Never evaluate messages or accept remote origins.
 * All microphone use requires parent explicit start action.
 */
const SCOPE='nexus-edge-voice-v1';
const token=location.hash.slice(1);
let session=null,epoch=0,busy=false;
function send(type,id,body){
 parent.postMessage({scope:SCOPE,token,type,id,...body},location.origin);
}
const notify=(event,data)=>send('event',null,{event,data});
window.addEventListener('message',async ev=>{
 if(ev.source!==parent||ev.origin!==location.origin||ev.data?.scope!==SCOPE||ev.data?.token!==token)return;
 const {action,id,args={}}=ev.data;
 if(!Number.isSafeInteger(id)||id<1||!['status','prepare','prepareVoice','start','stop'].includes(action))return;
 if(busy&&action!=='stop'){send('reply',id,{error:'Motor Vosk ocupado'});return}
 if(action==='stop'){
  ++epoch;session?.stop?.();session=null;send('reply',id,{result:{active:false}});return;
 }
 busy=true;
 try{
  if(!globalThis.NexusOffline)throw Error('Motor Vosk local no cargado');
  let result;
  if(action==='status')result=await globalThis.NexusOffline.cacheStatus('voice');
  if(action==='prepare')result=await globalThis.NexusOffline.prepare('voice',p=>notify('progress',p));
  if(action==='prepareVoice')result=await globalThis.NexusOffline.prepareVoice();
  if(action==='start'){
   if(session)throw Error('Ya hay una sesión Vosk activa');
   const run=++epoch;
   session=globalThis.NexusOffline.createVoice({
    vocabulary:Array.isArray(args.vocabulary)?args.vocabulary.slice(0,60):[],
    onTranscript:t=>{if(epoch===run)notify('transcript',t)},
    onPartial:p=>{if(epoch===run)notify('partial',p)},
    onStatus:s=>{if(epoch===run)notify('status',s)}
   });
   try{
    await session.start({forceWasm:true});
    result={active:true,recognizer:'Vosk WASM'};
   }catch(error){session?.stop?.();session=null;throw error}
  }
  send('reply',id,{result});
 }catch(error){send('reply',id,{error:String(error?.message||error).slice(0,300)})}
 finally{busy=false}
});
window.addEventListener('pagehide',()=>{session?.stop?.();session=null});
if(/^[a-f0-9-]{36}$/i.test(token))send('ready',0,{result:true});
