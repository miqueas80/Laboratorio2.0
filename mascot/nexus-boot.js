/* NEXUS-X · Apertura visual aislada. No inicia motores, consultas ni sesiones de voz. */
(function(){
'use strict';
function startBoot(){
  var splash=document.getElementById('nexus-boot-splash');
  if(!splash)return;
  var timers=[];
  var stopped=false;
  function later(fn,delay){timers.push(window.setTimeout(function(){if(!stopped&&splash.isConnected)fn()},delay))}
  function finish(){
    if(stopped)return;
    stopped=true;
    timers.forEach(window.clearTimeout);
    splash.remove();
    var app=document.querySelector('.app');
    if(app)app.removeAttribute('inert');
    document.documentElement.dataset.nexusBoot='complete';
  }
  var skip=document.getElementById('nexus-boot-skip');
  if(skip)skip.addEventListener('click',finish);
  // Respetar movimiento reducido y no bloquear el arranque de NEXUS-X.
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  if(reduce){later(finish,1100);return}
  later(function(){splash.dataset.phase='flight';document.documentElement.dataset.nexusBoot='flight'},1650);
  later(function(){splash.dataset.phase='reveal';document.documentElement.dataset.nexusBoot='reveal'},2920);
  later(finish,3800);
  document.addEventListener('visibilitychange',function(){
    if(document.hidden&&splash.isConnected)finish();
  },{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',startBoot,{once:true});
else startBoot();
})();
