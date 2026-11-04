/* NEXUS Hardware 2.0 — offline history and opt-in local rules.
 * Isolated from NEXUS-X inventory; no network, no gas sensor and no firmware changes.
 */
(function(root){
'use strict';
const DAY=86400000;
const MAX_SAMPLES=5000;
const METRICS=Object.freeze({
  temperature:{label:'temperatura',min:-40,max:85},
  pressure:{label:'presión',min:300,max:1150},
  humidity:{label:'humedad',min:0,max:100}
});
const ACTIONS=new Set(['alert','led1_on','led1_off','led2_on','led2_off']);
const INTERVALS=new Set([30000,60000,120000,300000]);
const STORAGE_VERSION=2;

class NexusHardwareMonitor {
  constructor({
    bridge=root.NexusHardware,
    indexedDB=root.indexedDB,
    storage=root.localStorage,
    now=()=>Date.now()
  }={}){
    this.bridge=bridge;
    this.factory=indexedDB;
    this.storage=storage;
    this.now=now;
    const scope=encodeURIComponent(root.location?.pathname||'/');
    this.dbName='nexus_x_hardware_monitor_v2:'+scope;
    this.settingsKey='nexus_x_hardware_rules_v2:'+scope;
    this.running=false;
    this.busy=false;
    this.timer=null;
    this.dbPromise=null;
    this.last=null;
    this.error='';
    this.alerts=[];
    this.subscribers=new Set();
    this.states=new Map();
    this.written=0;
    const saved=this.loadSettings();
    this.intervalMs=INTERVALS.has(saved.intervalMs)?saved.intervalMs:60000;
    this.rules=Array.isArray(saved.rules)?saved.rules.filter(x=>{
      try{this.validateRule(x);return true;}catch{return false;}
    }).slice(0,12):[];
    this.unsubBridge=bridge?.subscribe?.(s=>{
      if(!s.connected&&this.running)this.stop('ESP32 desconectada; monitoreo detenido.');
    });
  }
  loadSettings(){
    try{return JSON.parse(this.storage?.getItem(this.settingsKey)||'{}')||{};}
    catch{return {};}
  }
  persistSettings(){
    if(!this.storage)throw new Error('Almacenamiento de configuración no disponible');
    this.storage.setItem(this.settingsKey,JSON.stringify({
      version:STORAGE_VERSION,intervalMs:this.intervalMs,rules:this.rules
    }));
  }
  setIntervalMs(ms){
    if(!INTERVALS.has(ms))throw new Error('Intervalo inválido: elegí 30 s, 1, 2 o 5 min.');
    this.intervalMs=ms;
    this.persistSettings();
    this.emit();
  }
  validateRule(rule){
    if(!rule||!Object.hasOwn(METRICS,rule.metric))throw new Error('Métrica de regla inválida');
    if(!['above','below'].includes(rule.comparison))throw new Error('Comparación inválida');
    const value=rule.threshold;
    const range=METRICS[rule.metric];
    if(typeof value!=='number'||!Number.isFinite(value)||value<range.min||value>range.max)
      throw new Error('Umbral fuera de rango válido');
    if(!ACTIONS.has(rule.action))throw new Error('Acción no permitida');
    if(rule.action!=='alert'&&rule.armed!==true)throw new Error('Para accionar un foco debés habilitar la regla explícitamente');
    return true;
  }
  addRule({metric,comparison,threshold,action='alert',armed=false}){
    const rule={metric,comparison,threshold,action,armed:action!=='alert'&&armed===true};
    this.validateRule(rule);
    if(this.rules.length>=12)throw new Error('Máximo de 12 reglas locales');
    rule.id='r'+this.now().toString(36)+Math.random().toString(36).slice(2,10);
    this.rules.push(rule);
    try{this.persistSettings();}catch(error){this.rules.pop();throw error;}
    this.emit();
    return {...rule};
  }
  removeRule(id){
    const index=this.rules.findIndex(r=>r.id===id);
    if(index<0)return false;
    const [rule]=this.rules.splice(index,1);
    try{this.persistSettings();}catch(error){this.rules.splice(index,0,rule);throw error;}
    this.states.delete(id);
    this.emit();
    return true;
  }
  subscribe(fn){
    this.subscribers.add(fn);
    return()=>this.subscribers.delete(fn);
  }
  snapshot(){
    return {running:this.running,busy:this.busy,error:this.error,last:this.last,
      alerts:this.alerts.slice(0,10),intervalMs:this.intervalMs,rules:this.rules.slice()};
  }
  emit(){
    const state=this.snapshot();
    for(const fn of this.subscribers){try{fn(state);}catch(error){console.warn('NEXUS Hardware monitor UI',error);}}
  }
  openDB(){
    if(this.dbPromise)return this.dbPromise;
    if(!this.factory?.open)return Promise.reject(new Error('IndexedDB no disponible: no se puede guardar el historial'));
    this.dbPromise=new Promise((resolve,reject)=>{
      const req=this.factory.open(this.dbName,1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        const store=db.createObjectStore('samples',{keyPath:'id',autoIncrement:true});
        store.createIndex('at','at');
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('No se pudo abrir IndexedDB'));
      req.onblocked=()=>reject(new Error('La base de mediciones está bloqueada por otra pestaña'));
    }).catch(error=>{this.dbPromise=null;throw error;});
    return this.dbPromise;
  }
  async save(sample){
    const db=await this.openDB();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('samples','readwrite');
      tx.objectStore('samples').add(sample);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('No se pudo registrar la medición'));
      tx.onabort=()=>reject(tx.error||new Error('El registro fue cancelado'));
    });
    if(++this.written%50===0)await this.prune();
  }
  async getHistory({limit=250,since=0}={}){
    const db=await this.openDB();
    if(!Number.isInteger(limit)||limit<1)throw new Error('Límite de historial inválido');
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('samples','readonly');
      const req=tx.objectStore('samples').index('at').openCursor(null,'prev');
      const rows=[];
      req.onsuccess=()=>{
        const cursor=req.result;
        if(!cursor||rows.length>=limit){resolve(rows.reverse());return;}
        if(new Date(cursor.value.at).getTime()<since){resolve(rows.reverse());return;}
        rows.push(cursor.value);
        cursor.continue();
      };
      req.onerror=()=>reject(req.error||new Error('No se pudo leer el historial'));
      tx.onabort=()=>reject(tx.error||new Error('Error de IndexedDB'));
    });
  }
  async prune(){
    const db=await this.openDB(),cutoff=this.now()-14*DAY;
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('samples','readwrite');
      const store=tx.objectStore('samples');
      const req=store.index('at').openCursor();
      const entries=[];
      req.onsuccess=()=>{
        const cursor=req.result;
        if(cursor){
          entries.push({id:cursor.primaryKey,at:new Date(cursor.value.at).getTime()});
          cursor.continue();
        }else{
          const extra=Math.max(0,entries.length-MAX_SAMPLES);
          entries.forEach((row,i)=>{if(i<extra||row.at<cutoff)store.delete(row.id);});
        }
      };
      req.onerror=()=>reject(req.error||new Error('No se pudo depurar el historial'));
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error('No se pudo depurar el historial'));
    });
  }
  toCSV(rows){
    const out=['timestamp_iso,temperature_c,pressure_hpa,humidity_pct'];
    for(const r of rows)out.push([r.at,r.temperature??'',r.pressure??'',r.humidity??''].join(','));
    return out.join('\n')+'\n';
  }
  async evaluateRules(sample){
    const triggered=[];
    if(!this.bridge?.connected)return triggered;
    for(const rule of this.rules){
      // A stopped or disconnected monitor must never actuate another rule.
      if(!this.running||!this.bridge.connected)break;
      const value=sample[rule.metric];
      if(value===null||!Number.isFinite(value))continue;
      const crossing=rule.comparison==='above'?value>rule.threshold:value<rule.threshold;
      const previous=this.states.get(rule.id);
      this.states.set(rule.id,crossing);
      // An explicitly started monitoring session evaluates the very first reading.
      // If the condition is already met, notify/actuate ONCE; keep silent until
      // the condition clears and is met again. Never run on page load or manual reads.
      if(!crossing||previous===true)continue;
      const message='Alerta local: '+METRICS[rule.metric].label+' '+String(value).replace('.',',')+
        (rule.comparison==='above'?' supera ':' está por debajo de ')+String(rule.threshold).replace('.',',');
      const alert={at:sample.at,ruleId:rule.id,message,action:rule.action,confirmed:false};
      if(rule.action==='alert'){alert.confirmed=true;}
      else if(rule.armed&&this.running&&this.bridge.connected){
        const m=/^led([12])_(on|off)$/.exec(rule.action);
        if(m){
          try{
            await this.bridge.setLed(Number(m[1]),m[2]==='on');
            alert.confirmed=true;
          }catch(error){alert.error='Foco no confirmado: '+(error?.message||error);}
        }
      }
      triggered.push(alert);
      this.alerts.unshift(alert);
    }
    this.alerts=this.alerts.slice(0,20);
    return triggered;
  }
  async recordOnce({automation=false}={}){
    if(this.busy)throw new Error('Hay una medición en curso');
    if(!this.bridge?.connected)throw new Error('La ESP32 no está conectada');
    this.busy=true;this.emit();
    try{
      await this.openDB(); // Storage must work before collecting or running automatic actions.
      const sample={at:new Date(this.now()).toISOString()};
      for(const metric of ['temperature','pressure','humidity']){
        let reading;
        try{reading=await this.bridge.readMetric(metric);}
        catch(error){
          if(metric==='humidity'&&/NO_HUM/.test(String(error?.message||error))){sample.humidity=null;continue;}
          throw error;
        }
        const range=METRICS[metric],value=reading?.value;
        if(typeof value!=='number'||!Number.isFinite(value)||value<range.min||value>range.max)
          throw new Error('Lectura fuera de rango: '+range.label);
        sample[metric]=value;
      }
      if(!this.bridge.connected)throw new Error('ESP32 desconectada durante la lectura');
      await this.save(sample);
      this.last=sample;
      this.error='';
      // Monitoring never actuates outside an explicit armed rule and an ongoing connected session.
      const alerts=automation&&this.running&&this.bridge.connected?await this.evaluateRules(sample):[];
      return {...sample,alerts};
    }catch(error){
      this.error=String(error?.message||error);
      throw error;
    }finally{this.busy=false;this.emit();}
  }
  async cycle(){
    if(!this.running)return;
    try{await this.recordOnce({automation:true});}
    catch(error){
      if(this.running)this.stop('Monitoreo detenido: '+(error?.message||error));
      return;
    }
    if(this.running)this.timer=setTimeout(()=>this.cycle(),this.intervalMs);
  }
  async start(){
    if(this.running)return;
    if(!this.bridge?.connected)throw new Error('Conectá la ESP32 antes de iniciar el monitoreo');
    if(root.document?.hidden)throw new Error('Abrí la aplicación en primer plano para monitorear');
    await this.openDB();
    this.states.clear(); // Never auto-actuate at startup based on old thresholds.
    this.running=true;this.error='';this.emit();
    await this.cycle();
  }
  stop(reason=''){
    this.running=false;
    if(this.timer)clearTimeout(this.timer);
    this.timer=null;
    if(reason)this.error=reason;
    this.emit();
  }
}

root.NexusHardwareMonitor=NexusHardwareMonitor;
})(globalThis);
