import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';

function bluetoothRig() {
  const commands=[];let notify,disconnected;
  const replies={TEMP:'TEMP:24.8',PRESS:'PRES:1002.3',HUM:'HUM:55.6',
    LED_ON:'ACK:LED_ON',LED_OFF:'ACK:LED_OFF',LED2_ON:'ACK:LED2_ON',LED2_OFF:'ACK:LED2_OFF'};
  const status={addEventListener(_name,fn){notify=fn;},async startNotifications(){}};
  const tx={async writeValueWithResponse(buffer) {
    const cmd=new TextDecoder().decode(buffer);commands.push(cmd);
    queueMicrotask(()=>{
      const s=replies[cmd]||'ERR:UNKNOWN_COMMAND';
      status.value=new DataView(new TextEncoder().encode(s).buffer);
      notify({target:status});
    });
  }};
  const gatt={connected:false,async connect(){
    this.connected=true;
    return {getPrimaryService:async()=>({getCharacteristic:async uuid=>
      uuid==='beb5483e-36e1-4688-b7f5-ea07361b26a8'?status:tx})};
  },disconnect(){this.connected=false;disconnected?.();}};
  const device={name:'NEXUS-ESP32',gatt,addEventListener(_name,handler){disconnected=handler;}};
  return {bluetooth:{requestDevice:async()=>device},commands,device};
}

test('voz: temperatura, presión y humedad atraviesan el Action Registry local sin consultar la red',async()=>{
  const h=harness({online:false});
  try{
    const rig=bluetoothRig();
    h.loadVendor('hardware/bridge.js');
    h.window.NexusHardware=new h.window.NexusHardwareBridge({bluetooth:rig.bluetooth});
    await h.window.NexusHardware.connect();
    for(const [input,metric,value] of [
      ['Nexus, revisá temperatura','temperature',24.8],
      ['Nexus, revisa presion','pressure',1002.3],
      ['Nexus, decime humedad','humidity',55.6]
    ]){
      const plan=h.api.resolveIntent(input).local;
      assert.equal(plan.action,'read_hardware_sensor');
      assert.equal(plan.metric,metric);
      const result=await h.api.executeAssistantAction(plan,{speak:false,origin:'voice'});
      assert.equal(result.ok,true);
      assert.equal(result.data.value,value);
    }
    assert.deepEqual(rig.commands,['TEMP','PRESS','HUM']);
    assert.equal(h.calls.length,0);
  }finally{h.close();}
});

test('voz: focos individuales responden con su propio ACK sin afectar inventario',async()=>{
  const h=harness({online:false});
  try{
    const rig=bluetoothRig();
    h.loadVendor('hardware/bridge.js');
    h.window.NexusHardware=new h.window.NexusHardwareBridge({bluetooth:rig.bluetooth});
    await h.window.NexusHardware.connect();
    const first=h.api.resolveIntent('Nexus, prendé foco 1').local;
    const second=h.api.resolveIntent('Nexus, prendé foco dos').local;
    assert.deepEqual(JSON.parse(JSON.stringify([first.id,second.id])),[1,2]);
    assert.equal((await h.api.executeAssistantAction(first,{speak:false,origin:'voice'})).ok,true);
    const turn=await h.api.nexusAgentTurn('Nexus, prendé foco dos',{localOnly:true,speak:false});
    assert.match(turn.answer,/foco dos encendido/i);
    assert.deepEqual(rig.commands,['LED_ON','LED2_ON']);
    assert.equal(h.calls.length,0);
  }finally{h.close();}
});

test('offline: no se ejecuta un foco si el dispositivo no está conectado y otros módulos siguen activos',async()=>{
  const h=harness({online:false});
  try{
    h.loadVendor('hardware/bridge.js');
    const planned=h.api.resolveIntent('Nexus, prendé foco 1').local;
    const result=await h.api.executeAssistantAction(planned,{speak:false,origin:'voice'});
    assert.equal(result.ok,false);
    assert.match(result.error,/conectad/i);
    const inventory=await h.api.executeAssistantAction({action:'open_view',view:'inventory'},{speak:false});
    assert.equal(inventory.ok,true);
    assert.equal(h.api.resolveIntent('Nexus, prendé foco 3').local,null);
  }finally{h.close();}
});
