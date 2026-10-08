/**
 * End-to-end WebRTC pairing cryptography. Exchange the six-digit verification
 * code OUT OF BAND on both screens; unauthenticated SDP copy/paste is otherwise
 * vulnerable to a man-in-the-middle. WebRTC DTLS remains enabled as well.
 */
const encoder=new TextEncoder(),decoder=new TextDecoder();
const encode=bytes=>btoa(String.fromCharCode(...bytes));
const decode=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const cryptoObject=()=>{if(!globalThis.crypto?.subtle)throw Error('Web Crypto no disponible');return globalThis.crypto};
export async function newIdentity(){
 const c=cryptoObject();
 const pair=await c.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const publicKey=encode(new Uint8Array(await c.subtle.exportKey('raw',pair.publicKey)));
 return {privateKey:pair.privateKey,publicKey};
}
export async function derivePairing(identity,remotePublicKey,sessionId){
 const c=cryptoObject();
 if(!/^[a-f0-9-]{16,64}$/i.test(sessionId))throw Error('ID de sesión inválido');
 const bytes=decode(remotePublicKey);
 if(bytes.length!==65)throw Error('Clave pública no válida');
 const other=await c.subtle.importKey('raw',bytes,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const bits=await c.subtle.deriveBits({name:'ECDH',public:other},identity.privateKey,256);
 const salt=encoder.encode('NEXUS-X-EDGE-LAN:'+sessionId);
 const secret=await c.subtle.importKey('raw',bits,'HKDF',false,['deriveKey','deriveBits']);
 const key=await c.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:encoder.encode('transport-v1')},secret,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 const fingerprint=new Uint8Array(await c.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info:encoder.encode('human-pair-check')},secret,32));
 const code=String(((((fingerprint[0]<<24)|(fingerprint[1]<<16)|(fingerprint[2]<<8)|fingerprint[3])>>>0)%1000000)).padStart(6,'0');
 return {key,code};
}
export async function encryptPacket(key,body){
 const c=cryptoObject(),json=JSON.stringify(body);
 if(json.length>48000)throw Error('Paquete demasiado grande');
 const iv=c.getRandomValues(new Uint8Array(12));
 const data=await c.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(json));
 return {iv:encode(iv),data:encode(new Uint8Array(data))};
}
export async function decryptPacket(key,packet){
 if(!packet||typeof packet.iv!=='string'||typeof packet.data!=='string'||packet.data.length>75000)throw Error('Paquete inválido');
 const iv=decode(packet.iv);if(iv.length!==12)throw Error('Nonce inválido');
 const clear=await cryptoObject().subtle.decrypt({name:'AES-GCM',iv},key,decode(packet.data));
 return JSON.parse(decoder.decode(clear));
}
