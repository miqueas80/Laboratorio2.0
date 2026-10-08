/**
 * Fixed-height virtual scroller: O(visible rows) DOM elements for 100k+ records.
 * Rendering is scheduling-aware; memory targets require device-specific benchmarks.
 */
export function visibleRange({scrollTop=0,viewportHeight=600,rowHeight=48,count=0,overscan=8}={}) {
  if(!(rowHeight>0)||!(viewportHeight>=0)||count<0)throw Error('Geometría inválida');
  const start=Math.max(0,Math.floor(scrollTop/rowHeight)-overscan);
  const end=Math.min(count,Math.ceil((scrollTop+viewportHeight)/rowHeight)+overscan);
  return {start,end,top:start*rowHeight,bottom:Math.max(0,(count-end)*rowHeight)};
}
export function createVirtualList(container,{rowHeight=48,overscan=8,renderRow}={}){
  if(!container||typeof renderRow!=='function')throw Error('Contenedor o renderizador inválido');
  let rows=[],scheduled=false,disposed=false,frame=0;
  const document=container.ownerDocument;
  const top=document.createElement('div'),items=document.createElement('div'),bottom=document.createElement('div');
  container.replaceChildren(top,items,bottom);
  function draw(){
    scheduled=false;if(disposed)return;
    const range=visibleRange({scrollTop:container.scrollTop,viewportHeight:container.clientHeight||600,rowHeight,count:rows.length,overscan});
    top.style.height=range.top+'px';bottom.style.height=range.bottom+'px';
    const fragment=document.createDocumentFragment();
    for(let i=range.start;i<range.end;i++){const el=renderRow(rows[i],i);if(!el||el.nodeType!==1)throw Error('renderRow debe devolver un elemento DOM');el.style.minHeight=rowHeight+'px';fragment.appendChild(el)}
    items.replaceChildren(fragment);
  }
  const win=document.defaultView;
  const request=win?.requestAnimationFrame?.bind(win)||((fn)=>setTimeout(fn,0));
  const cancel=win?.cancelAnimationFrame?.bind(win)||clearTimeout;
  function schedule(){if(disposed||scheduled)return;scheduled=true;frame=request(draw)}
  container.addEventListener('scroll',schedule,{passive:true});
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;resize?.observe(container);
  draw();
  return {
    setRows(value){if(!Array.isArray(value))throw Error('Lista inválida');rows=value;schedule()},
    refresh:schedule,
    close(){disposed=true;cancel(frame);resize?.disconnect();container.removeEventListener('scroll',schedule);container.replaceChildren()}
  };
}
