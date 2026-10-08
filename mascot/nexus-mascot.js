/* NEXUS-X · Mascota de prueba aislada. No toca el agente, la voz ni la base de datos. */
(function(){
'use strict';
function mount(){
  if(document.getElementById('nexus-mascot-host'))return;
  var host=document.createElement('div');
  host.id='nexus-mascot-host';
  var shadow=host.attachShadow({mode:'open'});
  var style=document.createElement('style');
  style.textContent="\n:host{all:initial;position:fixed;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:19;font-family:Inter,system-ui,-apple-system,\"Segoe UI\",sans-serif;color:#eaf8ff;pointer-events:none}\n*{box-sizing:border-box}\n.nm{width:86px;display:flex;align-items:flex-end;flex-direction:column;gap:8px;pointer-events:none}\n.nm button{font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}\n.nm button:focus-visible{outline:3px solid #77f1ff;outline-offset:3px}\n.nm-launcher{width:78px;height:78px;border:1px solid #83f5ff;border-radius:24px;position:relative;display:grid;place-items:center;background:radial-gradient(circle at 30% 20%,#22567e,#07192d 73%);box-shadow:0 8px 24px #00132080,0 0 18px #18c7ff65;pointer-events:auto;transition:transform .2s ease,box-shadow .2s ease}\n.nm-launcher::after{content:\"\";position:absolute;inset:5px;border:1px solid #48d8ff59;border-radius:19px;pointer-events:none}\n.nm-launcher:hover{transform:translateY(-4px) scale(1.04);box-shadow:0 12px 35px #00243d90,0 0 24px #1dd8ff90}\n.nm-launcher img{width:82px;height:82px;object-fit:contain;filter:drop-shadow(0 3px 7px #0007);animation:nm-float 3.6s ease-in-out infinite;transform-origin:50% 55%}\n.nm-dot{position:absolute;top:6px;right:5px;width:10px;height:10px;border-radius:100%;background:#4ef7b1;border:2px solid #0b233b;box-shadow:0 0 8px #4ef7b18f}\n.nm-label{position:absolute;bottom:-7px;left:50%;transform:translateX(-50%);background:#0c3457;padding:1px 7px;border:1px solid #55ccf2;border-radius:9px;color:#e5faff;font-size:10px;font-weight:800;letter-spacing:.9px}\n.nm-hello{position:absolute;right:89px;bottom:13px;width:173px;max-width:calc(100vw - 115px);padding:10px 13px;background:#082138ed;border:1px solid #5dcdfa;border-radius:13px;box-shadow:0 6px 20px #0005;font-size:12px;line-height:1.45;opacity:0;transform:translateX(8px) scale(.95);transition:opacity .24s ease,transform .24s ease;pointer-events:none}\n.nm-hello[data-show=\"true\"]{opacity:1;transform:none}\n.nm-hello::after{content:\"\";position:absolute;right:-6px;bottom:18px;width:10px;height:10px;background:#082138;transform:rotate(45deg);border-top:1px solid #5dcdfa;border-right:1px solid #5dcdfa}\n.nm-panel{position:absolute;right:0;bottom:95px;width:min(306px,calc(100vw - 24px));padding:0;border:1px solid #55cfff80;border-radius:18px;background:linear-gradient(155deg,#123c5a 0%,#061526 75%);box-shadow:0 16px 48px #011124ae,0 0 24px #007dda45;opacity:0;visibility:hidden;transform:translateY(9px) scale(.97);transform-origin:bottom right;transition:opacity .22s ease,transform .22s ease,visibility .22s;pointer-events:none}\n.nm-panel[data-open=\"true\"]{opacity:1;visibility:visible;transform:none;pointer-events:auto}\n.nm-panel-head{display:flex;gap:10px;align-items:center;border-bottom:1px solid #a4e9ff29;padding:12px 13px}\n.nm-head-avatar{width:38px;height:38px;flex:0 0 auto;background:#0e5277;border-radius:50%;display:grid;place-items:center;overflow:hidden;border:1px solid #61d8ff}\n.nm-head-avatar img{width:48px;height:48px}\n.nm-name{font-size:14px;font-weight:800;color:#fff}\n.nm-subtitle{font-size:10px;color:#91d8ef;margin-top:2px}\n.nm-x{margin-left:auto;align-self:flex-start;padding:4px 8px;border-radius:8px;color:#c5eaff;background:#ffffff10;border:1px solid #ffffff20}\n.nm-panel-body{padding:14px 13px}\n.nm-panel-body p{margin:0 0 13px;font-size:12px;line-height:1.55;color:#dbf5ff}\n.nm-main{width:100%;background:#087bb7;color:white;border:1px solid #57dfff;border-radius:9px;min-height:43px;font-size:13px;font-weight:700;box-shadow:0 3px 12px #008ef54b}\n.nm-main:hover{background:#1194cb}\n.nm-quick{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}\n.nm-quick button{background:#ffffff0c;color:#ddf5ff;border:1px solid #6edfff47;min-height:40px;border-radius:9px;font-size:11px;padding:8px 4px}\n.nm-quick button:hover{background:#1f5478}\n.nm-foot{display:block;text-align:center;margin-top:10px;color:#8cbbcf;font-size:10px}\n@keyframes nm-float{0%,100%{transform:translateY(1px) rotate(-1deg)}50%{transform:translateY(-4px) rotate(2deg)}}\n@media(max-width:600px){:host{right:9px;bottom:calc(9px + env(safe-area-inset-bottom,0px))}.nm{width:74px}.nm-launcher{height:68px;width:68px;border-radius:20px}.nm-launcher img{width:74px;height:74px}.nm-panel{bottom:82px}.nm-hello{right:78px}}\n@media(prefers-reduced-motion:reduce){.nm-launcher img{animation:none}.nm-launcher,.nm-hello,.nm-panel{transition:none}}\n";
  shadow.appendChild(style);
  var wrapper=document.createElement('div');
  wrapper.innerHTML="<div class=\"nm\">\n<div class=\"nm-hello\" id=\"nm-hello\" data-show=\"false\" aria-live=\"polite\">¡Hola! Soy NEXUS 👋<br>¿Te ayudo en el laboratorio?</div>\n<section class=\"nm-panel\" id=\"nm-panel\" data-open=\"false\" aria-label=\"Asistente NEXUS\" aria-hidden=\"true\">\n  <header class=\"nm-panel-head\"><span class=\"nm-head-avatar\"><img src=\"./mascot/nexus-mascot.svg\" alt=\"\"></span><span><span class=\"nm-name\">NEXUS</span><span class=\"nm-subtitle\" style=\"display:block\">Tu asistente local</span></span><button class=\"nm-x\" id=\"nm-close\" type=\"button\" aria-label=\"Cerrar panel\">✕</button></header>\n  <div class=\"nm-panel-body\"><p>¡Hola! Estoy acá para ayudarte. Seguimos usando la NEXUS IA original: sin crear otro motor de voz ni reemplazar ninguna función.</p>\n  <button class=\"nm-main\" type=\"button\" data-nm-view=\"ai\">✦ Conversar con NEXUS IA</button>\n  <div class=\"nm-quick\"><button type=\"button\" data-nm-view=\"inventory\">⚗ Inventario</button><button type=\"button\" data-nm-view=\"documents\">▤ Documentos</button><button type=\"button\" data-nm-view=\"lens\">◉ NEXUS Lens</button><button type=\"button\" data-nm-view=\"ai\">✦ Agente local</button></div>\n  <small class=\"nm-foot\">Funciona sin Internet · No activa el micrófono</small></div>\n</section>\n<button class=\"nm-launcher\" id=\"nm-launcher\" type=\"button\" aria-label=\"Abrir asistente NEXUS\" aria-expanded=\"false\" aria-controls=\"nm-panel\"><img src=\"./mascot/nexus-mascot.svg\" alt=\"\"><span class=\"nm-dot\" aria-hidden=\"true\"></span><span class=\"nm-label\">NEXUS</span></button>\n</div>";
  shadow.appendChild(wrapper);
  document.body.appendChild(host);
  var launcher=shadow.getElementById('nm-launcher');
  var panel=shadow.getElementById('nm-panel');
  var close=shadow.getElementById('nm-close');
  var hello=shadow.getElementById('nm-hello');
  var greetingTimeout=0;
  function hideGreeting(){window.clearTimeout(greetingTimeout);hello.dataset.show='false'}
  function togglePanel(open){
    panel.dataset.open=open?'true':'false';
    panel.setAttribute('aria-hidden',open?'false':'true');
    launcher.setAttribute('aria-expanded',open?'true':'false');
    launcher.setAttribute('aria-label',open?'Cerrar asistente NEXUS':'Abrir asistente NEXUS');
    hideGreeting();
  }
  launcher.addEventListener('click',function(){togglePanel(panel.dataset.open!=='true')});
  close.addEventListener('click',function(){togglePanel(false);launcher.focus()});
  shadow.querySelectorAll('[data-nm-view]').forEach(function(btn){
    btn.addEventListener('click',function(){
      var route=btn.getAttribute('data-nm-view');
      var nav=document.querySelector('.nav-btn[data-view="'+route+'"]');
      if(nav){nav.click();togglePanel(false)}
    });
  });
  document.addEventListener('keydown',function(event){
    if(event.key==='Escape'&&panel.dataset.open==='true'){togglePanel(false);launcher.focus()}
  });
  document.addEventListener('click',function(event){
    if(panel.dataset.open==='true'&&!event.composedPath().includes(host)){togglePanel(false)}
  });
  var greeted=false;
  try{greeted=sessionStorage.getItem('nexus_mascot_greeted_v1')==='1';if(!greeted)sessionStorage.setItem('nexus_mascot_greeted_v1','1')}catch(_){}
  if(!greeted){
    window.setTimeout(function(){
      if(document.visibilityState==='hidden'||panel.dataset.open==='true')return;
      hello.dataset.show='true';greetingTimeout=window.setTimeout(hideGreeting,6500);
    },1300);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
})();