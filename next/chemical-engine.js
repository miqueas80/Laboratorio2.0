/**
 * Chemistry safety advisory — NOT a chemical compatibility certification.
 * Only explicit verified SDS metadata is used; names and camera guesses never
 * imply CAS, GHS classifications, reaction products or safe storage.
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
/**
 * @param {object} record Inventory record with independently verified safety metadata
 * record.safety={verified:true,source:'SDS...',hazardClasses:['oxidizer'],cas:'...',ghs:['GHS03'],H:['H272'],P:['P220']}
 */
export function inspectSafety(record){
  const safety=record?.safety;
  if(!safety||safety.verified!==true||!String(safety.source||'').trim())
    return {valid:false,reason:'Falta ficha de seguridad verificada',hazards:[],cas:null};
  const classes=Array.isArray(safety.hazardClasses)?safety.hazardClasses:[];
  const bad=classes.filter(c=>!HAZARD_TYPES.has(c));
  const ghs=Array.isArray(safety.ghs)?safety.ghs:[];
  const H=Array.isArray(safety.H)?safety.H:[];
  const P=Array.isArray(safety.P)?safety.P:[];
  const cas=String(safety.cas||'').trim();
  if(bad.length||ghs.some(x=>!GHS_CODES.has(x))||H.some(x=>!/^H\d{3}$/.test(x))||P.some(x=>!/^P\d{3}(\+P\d{3})*$/.test(x))||cas&&!validCAS(cas))
    return {valid:false,reason:'Metadatos SDS/CAS/GHS inválidos',hazards:[],cas:null};
  return {valid:true,hazards:[...new Set(classes)],ghs,H,P,cas:cas||null,source:safety.source};
}
const locationKey=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
/**
 * Compare only records in an exactly matching explicitly assigned storage zone.
 * Results are warnings for a responsible lab supervisor, never proof of safety.
 */
export function evaluateStorage(records){
  if(!Array.isArray(records))throw Error('Inventario inválido');
  const zones=new Map(),unverified=[],alerts=[];
  for(const row of records){
    if(!row||!row.id)continue;
    const zone=locationKey(row.location),e=inspectSafety(row);
    if(!e.valid){unverified.push({id:row.id,reason:e.reason});continue}
    if(!zone)continue;
    const list=zones.get(zone)||[];list.push({row,safety:e});zones.set(zone,list);
  }
  for(const [location,items] of zones){
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
      const left=items[i],right=items[j],a=new Set(left.safety.hazards),b=new Set(right.safety.hazards);
      for(const rule of RULES){
        if(a.has(rule.a)&&b.has(rule.b)||b.has(rule.a)&&a.has(rule.b))
          alerts.push({location,ids:[left.row.id,right.row.id],code:rule.code,severity:rule.severity,reason:rule.reason,sources:[left.safety.source,right.safety.source]});
      }
    }
  }
  return {alerts,unverified,reviewRequired:alerts.length>0||unverified.length>0,disclaimer:'Orientativo. Confirmar compatibilidad en SDS y con personal competente. La ausencia de alertas NO demuestra almacenamiento seguro.'};
}
