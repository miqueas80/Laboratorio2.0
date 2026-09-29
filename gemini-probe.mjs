// Independent REST probe. Run: node gemini-probe.mjs
// Provide GEMINI_API_KEY in the process environment, never as a CLI argument/file.
import {pathToFileURL} from 'node:url';

export function sanitizedDiagnostic(result,key=''){
 return JSON.stringify(result,(_name,value)=>typeof value==='string'?(key?value.split(key).join('[REDACTED]'):value).replace(/AIza[\w-]{20,}/g,'[REDACTED]'):value,2);
}
export async function probeGemini({key=process.env.GEMINI_API_KEY,fetcher=fetch}={}){
 if(!key)return {status:'NOT_CONFIGURED',message:'GEMINI_API_KEY_NOT_AVAILABLE',requests:[]};
 const deadline=Date.now()+180000;
 const endpoint='https://generativelanguage.googleapis.com/v1beta/models',requests=[];
 const clean=value=>String(value??'').split(key).join('[REDACTED]').replace(/AIza[\w-]{20,}/g,'[REDACTED]').slice(0,4000);
 async function request(url,body){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1,Math.min(20000,deadline-Date.now())));
  const entry={endpoint:clean(url),method:body?'POST':'GET',apiVersion:'v1beta',httpStatus:null};requests.push(entry);
  try{
   const res=await fetcher(url,{method:entry.method,headers:{'x-goog-api-key':key,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
   entry.httpStatus=res.status;const raw=await res.text();let data;
   try{data=JSON.parse(raw)}catch{entry.status=res.ok?'PARSE_ERROR':'HTTP_ERROR'}
   if(!res.ok){
    entry.responseBody=clean(raw);entry.error={code:Number(data?.error?.code)||res.status,status:clean(data?.error?.status),message:clean(data?.error?.message)};
    const auth=[401,403].includes(res.status)||data?.error?.details?.some(x=>/API_KEY|CREDENTIAL/.test(x.reason||''))||/API key not valid/i.test(entry.error.message);
    entry.status=auth?'AUTH_ERROR':({400:'INVALID_REQUEST',404:'MODEL_UNAVAILABLE',408:'TIMEOUT',429:'QUOTA_EXCEEDED',500:'INTERNAL_ERROR',502:'SERVICE_UNAVAILABLE',503:'SERVICE_UNAVAILABLE',504:'TIMEOUT'})[res.status]||'HTTP_ERROR';entry.retryAfter=clean(res.headers.get('Retry-After'));return null;
   }
   if(!data||typeof data!=='object'){entry.status='PARSE_ERROR';return null}
   entry.status='OK';return data;
  }catch{entry.status=controller.signal.aborted?'TIMEOUT':'NETWORK_ERROR';return null}finally{clearTimeout(timer)}
 }
 const models=[],seen=new Set();let token='';
 do{
  const data=await request(endpoint+(token?'?pageToken='+encodeURIComponent(token):''));
  if(!data)return {status:requests.at(-1).status,requests};
  if(!Array.isArray(data.models))return {status:'PARSE_ERROR',requests};models.push(...data.models);
  token=data.nextPageToken||'';if(token&&(seen.has(token)||seen.size>=20))return {status:'PARSE_ERROR',requests};seen.add(token);
 }while(token);
 const returnedModels=models.map(m=>({name:clean(m.name),supportedGenerationMethods:m.supportedGenerationMethods}));
 const availableModels=[...new Set(models.filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>String(m.name||'').replace(/^models\//,'')))];
 const compatible=availableModels.filter(n=>/^gemini-[a-z0-9.-]+$/.test(n)&&/flash|pro/.test(n)&&!/tts|image|live|audio|robot|omni|transcrib|embedding/.test(n));
 compatible.sort((a,b)=>Number(/preview|exp/.test(a))-Number(/preview|exp/.test(b))||Number(!a.includes('flash'))-Number(!b.includes('flash'))||b.localeCompare(a,undefined,{numeric:true}));
 const metadata={returnedModels,availableModels,compatibleModels:compatible};
 for(const model of compatible){
  if(Date.now()>=deadline)break;
  const data=await request(endpoint+'/'+encodeURIComponent(model)+':generateContent',{contents:[{role:'user',parts:[{text:'Responde únicamente OK'}]}]});
  requests.at(-1).model=model;
  if(data){const answer=(data.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('').trim();if(answer)return {status:'CONNECTED',model,answer:clean(answer),...metadata,diagnosis:requests.some(r=>r.httpStatus===503)?'MODEL_SPECIFIC_503_WITH_WORKING_ALTERNATIVE':'MINIMAL_REQUEST_SUCCEEDED',requests};requests.at(-1).status='INVALID_RESPONSE'}
  if(![408,429,500,502,503,504].includes(requests.at(-1).httpStatus)||requests.at(-1).retryAfter)break;
 }
 const generations=requests.filter(r=>r.method==='POST'),allCompatibleModelsTested=compatible.length>0&&generations.length===compatible.length;
 const diagnosis=allCompatibleModelsTested&&generations.every(r=>r.httpStatus===503)?'ALL_COMPATIBLE_MODELS_RETURNED_503':generations.some(r=>r.httpStatus===503)?'503_OBSERVED_INCOMPLETE_OR_MIXED_RESULTS':'NO_SUCCESSFUL_GENERATION';
 return {status:compatible.length?requests.at(-1).status:'MODEL_UNAVAILABLE',...metadata,allCompatibleModelsTested,diagnosis,requests};
}
export async function probeNexusGemini({key=process.env.GEMINI_API_KEY,fetcher=fetch}={}){
 if(!key)return {status:'NOT_CONFIGURED',message:'GEMINI_API_KEY_NOT_AVAILABLE'};
 const {harness}=await import('./harness.mjs');
 const requests=[];
 const h=harness({fetcher:async(url,options)=>{
  const response=await fetcher(url,options);
  const entry={endpoint:String(url),method:options?.method||'GET',httpStatus:response.status,retryAfter:response.headers.get('Retry-After')};
  if(!response.ok)entry.responseBody=JSON.parse(sanitizedDiagnostic(await response.clone().text(),key)).slice(0,4000);requests.push(entry);return response;
 }});
 try{
  // JSDOM storage exists only in process memory; no browser profile or file is written.
  h.window.localStorage.setItem('nexus_gemini_api_key_v1',key);
  const result=await h.api.geminiGenerate({question:'Explicá brevemente qué es una molécula.'});
  return JSON.parse(sanitizedDiagnostic({status:'CONNECTED',layer:'NEXUS_GEMINI',model:result.model,answer:result.answer,requests,diagnostics:h.api.health.gemini},key));
 }catch(e){return JSON.parse(sanitizedDiagnostic({status:e.kind||'UNKNOWN_ERROR',layer:'NEXUS_GEMINI',message:e.message,requests,diagnostics:h.api.health.gemini},key))}
 finally{h.window.localStorage.removeItem('nexus_gemini_api_key_v1');h.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await (process.argv.includes('--nexus')?probeNexusGemini():probeGemini());console.log(sanitizedDiagnostic(result,process.env.GEMINI_API_KEY));process.exitCode=result.status==='CONNECTED'?0:2}
 catch{console.log('{"status":"UNKNOWN_ERROR","message":"No se pudo completar la prueba."}');process.exitCode=2}
}
