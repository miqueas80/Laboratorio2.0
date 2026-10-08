/**
 * Manual no-server signaling using one invite and one answer exchanged by QR,
 * local file or direct clipboard. No STUN/TURN = LAN candidates only. Browser
 * ICE mDNS support differs; not guaranteed to connect on all Wi-Fi networks.
 * Verification code MUST match on both devices before sync is enabled.
 */
import {newIdentity,derivePairing,encryptPacket,decryptPacket} from './p2p-crypto.js';
const MAX_BUNDLE=220000,MAX_PACKET=80000;
function validateBundle(bundle,type){
 const data=typeof bundle==='string'?JSON.parse(bundle):bundle;
 if(!data||data.version!==1||data.type!==type||typeof data.sdp!=='string'||data.sdp.length>MAX_BUNDLE||
    typeof data.sessionId!=='string'||!/^[-0-9a-f]{16,64}$/i.test(data.sessionId)||typeof data.key!=='string'||data.key.length>200)
   throw Error('Señalización inválida');
 return data;
}
function iceComplete(peer,{timeoutMs=20000}={}){
 if(peer.iceGatheringState==='complete')return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{peer.removeEventListener('icegatheringstatechange',check);reject(Error('ICE timeout: revisá el Wi-Fi local'))},timeoutMs);
  function check(){if(peer.iceGatheringState!=='complete')return;clearTimeout(timeout);peer.removeEventListener('icegatheringstatechange',check);resolve()}
  peer.addEventListener('icegatheringstatechange',check);
  check();
 });
}
export class ManualWebRTCPeer{
 constructor({RTCPeerConnectionConstructor=globalThis.RTCPeerConnection,onPayload=()=>{},onStatus=()=>{}}={}){
  if(!RTCPeerConnectionConstructor)throw Error('WebRTC no disponible');
  this.peer=new RTCPeerConnectionConstructor({iceServers:[]});
  this.identity=null;this.sessionId='';this.pairing=null;this.confirmed=false;this.channel=null;this.replay=new Set();
  this.onPayload=onPayload;this.onStatus=onStatus;this.inflight=new Set();
  this.peer.onconnectionstatechange=()=>onStatus({state:this.peer.connectionState,confirmed:this.confirmed});
  this.peer.ondatachannel=event=>this.#bindChannel(event.channel);
 }
 #bindChannel(channel){
  this.channel=channel;
  channel.onopen=()=>this.onStatus({state:'data-open',confirmed:this.confirmed});
  channel.onclose=()=>this.onStatus({state:'data-closed',confirmed:this.confirmed});
  channel.onmessage=async ({data})=>{
   try{
    if(!this.confirmed||!this.pairing||typeof data!=='string'||data.length>MAX_PACKET)return;
    const packet=JSON.parse(data);
    if(this.replay.has(packet.iv)||this.inflight.has(packet.iv))return;
    const content=await decryptPacket(this.pairing.key,packet);
    this.inflight.add(packet.iv);
    try{
     await this.onPayload(content);
     // A packet is considered consumed only AFTER durable receiver success.
     this.replay.add(packet.iv);if(this.replay.size>1000)this.replay.delete(this.replay.values().next().value);
    }finally{this.inflight.delete(packet.iv)}
   }catch(error){this.onStatus({state:'packet-rejected',reason:String(error.message||error)})}
  };
 }
 async createInvite(){
  this.identity=await newIdentity();this.sessionId=globalThis.crypto.randomUUID();
  this.#bindChannel(this.peer.createDataChannel('nexus-edge-sync-v1',{ordered:true}));
  await this.peer.setLocalDescription(await this.peer.createOffer());
  await iceComplete(this.peer);
  return JSON.stringify({type:'offer',version:1,sessionId:this.sessionId,key:this.identity.publicKey,sdp:this.peer.localDescription.sdp});
 }
 async acceptInvite(bundle){
  const offer=validateBundle(bundle,'offer');this.identity=await newIdentity();
  this.sessionId=offer.sessionId;this.pairing=await derivePairing(this.identity,offer.key,this.sessionId);
  await this.peer.setRemoteDescription({type:'offer',sdp:offer.sdp});
  await this.peer.setLocalDescription(await this.peer.createAnswer());
  await iceComplete(this.peer);
  return JSON.stringify({type:'answer',version:1,sessionId:this.sessionId,key:this.identity.publicKey,sdp:this.peer.localDescription.sdp});
 }
 async acceptAnswer(bundle){
  const answer=validateBundle(bundle,'answer');
  if(!this.identity||answer.sessionId!==this.sessionId)throw Error('La respuesta no coincide con la sesión');
  this.pairing=await derivePairing(this.identity,answer.key,this.sessionId);
  await this.peer.setRemoteDescription({type:'answer',sdp:answer.sdp});
  return this.pairing.code;
 }
 getPairCode(){return this.pairing?.code||null}
 confirmSameCode(code){
  if(!this.pairing||!/^\d{6}$/.test(code)||code!==this.pairing.code)throw Error('Código de verificación diferente');
  this.confirmed=true;this.onStatus({state:'paired',confirmed:true});
 }
 async send(payload){
  if(!this.confirmed||this.channel?.readyState!=='open')throw Error('Emparejamiento sin confirmar o enlace cerrado');
  const packet=await encryptPacket(this.pairing.key,payload);
  const encoded=JSON.stringify(packet);
  if(encoded.length>MAX_PACKET)throw Error('Mensaje excede límite');
  this.channel.send(encoded);
 }
 close(){this.confirmed=false;this.channel?.close();this.peer.close();this.replay.clear();this.inflight.clear();this.pairing=null}
}
