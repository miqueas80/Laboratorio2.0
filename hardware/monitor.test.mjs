import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {IDBFactory} from 'fake-indexeddb';

function rig({store,idb=new IDBFactory(),initial={temperature:24,pressure:1000,humidity:55}}={}){
  const values={...initial},leds=[],notifications=[];
  const bridge={
    connected:true,
    async readMetric(metric){
      if(values[metric]===undefined)throw new Error('ESP32: ERR:NO_HUM');
      return {metric,value:values[metric],unit:{temperature:'°C',pressure:'hPa',humidity:'%'}[metric]};
    },
    async setLed(id,on){leds.push({id,on});return {id,on};},
    subscribe(fn){notifications.push(fn);return()=>notifications.splice(notifications.indexOf(fn),1);}
  };
  let now=Date.UTC(2026,10,3,12,0,0);
  const data=new Map();
  const localStorage=store||{getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const context={indexedDB:idb,localStorage,location:{pathname:'/Laboratorio2.0/'},console,Date,setTimeout,clearTimeout};
  context.globalThis=context;
  vm.runInNewContext(fs.readFileSync(new URL('./monitor.js',import.meta.url),'utf8'),context);
  const monitor=new context.NexusHardwareMonitor({bridge,indexedDB:idb,storage:localStorage,now:()=>now});
  return {monitor,bridge,values,leds,notifications,advance(ms){now+=ms;},storage:localStorage,idb};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('monitoring saves actual samples to scoped IndexedDB; CSV export and history are local',async()=>{
  const h=rig();
  const row=await h.monitor.recordOnce();
  assert.equal(row.temperature,24);
  assert.equal(row.pressure,1000);
  assert.equal(row.humidity,55);
  h.advance(60000);h.values.temperature=25.2;
  await h.monitor.recordOnce();
  const history=await h.monitor.getHistory({limit:10});
  assert.equal(history.length,2);
  assert.deepEqual(plain(history.map(x=>x.temperature)),[24,25.2]);
  assert.match(h.monitor.toCSV(history),/2026-11-03T12:01:00.000Z,25.2,1000,55/);
  assert.equal(h.monitor.dbName.includes('Laboratorio2.0'),true);
  h.monitor.stop();
});

test('invalid readings cannot enter history, and missing humidity is stored as null',async()=>{
  const h=rig({initial:{temperature:24,pressure:1000}});
  const row=await h.monitor.recordOnce();
  assert.equal(row.humidity,null);
  h.values.temperature=9000;
  await assert.rejects(h.monitor.recordOnce(),/fuera de rango/i);
  assert.equal((await h.monitor.getHistory()).length,1);
  h.monitor.stop();
});

test('local alert fires only on upward threshold crossing; no unsolicited LED action',async()=>{
  const h=rig();
  const rule=h.monitor.addRule({metric:'temperature',comparison:'above',threshold:28,action:'alert'});
  assert.equal(rule.action,'alert');
  await h.monitor.start(); // establishes baseline while explicitly running
  h.values.temperature=29;h.advance(60000);
  const result=await h.monitor.recordOnce({automation:true});
  assert.equal(result.alerts.length,1);
  assert.match(result.alerts[0].message,/temperatura/i);
  h.advance(60000);
  assert.equal((await h.monitor.recordOnce({automation:true})).alerts.length,0);
  assert.equal(h.leds.length,0);
  h.monitor.stop();
});

test('LED rules require explicit arming, fire on crossing and never run by default',async()=>{
  const h=rig();
  assert.throws(()=>h.monitor.addRule({metric:'humidity',comparison:'below',threshold:35,action:'led2_on'}),/habilit/i);
  h.monitor.addRule({metric:'humidity',comparison:'below',threshold:35,action:'led2_on',armed:true});
  await h.monitor.start(); // baseline humidity 55, automation explicitly running
  h.values.humidity=30;h.advance(60000);
  await h.monitor.recordOnce({automation:true});
  assert.deepEqual(plain(h.leds),[{id:2,on:true}]);
  h.advance(60000);
  await h.monitor.recordOnce({automation:true});
  assert.equal(h.leds.length,1);
  h.monitor.stop();
});

test('disconnected BLE stops monitoring and cannot fabricate samples or actuation',async()=>{
  const h=rig();
  h.monitor.addRule({metric:'temperature',comparison:'above',threshold:27,action:'led1_on',armed:true});
  h.bridge.connected=false;
  await assert.rejects(h.monitor.start(),/conect/i);
  assert.equal(h.monitor.running,false);
  await assert.rejects(h.monitor.recordOnce({automation:true}),/conect/i);
  assert.equal(h.leds.length,0);
  assert.equal((await h.monitor.getHistory()).length,0);
});

test('monitor interval and rules are validated and persist per application path',async()=>{
  const h=rig();
  assert.throws(()=>h.monitor.setIntervalMs(2000),/intervalo/i);
  h.monitor.setIntervalMs(120000);
  assert.equal(h.monitor.intervalMs,120000);
  assert.throws(()=>h.monitor.addRule({metric:'temperature',comparison:'above',threshold:NaN,action:'alert'}),/umbral/i);
  const rule=h.monitor.addRule({metric:'pressure',comparison:'below',threshold:950,action:'alert'});
  const next=new h.monitor.constructor({bridge:h.bridge,indexedDB:h.idb,storage:h.storage,now:()=>Date.UTC(2026,10,3,13)});
  assert.equal(next.intervalMs,120000);
  assert.equal(next.rules.length,1);
  assert.equal(next.rules[0].id,rule.id);
  next.removeRule(rule.id);
  assert.equal(next.rules.length,0);
  h.monitor.stop();
  next.stop();
});

test('stop prevents future polling or automatic actions',async()=>{
  const h=rig();
  h.monitor.addRule({metric:'temperature',comparison:'above',threshold:30,action:'led1_on',armed:true});
  await h.monitor.start();
  assert.equal(h.monitor.running,true);
  h.monitor.stop();
  assert.equal(h.monitor.running,false);
  h.values.temperature=32;
  await h.monitor.recordOnce();
  assert.equal(h.leds.length,0);
});
