import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function rig({sensor='BME280',silent=false,unknownLed2=false}={}) {
  const writes=[]; let notify=null, disconnected=null;
  const responses={
    SENSOR:'SENSOR:'+sensor, TEMP:'TEMP:27.2', PRESS:'PRES:995.2',
    HUM:sensor==='BMP280'?'ERR:NO_HUM':'HUM:61.8',
    LED_ON:'ACK:LED_ON', LED_OFF:'ACK:LED_OFF', LED_STATUS:'LED:OFF',
    LED2_ON:unknownLed2?'ERR:UNKNOWN_COMMAND':'ACK:LED2_ON',
    LED2_OFF:'ACK:LED2_OFF', LED2_STATUS:'LED2:OFF'
  };
  const characteristic={
    addEventListener(_type,handler){notify=handler;},
    async startNotifications(){return this;},
    async readValue(){return new DataView(new TextEncoder().encode('NEXUS-X LISTO').buffer);}
  };
  const tx={async writeValueWithResponse(bytes){
    const cmd=new TextDecoder().decode(bytes); writes.push(cmd);
    if(!silent)queueMicrotask(()=>{
      const text=responses[cmd]||'ERR:UNKNOWN_COMMAND';
      characteristic.value=new DataView(new TextEncoder().encode(text).buffer);
      notify?.({target:characteristic});
    });
  }};
  const device={gatt:{connected:false,async connect(){this.connected=true;return {getPrimaryService:async()=>({
    getCharacteristic:async uuid=>uuid==='beb5483e-36e1-4688-b7f5-ea07361b26a8'?characteristic:tx
  })};},disconnect(){this.connected=false;disconnected?.();}},
    addEventListener(_name,cb){disconnected=cb;}
  };
  const bluetooth={async requestDevice(options){
    assert.equal(options.filters[0].name,'NEXUS-ESP32');return device;
  }};
  const context={navigator:{bluetooth},TextDecoder,TextEncoder,console,setTimeout,clearTimeout};
  context.globalThis=context;
  vm.runInNewContext(fs.readFileSync(new URL('./bridge.js',import.meta.url),'utf8'),context);
  const bridge=new context.NexusHardwareBridge({bluetooth,timeoutMs:60});
  return {bridge,writes,device};
}

test('parser returns exact local actions; no unrecognized GPIO or gas commands',()=>{
  const {bridge}=rig();
  assert.deepEqual(JSON.parse(JSON.stringify(bridge.parseCommand('Nexus, revisá temperatura'))),{action:'read_hardware_sensor',metric:'temperature'});
  assert.deepEqual(JSON.parse(JSON.stringify(bridge.parseCommand('Nexus revisar presión'))),{action:'read_hardware_sensor',metric:'pressure'});
  assert.deepEqual(JSON.parse(JSON.stringify(bridge.parseCommand('Nexus decime humedad'))),{action:'read_hardware_sensor',metric:'humidity'});
  assert.deepEqual(JSON.parse(JSON.stringify(bridge.parseCommand('Nexus prender foco uno'))),{action:'set_hardware_led',id:1,state:'on'});
  assert.deepEqual(JSON.parse(JSON.stringify(bridge.parseCommand('Nexus apaga el foco 2'))),{action:'set_hardware_led',id:2,state:'off'});
  assert.equal(bridge.parseCommand('Nexus medí gas MQ5'),null);
  assert.equal(bridge.parseCommand('Nexus prender foco tres'),null);
});

test('BLE real protocol values and independent LED confirmation',async()=>{
  const {bridge,writes}=rig(); await bridge.connect();
  assert.deepEqual(JSON.parse(JSON.stringify(await bridge.readMetric('temperature'))),{metric:'temperature',value:27.2,unit:'°C'});
  assert.deepEqual(JSON.parse(JSON.stringify(await bridge.readMetric('pressure'))),{metric:'pressure',value:995.2,unit:'hPa'});
  assert.deepEqual(JSON.parse(JSON.stringify(await bridge.readMetric('humidity'))),{metric:'humidity',value:61.8,unit:'%'});
  assert.equal((await bridge.setLed(1,true)).id,1);
  assert.equal((await bridge.setLed(2,true)).id,2);
  assert.deepEqual(writes,['TEMP','PRESS','HUM','LED_ON','LED2_ON']);
});

test('readings reject missing humidity, LEDs reject unsupported firmware',async()=>{
  const {bridge}=rig({sensor:'BMP280',unknownLed2:true}); await bridge.connect();
  await assert.rejects(bridge.readMetric('humidity'),/NO_HUM/);
  await assert.rejects(bridge.setLed(2,true),/UNKNOWN_COMMAND/);
});

test('commands fail closed without connection or confirmation',async()=>{
  const {bridge}=rig({silent:true}); 
  await assert.rejects(bridge.setLed(1,true),/conect/i);
  await bridge.connect();
  await assert.rejects(bridge.setLed(1,true),/tiempo de espera/i);
  assert.equal(bridge.connected,false);
});

test('disconnection stops further commands and never fakes LED success',async()=>{
  const {bridge,device}=rig();await bridge.connect();
  device.gatt.disconnect();
  await assert.rejects(bridge.setLed(1,true),/conect/i);
});
