import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('Vosk local grammar contains all environmental and LED command words',()=>{
  const context={
    URL,navigator:{},document:{currentScript:{src:'https://example.test/nexus/offline/core.js'}},
    NEXUS_OFFLINE_ASSETS:{version:'test',files:[]}
  };
  context.globalThis=context;
  vm.runInNewContext(fs.readFileSync(new URL('./offline/core.js',import.meta.url),'utf8'),context);
  const vocabulary=JSON.parse(context.NexusOffline.grammar([]));
  for(const phrase of [
    'nexus revisá temperatura','nexus revisá presión','nexus revisá humedad',
    'nexus prendé foco uno','nexus prendé foco dos',
    'nexus apagá foco uno','nexus apagá foco dos'
  ])assert.ok(vocabulary.includes(phrase),'Missing voice phrase: '+phrase);
  assert.ok(vocabulary.includes('[unk]'));
});
