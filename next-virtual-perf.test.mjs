import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {visibleRange,createVirtualList} from './next/virtual-list.js';

const pause=()=>new Promise(resolve=>setTimeout(resolve,45));

test('Virtual list 100001 ítems conserva <=40 nodos de contenido',async()=>{
 const dom=new JSDOM('<div id="scroller"></div>');
 const el=dom.window.document.querySelector('#scroller');
 Object.defineProperty(el,'clientHeight',{value:320});
 const rows=Array.from({length:100001},(_,i)=>({id:'row-'+i}));
 let renders=0;
 const list=createVirtualList(el,{rowHeight:40,overscan:5,renderRow:r=>{
  renders++;const row=dom.window.document.createElement('div');row.textContent=r.id;return row;
 }});
 try{
  list.setRows(rows);await pause();
  assert.ok(el.querySelectorAll('div').length<40);
  const before=list.metrics(),first=el.textContent;
  // Small offset within the same visible range must skip the DOM update.
  el.scrollTop=4;el.dispatchEvent(new dom.window.Event('scroll'));
  await pause();
  assert.equal(list.metrics().created,before.created);
  assert.equal(list.metrics().unchangedFrames,before.unchangedFrames+1);
  assert.equal(el.textContent,first);
  el.scrollTop=40*3;el.dispatchEvent(new dom.window.Event('scroll'));
  await pause();
  assert.ok(list.metrics().reused>0);
  assert.ok(list.metrics().created<60);
  // Deep scroll remains bounded even with a massive source array.
  el.scrollTop=40*88000;el.dispatchEvent(new dom.window.Event('scroll'));
  await pause();
  assert.ok(el.textContent.includes('row-88000'));
  assert.ok(list.metrics().visible<40);
  assert.equal(list.metrics().count,100001);
 }finally{list.close();assert.equal(el.children.length,0);dom.window.close()}
});
test('Virtual list does not retain old DOM when data source is replaced',async()=>{
 const dom=new JSDOM('<div></div>');
 const el=dom.window.document.querySelector('div');
 Object.defineProperty(el,'clientHeight',{value:120});
 let count=0;
 const list=createVirtualList(el,{rowHeight:30,overscan:2,renderRow:r=>{
  count++;const row=dom.window.document.createElement('div');row.textContent=r;return row;
 }});
 try{
  list.setRows(['a','b','c','d','e']);await pause();
  const first=count;
  list.setRows(['z']);await pause();
  assert.equal(el.textContent,'z');
  assert.ok(count>first);
  assert.equal(list.metrics().visible,1);
 }finally{list.close();dom.window.close()}
});
test('VisibleRange rejects invalid geometry without rendering',()=>{
 assert.throws(()=>visibleRange({count:-1}),/Geometría/);
 assert.throws(()=>visibleRange({count:100,rowHeight:0}),/Geometría/);
 assert.throws(()=>visibleRange({count:100,viewportHeight:NaN}),/Geometría/);
 assert.equal(visibleRange({count:100,rowHeight:20,viewportHeight:80,overscan:2}).end,6);
});
