import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateStorage,inspectSafety,validCAS} from './next/chemical-engine.js';

const row=(id,classes,location='Armario A')=>({id,location,
 safety:{verified:true,source:'SDS fabricante / revisión declarada',hazardClasses:classes}});

test('SDS autocertificada es solo una declaración, nunca verificación externa',()=>{
 const info=inspectSafety(row('s1',['oxidizer']));
 assert.equal(info.evidence,'self-declared');
 assert.equal(info.complete,true);
 const unknown=inspectSafety(row('s2',[]));
 assert.equal(unknown.valid,true);
 assert.equal(unknown.complete,false);
 assert.equal(inspectSafety({id:'s3',safety:{verified:false,source:'SDS no comprobada',hazardClasses:['flammable']}}).valid,false);
});
test('CAS inválido o ausente de procedencia no prueba identidad química',()=>{
 assert.equal(validCAS('64-17-5'),true);
 assert.equal(validCAS('64-17-6'),false);
 assert.equal(inspectSafety({id:'wrong',safety:{
  verified:true,source:'Documento dudoso',cas:'64-17-6',hazardClasses:['flammable']
 }}).valid,false);
});
test('Reglas de incompatibilidad alertan solo pares en una misma zona declarada',()=>{
 const report=evaluateStorage([
  row('oxid',['oxidizer'],'Armario 1'),row('fuel',['flammable'],'armario 1'),
  row('other',['flammable'],'Armario 2')]);
 assert.equal(report.alerts.length,1);
 assert.deepEqual(report.alerts[0].ids,['fuel','oxid']);
 assert.equal(report.alerts[0].code,'OXIDIZER_FLAMMABLE');
 assert.equal(report.assessedLocations,2);
 assert.equal(report.status,'INCOMPATIBILITY_WARNING');
 assert.equal(report.reviewRequired,true);
});
test('Ausencia de alertas no se transforma en certificado de almacenamiento seguro',()=>{
 const report=evaluateStorage([row('unknown',[]),row('missing',['oxidizer'],null),
  {id:'unverified',location:'Armario 1'}]);
 assert.equal(report.alerts.length,0);
 assert.equal(report.status,'INCOMPLETE_EVIDENCE');
 assert.equal(report.reviewRequired,true);
 assert.equal(report.unresolvedCount,3);
 assert.deepEqual(report.unresolved,{invalidSDS:1,missingLocation:1,unknownHazards:1});
 assert.match(report.disclaimer,/NO demuestra almacenamiento seguro/i);
});
test('Dos grupos con doble clase no generan la misma advertencia duplicada',()=>{
 const report=evaluateStorage([
  row('a',['oxidizer','flammable']),row('b',['oxidizer','flammable'])]);
 assert.equal(report.alerts.length,1);
 assert.deepEqual(report.alerts[0].ids,['a','b']);
});
test('Hasta 100.001 sustancias desconocidas no generan comparaciones cuadráticas',()=>{
 const items=Array.from({length:100001},(_,i)=>({id:'nx-'+i,location:'Armario A'}));
 const started=performance.now();
 const report=evaluateStorage(items);
 assert.equal(report.alerts.length,0);
 assert.equal(report.unresolvedCount,100001);
 assert.equal(report.unverified.length,5000);
 assert.equal(report.status,'INCOMPLETE_EVIDENCE');
 assert.equal(report.reviewRequired,true);
 // Guardrail generous for noisy shared CI runner: avoid pathological O(n^2).
 assert.ok(performance.now()-started<15000);
});
test('Alertas químicas masivas se limitan y muestran truncamiento inequívoco',()=>{
 const items=[
  ...Array.from({length:250},(_,i)=>row('oxid-'+i,['oxidizer'])),
  ...Array.from({length:250},(_,i)=>row('fuel-'+i,['flammable']))
 ];
 const report=evaluateStorage(items,{maxAlerts:17});
 assert.equal(report.alerts.length,17);
 assert.equal(report.truncated,true);
 assert.equal(report.status,'INCOMPLETE_ALERT_LIMIT');
 assert.equal(report.reviewRequired,true);
});
test('No acepta configuraciones de alerta que oculten todas las coincidencias',()=>{
 assert.throws(()=>evaluateStorage([],{maxAlerts:0}),/Límites/);
 assert.throws(()=>evaluateStorage([],{maxUnverified:0}),/Límites/);
});
