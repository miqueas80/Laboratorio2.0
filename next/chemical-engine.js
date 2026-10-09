/**
 * NEXUS Edge Chemical Advisory — never a chemistry or storage certification.
 *
 * GHS metadata marked "verified" is a CALLER ASSERTION. This module cannot
 * authenticate a manufacturer SDS, infer chemicals from a camera frame, or
 * prove that the absence of warnings means two substances are compatible.
 * All results require human review.
 */
export function validCAS(input){
 const value=String(input||'').trim();
 if(!/^\d{2,7}-\d{2}-\d$/.test(value))return false;
 const digits=value.replaceAll('-','');
 let sum=0,multiplier=1;
 for(let i=digits.length-2;i>=0;i--)sum+=Number(digits[i])*multiplier++;
 return sum%10===Number(digits.at(-1));
}
const HAZARD_TYPES=new Set(['oxidizer','flammable','combustible','reducing','strong-acid','strong-base','cyanide','sulfide','water-reactive','aqueous','peroxide','organic']);
const GHS_CODES=new Set(['GHS01','GHS02','GHS03','GHS04','GHS05','GHS06','GHS07','GHS08','GHS09']);
const RULES=Object.freeze([
 {a:'oxidizer',b:'flammable',severity:'critical',code:'OXIDIZER_FLAMMABLE',reason:'Oxidantes y materiales inflamables requieren segregación'},
 {a:'oxidizer',b:'combustible',severity:'critical',code:'OXIDIZER_COMBUSTIBLE',reason:'Oxidantes y combustibles requieren segregación'},
 {a:'oxidizer',b:'reducing',severity:'critical',code:'OXIDIZER_REDUCING',reason:'Oxidantes y agentes reductores pueden reaccionar violentamente'},
 {a:'strong-acid',b:'strong-base',severity:'critical',code:'ACID_BASE',reason:'Ácidos y bases fuertes no deben almacenarse juntos sin evaluación'},
 {a:'strong-acid',b:'cyanide',severity:'critical',code:'ACID_CYANIDE',reason:'La mezcla ácida con cianuros puede liberar gas extremadamente tóxico'},
 {a:'strong-acid',b:'sulfide',severity:'critical',code:'ACID_SULFIDE',reason:'La mezcla ácida con sulfuros puede liberar gas tóxico'},
 {a:'water-reactive',b:'aqueous',severity:'critical',code:'WATER_REACTIVE',reason:'Reactivos sensibles al agua deben segregarse de fuentes acuosas'},
 {a:'peroxide',b:'organic',severity:'warning',code:'PEROXIDE_ORGANIC',reason:'Peróxidos y orgánicos requieren evaluación SDS de compatibilidad'}
]);
const normalizeLocation=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function inspectSafety(record){
 const safety=record?.safety;
 if(!safety||safety.verified!==true||!String(safety.source||'').trim())
  return {valid:false,reason:'Falta ficha SDS y procedencia declaradas como verificadas',hazards:[],cas:null};
 const classes=Array.isArray(safety.hazardClasses)?safety.hazardClasses:[];
 const ghs=Array.isArray(safety.ghs)?safety.ghs:[];
 const H=Array.isArray(safety.H)?safety.H:[];
 const P=Array.isArray(safety.P)?safety.P:[];
 const cas=String(safety.cas||'').trim();
 if(classes.some(c=>!HAZARD_TYPES.has(c))||ghs.some(x=>!GHS_CODES.has(x))||
    H.some(x=>!/^H\d{3}$/.test(x))||P.some(x=>!/^P\d{3}(\+P\d{3})*$/.test(x))||
    (cas&&!validCAS(cas)))
  return {valid:false,reason:'Metadatos SDS/CAS/GHS inválidos',hazards:[],cas:null};
 // An empty hazardClasses list cannot establish a negative hazard finding.
 return {valid:true,hazards:[...new Set(classes)],ghs,H,P,cas:cas||null,
  source:String(safety.source).slice(0,250),evidence:'self-declared',complete:classes.length>0};
}
/**
 * Scan ONLY explicit same-zone combinations known in RULES.
 * Bounded reporting prevents a 100k-item zone from generating billions of
 * alert objects. A capped scan is explicitly labeled incomplete/unsafe to
 * conclude from; no "safe" classification is ever produced.
 *
 * Time for zero conflicts is O(n + hazard membership). Conflict enumeration
 * stops after maxAlerts; it is not used to authorize chemical handling.
 */
export function evaluateStorage(records,{maxAlerts=1000,maxUnverified=5000}={}){
 if(!Array.isArray(records))throw Error('Inventario inválido');
 if(!Number.isInteger(maxAlerts)||maxAlerts<1||maxAlerts>20000||
    !Number.isInteger(maxUnverified)||maxUnverified<1||maxUnverified>100000)
  throw Error('Límites de evaluación inválidos');
 const zones=new Map(),alerts=[],unverified=[],noLocation=[];
 const unresolved={invalidSDS:0,missingLocation:0,unknownHazards:0};
 const pushUnverified=(row,reason)=>{
  unresolved.invalidSDS++;
  if(unverified.length<maxUnverified)unverified.push({id:row.id,reason});
 };
 for(const row of records){
  if(!row||typeof row.id!=='string'||!row.id)continue;
  const location=normalizeLocation(row.location),safety=inspectSafety(row);
  if(!safety.valid){pushUnverified(row,safety.reason);continue}
  if(!safety.complete){unresolved.unknownHazards++;if(unverified.length<maxUnverified)unverified.push({id:row.id,reason:'Clases de peligro no documentadas'});continue}
  if(!location){
   unresolved.missingLocation++;
   if(noLocation.length<maxUnverified)noLocation.push(row.id);
   continue;
  }
  let zone=zones.get(location);
  if(!zone){zone=new Map();zones.set(location,zone)}
  for(const hazard of safety.hazards){
   const list=zone.get(hazard)||[];
   list.push({id:row.id,source:safety.source});
   zone.set(hazard,list);
  }
 }
 let truncated=false;
 const reported=new Set();
 outer:for(const [location,zone] of zones){
  for(const rule of RULES){
   const left=zone.get(rule.a)||[],right=zone.get(rule.b)||[];
   for(const a of left){
    for(const b of right){
     if(a.id===b.id)continue;
     const ids=[a.id,b.id].sort(),pairKey=location+'\u0000'+rule.code+'\u0000'+ids.join('\u0000');
     if(reported.has(pairKey))continue;
     if(alerts.length>=maxAlerts){truncated=true;break outer}
     reported.add(pairKey);
     const sources=ids[0]===a.id?[a.source,b.source]:[b.source,a.source];
     alerts.push({location,ids,code:rule.code,severity:rule.severity,
      reason:rule.reason,sources});
    }
   }
  }
 }
 const unresolvedCount=unresolved.invalidSDS+unresolved.missingLocation+unresolved.unknownHazards;
 return {alerts,unverified,noLocation,unresolvedCount,unresolved,
  truncated,alertLimitReached:truncated,reviewRequired:true,
  status:truncated?'INCOMPLETE_ALERT_LIMIT':unresolvedCount?'INCOMPLETE_EVIDENCE':
   alerts.length?'INCOMPATIBILITY_WARNING':'NO_KNOWN_RULE_MATCH',
  assessedLocations:zones.size,
  disclaimer:'Solo asesoramiento basado en reglas limitadas y metadatos SDS declarados por el operador. Verificar la SDS original y consultar a la persona responsable. La ausencia de alertas NO demuestra almacenamiento seguro.'};
}
