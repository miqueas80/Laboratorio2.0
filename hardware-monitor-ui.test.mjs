import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';

const flush=()=>new Promise(resolve=>setTimeout(resolve,40));

function setHardware(h){
  let connected=true;
  const listeners=[];
  let value=24;
  h.window.NexusHardware={
    get connected(){return connected;},
    subscribe(fn){listeners.push(fn);return()=>{};},
    async readMetric(metric){return {
      metric,value:metric==='temperature'?value:metric==='pressure'?1000:55,
      unit:metric==='temperature'?'°C':metric==='pressure'?'hPa':'%'
    };},
    async setLed(id,on){return {id,on};}
  };
  return {setValue:v=>{value=v;},disconnect(){
    connected=false;
    listeners.forEach(fn=>fn({connected:false}));
  }};
}

test('Hardware 2 UI mounts without touching the original assistant; stores a manual reading and draws a chart',async()=>{
  const h=harness({online:false});
  try{
    setHardware(h);
    h.loadVendor('hardware/monitor.js');
    h.loadVendor('hardware/monitor-ui.js');
    h.document.dispatchEvent(new h.window.Event('DOMContentLoaded'));
    await flush();
    assert.ok(h.window.NexusHardwareMonitoring);
    assert.ok(h.document.getElementById('hardwareLed1On'),'v1 original LED control retained');
    assert.ok(h.document.getElementById('hardwareMonitorStart'),'v2 monitoring control mounted');
    h.document.getElementById('hardwareMonitorRecord').click();
    await flush();
    const rows=await h.window.NexusHardwareMonitoring.getHistory();
    assert.equal(rows.length,1);
    assert.equal(rows[0].temperature,24);
    assert.ok(h.document.getElementById('hardwareMonitorChart').querySelector('circle'));
    assert.match(h.document.getElementById('hardwareMonitorChartSummary').textContent,/24/);
  }finally{h.window.NexusHardwareMonitoring?.stop();h.close();}
});

test('Hardware 2 UI only arms LED rule after explicit confirmation and stops on disconnect',async()=>{
  const h=harness({online:false});
  try{
    const hw=setHardware(h);
    h.loadVendor('hardware/monitor.js');
    h.loadVendor('hardware/monitor-ui.js');
    h.document.dispatchEvent(new h.window.Event('DOMContentLoaded'));
    await flush();
    const monitor=h.window.NexusHardwareMonitoring;
    h.document.getElementById('hardwareRuleAction').value='led2_on';
    h.document.getElementById('hardwareRuleAdd').click(); // harness confirm() always false
    assert.equal(monitor.rules.length,0);
    h.document.getElementById('hardwareRuleAction').value='alert';
    h.document.getElementById('hardwareRuleAdd').click();
    assert.equal(monitor.rules.length,1);
    h.document.getElementById('hardwareMonitorStart').click();
    await flush();
    assert.equal(monitor.running,true);
    hw.disconnect();
    assert.equal(monitor.running,false);
    assert.match(h.document.getElementById('hardwareMonitorStatus').textContent,/desconectad/i);
  }finally{h.window.NexusHardwareMonitoring?.stop();h.close();}
});
