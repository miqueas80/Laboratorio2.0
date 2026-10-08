/** Structured bounded telemetry. Keep media frames, credentials and personal records out. */
const redact=s=>String(s).replace(/Bearer\s+[a-z0-9._~+\/-]+/gi,'Bearer [REDACTED]').replace(/(?:sk-|xk-)[a-z0-9_-]{8,}/gi,'[REDACTED]');
function sanitize(value,depth=0,seen=new WeakSet()){
 if(depth>5)return '[TRUNCATED]';
 if(typeof value==='string')return redact(value.slice(0,1500));
 if(typeof value==='number'||typeof value==='boolean'||value==null)return value;
 if(typeof value!=='object')return '[UNSUPPORTED]';
 if(seen.has(value))return '[CIRCULAR]';seen.add(value);
 if(Array.isArray(value))return value.slice(0,30).map(v=>sanitize(v,depth+1,seen));
 const out={};
 for(const [key,item] of Object.entries(value).slice(0,50)){
  out[key]=/(?:api.?key|secret|token|password|authorization|credential)/i.test(key)?'[REDACTED]':sanitize(item,depth+1,seen);
 }
 return out;
}
export class LocalTelemetry {
 constructor({max=200,now=()=>new Date().toISOString()}={}){this.max=Math.min(1000,Math.max(10,max));this.now=now;this.events=[]}
 log(level,code,details={}){
  if(!['debug','info','warn','error'].includes(level))throw Error('Nivel inválido');
  const e={time:this.now(),level,code:String(code).slice(0,100),details:sanitize(details)};
  this.events.push(e);if(this.events.length>this.max)this.events.splice(0,this.events.length-this.max);
  return e;
 }
 snapshot(){return structuredClone(this.events)}
 clear(){this.events.length=0}
}
