import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function createRig(){
  const instances=[],transcripts=[];
  const model={
    KaldiRecognizer:class {
      constructor(...args){this.args=args;this.events={};this.wordsEnabled=false;instances.push(this);}
      setWords(v){this.wordsEnabled=v;}
      on(event,handler){this.events[event]=handler;}
      acceptWaveformFloat(){}
      remove(){}
    },
    terminate(){}
  };
  const stream={getTracks(){return[{stop(){},addEventListener(){}}]}};
  class AudioContext {
    constructor({sampleRate}){this.sampleRate=sampleRate;}
    async resume(){}
    async close(){}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
    createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
    createScriptProcessor(){return {connect(){},disconnect(){},onaudioprocess:null};}
    get destination(){return {};}
  }
  const root={
    NEXUS_OFFLINE_ASSETS:{version:'test',files:[]},
    location:{pathname:'/Laboratorio2.0/'},
    navigator:{mediaDevices:{getUserMedia:async()=>stream}},
    AudioContext,
    dispatchEvent(){},
    document:{currentScript:{src:'https://example.test/nexus/offline/core.js'}},
    CustomEvent:class {constructor(type,config){this.type=type;this.detail=config.detail;}},
    __fakeVoskModel:model
  };
  root.globalThis=root;
  const script=fs.readFileSync(new URL('./offline/core.js',import.meta.url),'utf8');
  const source=script.replace('model=await loadVoiceModel();','model=await root.__fakeVoskModel;');
  assert.notEqual(source,script,'Stub replaces only the model-loading boundary');
  const context=vm.createContext({...root,navigator:root.navigator,document:root.document,URL,TextDecoder,TextEncoder,setTimeout,clearTimeout});
  context.globalThis=context;
  vm.runInContext(source,context);
  return {engine:context.NexusOffline,instances,transcripts};
}

test('Vosk command mode retains grammar; free mode uses unbounded Vosk decoding, both offline',async()=>{
  const r=createRig();
  const commands=r.engine.createVoice({mode:'commands'});
  await commands.start({forceWasm:true});
  assert.equal(r.instances.length,1);
  assert.equal(r.instances[0].args.length,2);
  assert.equal(typeof r.instances[0].args[1],'string');
  assert.ok(r.instances[0].args[1].includes('[unk]'));
  commands.stop();
  const free=r.engine.createVoice({mode:'free'});
  await free.start({forceWasm:true});
  assert.equal(r.instances[1].args.length,1,'A full-language recognizer does not receive a forced command grammar');
  assert.equal(r.instances[1].wordsEnabled,true);
  free.stop();
});

test('Vosk acoustic word confidences flow to the UI callback; absent scores are reported as unknown',async()=>{
  const r=createRig(),heard=[];
  const voice=r.engine.createVoice({mode:'free',onTranscript:(text,meta)=>heard.push({text,meta})});
  await voice.start({forceWasm:true});
  r.instances[0].events.result({result:{text:'nexus temperatura',result:[{word:'nexus',conf:.8},{word:'temperatura',conf:.6}]}});
  r.instances[0].events.result({result:{text:'nexus inventario'}});
  assert.equal(heard.length,2);
  assert.equal(heard[0].text,'nexus temperatura');
  assert.equal(Math.round(heard[0].meta.confidence*100),70);
  assert.equal(heard[0].meta.mode,'free');
  assert.equal(heard[1].meta.confidence,null);
  voice.stop();
});
