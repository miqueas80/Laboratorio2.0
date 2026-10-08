import test from 'node:test';
import assert from 'node:assert/strict';
import {EDGE_RELEASE_CHECKS,evaluateEdgeRelease,createEdgeAcceptanceReport} from './next/acceptance.js';

const manual=Object.fromEntries(EDGE_RELEASE_CHECKS.filter(x=>x.kind==='manual').map(x=>[x.id,true]));
const automatic=Object.fromEntries(EDGE_RELEASE_CHECKS.filter(x=>x.kind==='automatic').map(x=>[x.id,true]));
const good={averageFPS:60.2,p95FrameMs:16.53,frames:70,mode:'active-virtual-scroll'};
test('Release gate refuses a green status when physical Android evidence is absent',()=>{
 const result=evaluateEdgeRelease({automatic,performance:good});
 assert.equal(result.ready,false);
 assert.equal(result.missing.filter(x=>x.kind==='manual').length,7);
 assert.equal(result.passedCount,EDGE_RELEASE_CHECKS.length-7);
});
test('Release gate blocks unsupported device RAM claims, document gaps and missing SDS review',()=>{
 const automaticChecks={...automatic,memory80:false,documents6:false};
 const human={...manual,chemicalReview:false};
 const result=evaluateEdgeRelease({automatic:automaticChecks,manual:human,performance:good});
 assert.equal(result.ready,false);
 assert.deepEqual(result.missing.map(x=>x.id).sort(),['chemicalReview','documents6','memory80']);
});
test('Only exact boolean evidence qualifies, never truthy strings or simulated values',()=>{
 const result=evaluateEdgeRelease({automatic:{...automatic,memory80:'true'},
  manual:{...manual,cameraQr:1},performance:good});
 assert.equal(result.ready,false);assert.equal(result.missing.length,2);
});
test('Passing report requires every hardware and automatic gate, and p95 screen test is preserved',()=>{
 const result=evaluateEdgeRelease({automatic,manual,performance:good});
 assert.equal(result.ready,true);assert.equal(result.status,'READY_FOR_HUMAN_RELEASE_REVIEW');
 const borderline=evaluateEdgeRelease({automatic:{...automatic,fps100k:false},manual,
  performance:{averageFPS:60.1,p95FrameMs:16.8}});
 assert.equal(borderline.ready,false);assert.ok(borderline.notes.some(x=>/p95/.test(x)));
});
test('Exported acceptance report contains only a fixed allowlist, never user content',()=>{
 const report=createEdgeAcceptanceReport({automatic:{...automatic,extra:'EXFILTRATE'},
  manual:{...manual,extra:'EXFILTRATE'},performance:good,source:'private_data'});
 assert.equal(report.source,'NEXUS-X Edge RC');
 assert.equal(report.decision.ready,true);
 const json=JSON.stringify(report);
 assert.doesNotMatch(json,/EXFILTRATE|private_data/);
 assert.ok(!Object.keys(report).some(key=>/image|audio|token|device|document|chemical/i.test(key)));
 assert.deepEqual(Object.keys(report.performance).sort(),['averageFPS','frames','mode','p95FrameMs']);
});
