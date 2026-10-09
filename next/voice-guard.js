/**
 * Opt-in Web Audio energy-gate for local barge-in.
 * The microphone stream should enable echoCancellation/noiseSuppression.
 * It is NOT a trained keyword spotter and MUST NOT automatically replace Vosk.
 */
export class VoiceBargeInGate {
 constructor({threshold=.035,frames=4,cooldownMs=800,onInterrupt=()=>{},clock=()=>performance.now()}={}){
  this.threshold=threshold;this.frames=frames;this.cooldownMs=cooldownMs;
  this.onInterrupt=onInterrupt;this.clock=clock;this.active=false;this.streak=0;this.last=-Infinity;
 }
 setSpeaking(flag){this.active=Boolean(flag);if(!this.active)this.streak=0}
 /** @param {Float32Array} samples audio samples from a mic AudioWorklet */
 feed(samples){
  if(!this.active||!samples?.length)return false;
  let energy=0;for(const v of samples)energy+=v*v;
  const rms=Math.sqrt(energy/samples.length);
  this.streak=rms>=this.threshold?this.streak+1:0;
  const now=this.clock();
  if(this.streak<this.frames||now-this.last<this.cooldownMs)return false;
  this.last=now;this.streak=0;this.onInterrupt();return true;
 }
}
