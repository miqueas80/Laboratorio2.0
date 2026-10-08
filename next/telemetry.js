/** Bounded on-device diagnostic ring buffer; never records API keys or media frames. */
const redact=s=>String(s).replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/(?:sk-|xk-)[a-z0-9_-]{8,}/gi,'[REDACTED]');
export class LocalTelemetry {
 constructor({max=200,now=()=>new Date().toISOString()}={}){this.max=Math.min(1000,Math.max(10,max));this.now=now;this.events=[]}
 log(level,code,details={}){
  if(!['debug','info','warn','error'].includes(level))throw Error('Nivel inválido');
  const payload=JSON.stringify(details);
  const e={time:this.now(),level,code:String(code).slice(0,100),details:JSON.parse(redact(payload||'{}'))};
  this.events.push(e);if(this.events.length>this.max)this.events.splice(0,this.events.length-this.max);
  return e;
 }
 snapshot(){return structuredClone(this.events)}
 clear(){this.events.length=0}
}
