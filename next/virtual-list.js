/**
 * Fixed-height virtual scroller with windowed DOM reuse for 100k+ records.
 *
 * - A scroll event coalesces into one requestAnimationFrame.
 * - Unchanged visible ranges produce zero DOM mutation.
 * - Overlapping rows retain their DOM nodes across window shifts.
 * - setRows() invalidates stale rows, useful after inventory updates.
 *
 * The 60 FPS and memory targets must still be measured on an Android device.
 */
export function visibleRange({scrollTop=0,viewportHeight=600,rowHeight=48,count=0,overscan=8}={}){
 if(!Number.isFinite(scrollTop)||!Number.isFinite(viewportHeight)||
    !Number.isFinite(rowHeight)||!Number.isFinite(count)||!Number.isFinite(overscan)||
    !(rowHeight>0)||viewportHeight<0||count<0||!Number.isInteger(count)||overscan<0)
  throw Error('Geometría inválida');
 const clamped=Math.max(0,scrollTop);
 const start=Math.max(0,Math.floor(clamped/rowHeight)-overscan);
 const end=Math.min(count,Math.ceil((clamped+viewportHeight)/rowHeight)+overscan);
 return {start,end,top:start*rowHeight,bottom:Math.max(0,(count-end)*rowHeight)};
}
export function createVirtualList(container,{rowHeight=48,overscan=8,renderRow}={}){
 if(!container||typeof renderRow!=='function'||!(rowHeight>0))throw Error('Contenedor o renderizador inválido');
 let rows=[],scheduled=false,disposed=false,frame=0,dirty=true,lastStart=-1,lastEnd=-1;
 let reused=0,created=0,frames=0,unchangedFrames=0;
 const document=container.ownerDocument,win=document.defaultView;
 const top=document.createElement('div'),items=document.createElement('div'),bottom=document.createElement('div');
 top.setAttribute('aria-hidden','true');bottom.setAttribute('aria-hidden','true');
 container.replaceChildren(top,items,bottom);
 let current=new Map();
 function draw(){
  scheduled=false;
  if(disposed)return;
  frames++;
  const range=visibleRange({scrollTop:container.scrollTop,
   viewportHeight:container.clientHeight||600,rowHeight,count:rows.length,overscan});
  if(!dirty&&range.start===lastStart&&range.end===lastEnd){
   unchangedFrames++;return;
  }
  const next=new Map(),fragment=document.createDocumentFragment();
  for(let i=range.start;i<range.end;i++){
   let element=!dirty?current.get(i):null;
   if(element)reused++;
   else{
    element=renderRow(rows[i],i);
    if(!element||element.nodeType!==1)throw Error('renderRow debe devolver un elemento DOM');
    element.style.boxSizing='border-box';
    element.style.minHeight=rowHeight+'px';
    element.style.height=rowHeight+'px';
    created++;
   }
   next.set(i,element);fragment.appendChild(element);
  }
  // Updating children only when range changes; old nodes are reused.
  items.replaceChildren(fragment);
  if(lastStart!==range.start||dirty)top.style.height=range.top+'px';
  if(lastEnd!==range.end||dirty)bottom.style.height=range.bottom+'px';
  current=next;lastStart=range.start;lastEnd=range.end;dirty=false;
 }
 const request=win?.requestAnimationFrame?.bind(win)||((fn)=>setTimeout(fn,0));
 const cancel=win?.cancelAnimationFrame?.bind(win)||clearTimeout;
 function schedule(){
  if(disposed||scheduled)return;
  scheduled=true;frame=request(draw);
 }
 container.addEventListener('scroll',schedule,{passive:true});
 const Observer=win?.ResizeObserver;
 const resize=typeof Observer==='function'?new Observer(schedule):null;
 resize?.observe(container);
 draw();
 return {
  setRows(value){
   if(!Array.isArray(value))throw Error('Lista inválida');
   rows=value;dirty=true;current.clear();schedule();
  },
  refresh:schedule,
  metrics:()=>({frames,unchangedFrames,created,reused,visible:current.size,count:rows.length,
   start:lastStart,end:lastEnd}),
  close(){
   if(disposed)return;
   disposed=true;cancel(frame);resize?.disconnect();
   container.removeEventListener('scroll',schedule);
   current.clear();rows=[];container.replaceChildren();
  }
 };
}
