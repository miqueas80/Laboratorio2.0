import test from 'node:test';
import assert from 'node:assert/strict';
import {ChemicalSafetyClient} from './next/chemical-client.js';
import {evaluateStorage} from './next/chemical-engine.js';

class FakeChemicalWorker {
 constructor(){this.closed=false;this.onmessage=null;this.onerror=null}
 postMessage(data){
  queueMicrotask(()=>{
   if(this.closed)return;
   try{const result=evaluateStorage(data.records,data.options);
    this.onmessage?.({data:{id:data.id,result:{...result,engine:'local-web-worker'}}})}
   catch(error){this.onmessage?.({data:{id:data.id,error:error.message}})}
  });
 }
 terminate(){this.closed=true}
}
class HangingWorker {
 constructor(){this.closed=false}
 postMessage(){}
 terminate(){this.closed=true}
}
test('Client químico devuelve advertencias sin bloquear el hilo principal',async()=>{
 const client=new ChemicalSafetyClient({WorkerConstructor:FakeChemicalWorker});
 try{
  const oxid=(id,c)=>({id,location:'Armario A',
   safety:{verified:true,source:'SDS declarada',hazardClasses:c}});
  const result=await client.evaluate([oxid('a',['oxidizer']),oxid('b',['flammable'])]);
  assert.equal(result.alerts.length,1);
  assert.equal(result.alerts[0].code,'OXIDIZER_FLAMMABLE');
  assert.equal(result.engine,'local-web-worker');
  assert.equal(result.reviewRequired,true);
 }finally{client.close()}
});
test('Client limita el número máximo de filas antes de copiar datos al Worker',()=>{
 const client=new ChemicalSafetyClient({WorkerConstructor:FakeChemicalWorker});
 try{assert.throws(()=>client.evaluate(new Array(300001)),/excede límites/)}
 finally{client.close()}
});
test('Client termina el Worker si se cancela la consulta',async()=>{
 const client=new ChemicalSafetyClient({WorkerConstructor:HangingWorker,timeoutMs:1000});
 try{
  const abort=new AbortController();
  const pending=client.evaluate([],{signal:abort.signal});
  abort.abort();
  await assert.rejects(pending,/cancelado/);
  assert.equal(client.worker,null);
 }finally{client.close()}
});
test('Un Worker fallido solo se reinicia ante otra consulta explícita',async()=>{
 const client=new ChemicalSafetyClient({WorkerConstructor:HangingWorker,timeoutMs:2000});
 try{
  const pending=client.evaluate([]);
  const old=client.worker;
  old.onerror?.({});
  await assert.rejects(pending,/falló/);
  assert.equal(old.closed,true);
  assert.equal(client.worker,null);
  const pending2=client.evaluate([]);
  assert.notEqual(client.worker,old);
  client.close();
  await assert.rejects(pending2,/cerrado/);
 }finally{client.close()}
});
