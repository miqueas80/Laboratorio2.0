import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';

export const root = new URL('./', import.meta.url);
export const master = JSON.parse(fs.readFileSync(new URL('inventory.json', root), 'utf8'));
const apiNames = ['startVoiceRecognition','stopVoiceRecognition','receiveVoiceTranscript','receiveVoicePartial','selectLocalSpanishVoice','selectSpanishVoice','speechTextForTTS','speakText','resolveNaturalCalendarDate','parseNaturalCalendarDraft','handleVoicePendingTurn','chooseVoiceTranscript','fuseLensLocalVision','state','bind','boot','loadMaster','loadCatalogMaster','saveInventory','saveItem','newItem','openItem','deleteItem','searchLocal','documentSearch','indexLocalFile','indexDocument','putDoc','getCachedDocs','loadCachedDocumentIndex','parseLocalAssistantAction','fastAgentPlan','executeAssistantAction','nexusAgentTurn','assistantAsk','aiQuery','runIntegrity','syncRepository','validateInventory','renderDocuments','renderAll','setView','calendarEvents','saveCalendarEvents','importExcel','importWord','xkiroGenerate','xkiroVisionAnalyze','setInternetMode','handleNetworkChange','syncPublishedDocuments','loadXKiroModels','orderXKiroCandidates','searchWebSources','renderDiagnostics','exportCsv','exportReport','processQr','runResearch','stopQr','stopLensCamera','createLensEvidence','buildNexusLensContext','resolveLensLocalSignals','normalizeLensNexusCode','parseLensOcrResult','searchLensDocuments','ensureLensIndexedDocuments','captureLensFrame','analyzeLensImageQuality','decodeLensCode','startLensCamera','requestLensCameraPermission','health','refreshLocalVoiceStatus','installLocalVoiceLanguage','parseLensVisionPayload','fuseLensVisualContext','shouldSearchLensWeb','searchLensExternalEvidence','getLensVisionProvider','identifyLensCode','runNexusLensPipeline'];
export function harness({stored,fetcher,online=true,idb=new IDBFactory(),source,url='https://miqueas80.github.io/laboratorio/'}={}) {
  const dom = new JSDOM(fs.readFileSync(new URL('index.html', root), 'utf8'), {url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, calls=[], errors=[];
  Object.assign(w,{setImmediate,clearImmediate,indexedDB:idb,structuredClone,Blob,Response,Request,Headers,TextEncoder,TextDecoder,AbortController,crypto:undefined});
  Object.defineProperty(w.navigator,'onLine',{value:online,configurable:true});
  w.confirm=()=>false;
  w.console={...console,warn:(...args)=>errors.push(args.map(String).join(' ')),error:(...args)=>errors.push(args.map(String).join(' '))};
  w.fetch=async (url,options)=>{calls.push(String(url));return fetcher?fetcher(url,options):new Response(JSON.stringify(master),{headers:{'Content-Type':'application/json'}})};
  if(stored!==undefined)w.localStorage.setItem('nexus_x_inventory_v1',typeof stored==='string'?stored:JSON.stringify(stored));
  const app=source??fs.readFileSync(new URL('app.js',root),'utf8');
  const injected=app.replace(/\nboot\(\);\s*\n\}\)\(\);\s*$/,`\nglobalThis.__test={toggleFavorite,checkStorageCapacity,csvCell,restoreInventoryBackup,showModal,hideModal,openDocumentViewer,closeDocumentViewer,collectDiagnostics,resolveIntent,ActionRegistry,${apiNames.join(',')}};\n})();`);
  if(injected===app)throw new Error('No se encontró el arranque para aislar la prueba');
  vm.runInContext(injected,dom.getInternalVMContext(),{filename:'app.js'});
  return {window:w,document:w.document,api:w.__test,calls,errors,loadVendor:(file)=>vm.runInContext(fs.readFileSync(new URL(file,root),'utf8'),dom.getInternalVMContext()),close:()=>w.close()};
}
