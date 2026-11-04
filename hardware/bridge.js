/* NEXUS-X Hardware Bridge — BLE v5, without network access or firmware changes.
 * Only low-voltage LED 1/2 and BME280/BMP280 readings are exposed.
 */
(function(root){
'use strict';
const SERVICE='4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const STATUS='beb5483e-36e1-4688-b7f5-ea07361b26a8';
const COMMAND='3a1e2bb8-531e-4d55-bc0c-b83b650e9069';
const ALLOWED=new Set(['TEMP','PRESS','HUM','LED_ON','LED_OFF','LED_STATUS','LED2_ON','LED2_OFF','LED2_STATUS']);
const decoder=new TextDecoder();
const encoder=new TextEncoder();

function parseCommand(input){
  let s=String(input||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[¿?¡!.,;:]+/g,' ').replace(/\s+/g,' ').trim();
  s=s.replace(/^nexus(?:\s*x)?\s+/,'').replace(/^(?:por favor|porfa)\s+/,'').trim();
  let m=s.match(/^(?:(?:revisa|revisar|mide|medir|consulta|consultar|decime|dime|decir|decime la|mostrame)\s+)?(?:la|el)?\s*(temperatura|presion|humedad)(?:\s+(?:actual|ambiente|ambiental|del laboratorio))?$/);
  if(!m)m=s.match(/^(?:cual es|cuanto es|que marca|que valor tiene)\s+(?:la|el)\s+(temperatura|presion|humedad)(?:\s+actual)?$/);
  if(m)return {action:'read_hardware_sensor',metric:({temperatura:'temperature',presion:'pressure',humedad:'humidity'})[m[1]]};
  m=s.match(/^(prende|prender|encende|encender|enciende|encendi|activa|activar|apaga|apagar|desactiva|desactivar)\s+(?:el|la)?\s*(?:foco|led|luz)\s*(uno|dos|1|2)$/);
  if(m)return {action:'set_hardware_led',id:/^(uno|1)$/.test(m[2])?1:2,state:/^(apaga|apagar|desactiva|desactivar)$/.test(m[1])?'off':'on'};
  return null;
}

class NexusHardwareBridge {
  constructor({bluetooth=root.navigator?.bluetooth,timeoutMs=5000}={}){
    this.bluetooth=bluetooth;
    this.timeoutMs=timeoutMs;
    this.device=null;this.status=null;this.tx=null;this.connected=false;this.lastMessage='';
    this.pending=null;this.commandQueue=Promise.resolve();this.subscribers=new Set();
  }
  parseCommand(input){return parseCommand(input);}
  snapshot(){return {connected:this.connected,name:this.device?.name||'NEXUS-ESP32',lastMessage:this.lastMessage};}
  subscribe(handler){this.subscribers.add(handler);return ()=>this.subscribers.delete(handler);}
  emit(){for(const cb of this.subscribers){try{cb(this.snapshot());}catch(error){console.warn('Hardware panel',error);}}}
  onNotification(event){
    const raw=event?.target?.value;
    if(!raw)return;
    const text=decoder.decode(raw).trim();
    this.lastMessage=text;this.emit();
    const p=this.pending;
    if(!p)return;
    if(text.startsWith('ERR:')){this.pending=null;clearTimeout(p.timer);p.reject(new Error('ESP32: '+text));}
    else if(text.startsWith(p.expected)){this.pending=null;clearTimeout(p.timer);p.resolve(text);}
  }
  failPending(reason){
    const p=this.pending;
    if(!p)return;
    this.pending=null;clearTimeout(p.timer);p.reject(new Error(reason));
  }
  onDisconnected(){
    this.connected=false;this.status=null;this.tx=null;
    this.failPending('ESP32 desconectada; orden no confirmada');
    this.emit();
  }
  async connect(){
    if(this.connected)return this.snapshot();
    if(!this.bluetooth?.requestDevice)throw new Error('Web Bluetooth no disponible. Abrí NEXUS-X en Chrome para Android con HTTPS.');
    // This must be initiated directly from a user click (browser user activation).
    const device=await this.bluetooth.requestDevice({filters:[{name:'NEXUS-ESP32'}],optionalServices:[SERVICE]});
    this.device=device;
    device.addEventListener('gattserverdisconnected',()=>this.onDisconnected());
    try{
      const server=await device.gatt.connect();
      const service=await server.getPrimaryService(SERVICE);
      const status=await service.getCharacteristic(STATUS);
      const tx=await service.getCharacteristic(COMMAND);
      status.addEventListener('characteristicvaluechanged',event=>this.onNotification(event));
      await status.startNotifications();
      this.status=status;this.tx=tx;this.connected=true;this.emit();
      return this.snapshot();
    }catch(error){
      this.onDisconnected();
      try{device.gatt.disconnect();}catch{}
      throw new Error('No se pudo conectar con NEXUS-ESP32: '+(error?.message||error));
    }
  }
  disconnect(){
    if(this.device?.gatt?.connected)try{this.device.gatt.disconnect();}catch{}
    this.onDisconnected();
  }
  command(command,expected){
    if(!ALLOWED.has(command))return Promise.reject(new Error('Orden de hardware no autorizada'));
    // Serializing the write and ACK avoids confusing responses from concurrent UI/voice actions.
    const run=()=>this.sendOnce(command,expected);
    const result=this.commandQueue.catch(()=>{}).then(run);
    this.commandQueue=result.catch(()=>{});
    return result;
  }
  sendOnce(command,expected){
    if(!this.connected||!this.device?.gatt?.connected||!this.tx)throw new Error('La ESP32 no está conectada. Tocá Conectar ESP32.');
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        if(this.pending!==pending)return;
        this.pending=null;
        reject(new Error('Tiempo de espera agotado: la ESP32 no confirmó '+command));
        this.disconnect(); // Reconnect after timeout so a late ACK cannot confirm a later command.
      },this.timeoutMs);
      const pending={expected,timer,resolve,reject};
      this.pending=pending;
      let write;
      try{
        if(typeof this.tx.writeValueWithResponse==='function')write=this.tx.writeValueWithResponse(encoder.encode(command));
        else if(typeof this.tx.writeValue==='function')write=this.tx.writeValue(encoder.encode(command));
        else throw new Error('La característica BLE no permite escribir órdenes');
      }catch(error){this.failPending('Falló el envío BLE: '+(error?.message||error));return;}
      Promise.resolve(write).catch(error=>this.failPending('Falló el envío BLE: '+(error?.message||error)));
    });
  }
  async readMetric(metric){
    const map={temperature:['TEMP','TEMP:','°C'],pressure:['PRESS','PRES:','hPa'],humidity:['HUM','HUM:','%']};
    if(!Object.hasOwn(map,metric))throw new Error('Sensor no autorizado');
    const [command,prefix,unit]=map[metric];
    const text=await this.command(command,prefix);
    const valueString=text.slice(prefix.length);
    if(!/^-?\d+(?:\.\d+)?$/.test(valueString))throw new Error('Lectura de '+metric+' inválida');
    const value=Number(valueString);
    if(!Number.isFinite(value))throw new Error('Lectura no finita');
    return {metric,value,unit};
  }
  async setLed(id,on){
    if(id!==1&&id!==2)throw new Error('Solo están disponibles los focos 1 y 2');
    if(typeof on!=='boolean')throw new Error('El estado del foco debe ser verdadero o falso');
    const command=(id===1?'LED':'LED2')+(on?'_ON':'_OFF');
    await this.command(command,'ACK:'+command);
    return {id,on};
  }
  async getLedStatus(id){
    if(id!==1&&id!==2)throw new Error('Foco no disponible');
    const prefix=id===1?'LED:':'LED2:';
    const state=await this.command(id===1?'LED_STATUS':'LED2_STATUS',prefix);
    return {id,on:state===prefix+'ON'};
  }
}
root.NexusHardwareBridge=NexusHardwareBridge;
root.NexusHardware=new NexusHardwareBridge();
})(globalThis);
