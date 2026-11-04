/* NEXUS Hardware 2.0 panel — progressive enhancement; the v1 BLE and voice panel remain intact. */
(function(root){
'use strict';
const SVG='http://www.w3.org/2000/svg';
const LABELS={temperature:'Temperatura',pressure:'Presión',humidity:'Humedad'};
const UNITS={temperature:'°C',pressure:'hPa',humidity:'%'};
const ACTION_LABELS={
  alert:'Mostrar alerta',led1_on:'Encender foco 1',led1_off:'Apagar foco 1',
  led2_on:'Encender foco 2',led2_off:'Apagar foco 2'
};

function init(){
 const $=id=>document.getElementById(id);
 if(!$('hardwareMonitorPanel')||!root.NexusHardwareMonitor||!root.NexusHardware)return;
 const bridge=root.NexusHardware;
 const monitor=new root.NexusHardwareMonitor({bridge});
 root.NexusHardwareMonitoring=monitor;
 let graphRevision=0,lastRenderedAt='';
 const status=$('hardwareMonitorStatus');
 const feedback=(message)=>{status.textContent=message;};
 const fmtNumber=value=>String(value).replace('.',',');
 const fmtTime=t=>new Date(t).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 const text=(tag,content,attrs={})=>{
   const n=document.createElement(tag);n.textContent=content;
   for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);
   return n;
 };
 const makeSvg=(tag,attrs={},content)=>{
   const n=document.createElementNS(SVG,tag);
   for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));
   if(content!==undefined)n.textContent=String(content);
   return n;
 };
 const setReading=(metric,value)=>{
   const id={temperature:'hardwareTemp',pressure:'hardwarePressure',humidity:'hardwareHumidity'}[metric];
   if($(id))$(id).textContent=value===null?'No disponible':fmtNumber(value)+' '+UNITS[metric];
 };
 function renderChart(rows,metric){
   const svg=$('hardwareMonitorChart'),summary=$('hardwareMonitorChartSummary');
   svg.replaceChildren();
   const valid=rows.filter(r=>Number.isFinite(r[metric])&&r[metric]!==null);
   svg.setAttribute('aria-label','Historial de '+LABELS[metric].toLowerCase());
   if(!valid.length){
     summary.textContent='Sin lecturas de '+LABELS[metric].toLowerCase()+' en el período seleccionado.';
     return;
   }
   const w=640,left=42,right=16,top=22,bottom=176;
   const values=valid.map(r=>r[metric]),lo=Math.min(...values),hi=Math.max(...values);
   const margin=Math.max((hi-lo)*.12,.1);
   const min=lo-margin,max=hi+margin;
   const times=valid.map(r=>new Date(r.at).getTime());
   const start=Math.min(...times),end=Math.max(...times);
   const x=t=>end===start?(left+(w-right))/2:left+(t-start)/(end-start)*(w-right-left);
   const y=v=>bottom-(v-min)/(max-min)*(bottom-top);
   for(let i=0;i<=3;i++){
     const gy=top+(bottom-top)*i/3;
     svg.append(makeSvg('line',{x1:left,y1:gy,x2:w-right,y2:gy,stroke:'currentColor','stroke-opacity':.14,'stroke-dasharray':'4 6'}));
   }
   const path=valid.map((r,i)=>(i?'L':'M')+x(times[i]).toFixed(2)+','+y(r[metric]).toFixed(2)).join(' ');
   svg.append(makeSvg('path',{d:path,fill:'none',stroke:'currentColor','stroke-width':2.5,'stroke-linecap':'round','stroke-linejoin':'round'}));
   const last=valid.at(-1);
   svg.append(makeSvg('circle',{cx:x(new Date(last.at).getTime()),cy:y(last[metric]),r:4.8,fill:'currentColor'}));
   const textProps={'font-size':12,fill:'currentColor'};
   svg.append(makeSvg('text',{x:2,y:top+3,...textProps},fmtNumber(hi)));
   svg.append(makeSvg('text',{x:2,y:bottom+3,...textProps},fmtNumber(lo)));
   svg.append(makeSvg('text',{x:left,y:204,...textProps},fmtTime(valid[0].at)));
   svg.append(makeSvg('text',{x:w-right,y:204,'text-anchor':'end',...textProps},fmtTime(last.at)));
   summary.textContent=LABELS[metric]+': '+fmtNumber(last[metric])+' '+UNITS[metric]+
     ' · '+valid.length+' muestras · mínimo '+fmtNumber(lo)+' · máximo '+fmtNumber(hi)+'.';
 }
 async function refreshChart(){
   const rev=++graphRevision;
   const since=Date.now()-Number($('hardwareMonitorRange').value);
   const metric=$('hardwareMonitorMetric').value;
   try{
     const rows=await monitor.getHistory({limit:5000,since});
     if(rev!==graphRevision)return;
     renderChart(rows,metric);
   }catch(error){if(rev===graphRevision)$('hardwareMonitorChartSummary').textContent='No se pudo leer el historial: '+(error.message||error);}
 }
 function renderRules(){
   const host=$('hardwareRulesList');
   host.replaceChildren();
   if(!monitor.rules.length){host.append(text('p','Sin reglas configuradas.'));return;}
   for(const rule of monitor.rules){
     const line=text('div','',{'class':'task'});
     const comparison=rule.comparison==='above'?'mayor que':'menor que';
     const description=LABELS[rule.metric]+' '+comparison+' '+fmtNumber(rule.threshold)+' '+UNITS[rule.metric]+
       ' → '+ACTION_LABELS[rule.action]+(rule.armed?' · autorizada':'');
     line.append(text('span',description));
     const remove=text('button','Quitar',{'class':'btn','type':'button','aria-label':'Quitar regla: '+description});
     remove.onclick=()=>{
       try{monitor.removeRule(rule.id);}catch(error){feedback('No se pudo quitar la regla: '+(error.message||error));}
     };
     line.append(remove);
     host.append(line);
   }
 }
 function renderAlerts(){
   const host=$('hardwareMonitorAlerts');host.replaceChildren();
   if(!monitor.alerts.length){host.textContent='Sin alertas en esta sesión.';return;}
   for(const a of monitor.alerts.slice(0,5)){
     const outcome=a.action==='alert'?'Aviso':a.confirmed?'Foco confirmado':a.error||'Acción no confirmada';
     host.append(text('p',fmtTime(a.at)+' · '+a.message+' · '+outcome));
   }
 }
 function render(){
   const connected=Boolean(bridge.connected),s=monitor.snapshot();
   $('hardwareMonitorStart').disabled=!connected||s.running||s.busy;
   $('hardwareMonitorStop').disabled=!s.running;
   $('hardwareMonitorRecord').disabled=!connected||s.busy;
   $('hardwareMonitorInterval').value=String(s.intervalMs);
   if(s.error)status.textContent=s.error;
   else status.textContent=s.running?'Monitoreo activo · muestras cada '+s.intervalMs/1000+' s · solo con app en primer plano':
     connected?'Detenido · ESP32 conectada. Podés iniciar.':'Detenido · conectá la ESP32.';
   if(s.last){
     setReading('temperature',s.last.temperature);
     setReading('pressure',s.last.pressure);
     setReading('humidity',s.last.humidity);
     if(lastRenderedAt!==s.last.at){lastRenderedAt=s.last.at;refreshChart();}
   }
   for(const a of s.alerts){
     if(a.confirmed&&a.action.startsWith('led')){
       const m=/^led([12])_(on|off)$/.exec(a.action);
       if(m){const target=$('hardwareLed'+m[1]+'State');if(target)target.textContent=m[2]==='on'?'Encendido':'Apagado';}
     }
   }
   renderRules();
   renderAlerts();
 }
 monitor.subscribe(render);
 bridge.subscribe(render);
 $('hardwareMonitorStart').onclick=async()=>{
   try{await monitor.start();}catch(error){feedback('No se pudo iniciar: '+(error.message||error));}
 };
 $('hardwareMonitorStop').onclick=()=>monitor.stop();
 $('hardwareMonitorRecord').onclick=async()=>{
   try{await monitor.recordOnce();}catch(error){feedback('No se pudo registrar: '+(error.message||error));}
 };
 $('hardwareMonitorInterval').onchange=event=>{
   try{monitor.setIntervalMs(Number(event.target.value));}
   catch(error){feedback(error.message||String(error));}
 };
 $('hardwareMonitorMetric').onchange=refreshChart;
 $('hardwareMonitorRange').onchange=refreshChart;
 $('hardwareMonitorCSV').onclick=async()=>{
   try{
     const rows=await monitor.getHistory({limit:5000});
     if(!rows.length){feedback('Todavía no hay mediciones para exportar.');return;}
     const blob=new Blob([monitor.toCSV(rows)],{type:'text/csv;charset=utf-8'});
     const url=URL.createObjectURL(blob);
     const a=document.createElement('a');a.href=url;a.download='NEXUS-Hardware-2-historial.csv';
     document.body.append(a);a.click();a.remove();
     setTimeout(()=>URL.revokeObjectURL(url),1000);
   }catch(error){feedback('No se pudo exportar: '+(error.message||error));}
 };
 $('hardwareRuleAdd').onclick=()=>{
   try{
     const action=$('hardwareRuleAction').value;
     let armed=false;
     if(action!=='alert'){
       const who=ACTION_LABELS[action];
       armed=root.confirm('¿Autorizás la regla automática «'+who+'» al cruzar el umbral? Se ejecutará solo mientras actives el monitoreo, con Bluetooth conectado y la app en primer plano.');
       if(!armed)return;
     }
     const input=$('hardwareRuleThreshold').value.trim().replace(',','.');
     monitor.addRule({
       metric:$('hardwareRuleMetric').value,
       comparison:$('hardwareRuleComparison').value,
       threshold:input===''?NaN:Number(input),
       action,armed
     });
     feedback('Regla registrada. Solo se evaluará al iniciar el monitoreo.');
   }catch(error){feedback('No se pudo crear la regla: '+(error.message||error));}
 };
 document.addEventListener('visibilitychange',()=>{
   if(document.hidden&&monitor.running)monitor.stop('Monitoreo detenido al pasar a segundo plano. Reinicialo al volver.');
 });
 root.addEventListener('pagehide',()=>monitor.stop());
 render();
 refreshChart();
}
if(root.document){
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else setTimeout(init,0);
}
})(globalThis);
