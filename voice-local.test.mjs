import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';
test('voz local detecta, instala bajo petición y conserva alternativa',async()=>{
 const h=harness();try{let available='downloadable',installs=0;
 h.window.SpeechRecognition=class{static async available(options){assert.equal(options.langs[0],'es-AR');assert.equal(options.processLocally,true);return available}static async install(options){assert.equal(options.langs[0],'es-AR');installs++;available='available';return true}};
 await h.api.refreshLocalVoiceStatus();assert.equal(installs,0);assert.equal(h.document.querySelector('#installVoiceLanguage').hidden,false);assert.equal(await h.api.installLocalVoiceLanguage(),true);assert.equal(installs,1);assert.equal(h.document.querySelector('#localVoiceStatus').textContent,'Local instalado');
 h.window.SpeechRecognition=class{};await h.api.refreshLocalVoiceStatus();assert.equal(h.document.querySelector('#localVoiceStatus').textContent,'Servicio del navegador');h.window.SpeechRecognition=undefined;await h.api.refreshLocalVoiceStatus();assert.equal(h.document.querySelector('#localVoiceStatus').textContent,'No compatible');
 }finally{h.close()}
});
