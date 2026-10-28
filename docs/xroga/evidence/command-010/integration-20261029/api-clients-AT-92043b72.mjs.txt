import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(new URL('../../package.json',import.meta.url)),ts=require('typescript');
// Compile the actual client modules, substituting only imports for Auth/UI
// dependencies. HTTP remains real, local and synthetic. No app or cloud starts.
function loadClients(origin){
  const cache=new Map(),session={access_token:'synthetic-browser-access',expires_at:Math.floor(Date.now()/1000)+3600};
  const stubs={
    'clsx':{clsx:(...a)=>a.join(' ')},'tailwind-merge':{twMerge:a=>a},
    '@/lib/supabase/client':{createClient:()=>({auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}})},
    '@/lib/swarm':{swarmOutputToText:()=> 'owned fixture'},
    '@/lib/engineeringArtifact':{engineeringArtifactToText:()=> 'owned fixture',isRenderableArtifact:()=>false},
    '@/lib/recoveredBuildOutput':{isRecoverableBuildOutput:()=>false},
    '@/lib/streamText':{reconcileAssistantText:(_old,next)=>next,streamTextReveal:async(text,fn)=>fn(text)},
    '@/lib/guestWorkspace':{getGuestSessionId:()=>null,setGuestSessionId:()=>{}},
  };
  function load(name){
    if(cache.has(name))return cache.get(name);
    const path=new URL('../src/lib/'+name+'.ts',import.meta.url),source=readFileSync(path,'utf8');
    const text=ts.transpileModule(source+(name==='api'?'\nexport {waitForPersistedSwarmRun};':''),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const exports={};cache.set(name,exports);
    const context={exports,require:id=>id==='@/lib/api'?load('api'):(stubs[id]??(()=>{throw Error('Unexpected fixture dependency '+id);})()),
      process:{env:{NEXT_PUBLIC_API_URL:origin,NODE_ENV:'test'}},fetch,URL,URLSearchParams,Headers,Response,Request,Blob,AbortSignal,AbortController,DOMException,TextDecoder,TextEncoder,crypto:globalThis.crypto,console,
      setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,5)),clearTimeout,
      window:{setTimeout:fn=>fn(),dispatchEvent(){}},CustomEvent:class{},
      document:{createElement:()=>({style:{},click(){},remove(){}}),body:{appendChild(){}}}};
    vm.runInNewContext(text,context,{filename:path.pathname,timeout:1000});return exports;
  }
  return{load};
}
test('each first-party client refuses API redirects without forwarding private request bodies',async t=>{
  let forwarded=0;
  const sink=createServer((_req,res)=>{forwarded++;res.writeHead(503,{'content-type':'application/json'}).end('{"error":"synthetic denied"}');});
  const api=createServer((_req,res)=>res.writeHead(307,{location:`http://127.0.0.1:${sink.address().port}/collect`}).end());
  await new Promise(r=>sink.listen(0,'127.0.0.1',r));await new Promise(r=>api.listen(0,'127.0.0.1',r));
  try{
    const {load}=loadClients(`http://127.0.0.1:${api.address().port}`),core=load('api');
    const cases=[['canonical API',()=>core.apiFetch('/api/fixture',{method:'POST',body:'private fixture'},'synthetic-browser-access')],
      ['stream submission',()=>core.streamSwarmExecute('private fixture',{accessToken:'synthetic-browser-access'})],
      ['community',()=>load('community').communityApi.createPost({category:'feedback',title:'private fixture',body:'private body'})],
      ['runtime',()=>load('projectRuntimeApi').projectRuntimeApi.restart('owned-project')],
      ['delivery status',()=>load('projectDeliveryApi').projectDeliveryApi.status('owned-project')],
      ['delivery download',()=>load('projectDeliveryApi').projectDeliveryApi.download('owned-project')],
      ['voice',()=>load('voiceApi').transcribeVoiceAudio(new Blob(['private audio'],{type:'audio/webm'}))],
      ['guest',()=>load('runGuestLaneChat').runGuestLaneChat({prompt:'private fixture',history:[],signal:new AbortController().signal,onPartial(){}})]];
    for(const[name,invoke]of cases)await t.test(name,async()=>{forwarded=0;await assert.rejects(invoke());assert.equal(forwarded,0,'No private request follows an API redirect');});
  }finally{api.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise(r=>api.close(r)),new Promise(r=>sink.close(r))]);}
});
test('API polling treats redirect refusal as terminal and authorized requests retain their contracts',async()=>{
  let mode='positive',requests=0;
  const api=createServer((req,res)=>{
    requests++;
    if(mode==='redirect'){res.writeHead(307,{location:'https://outside.invalid/collect'}).end();return;}
    if(req.url==='/api/swarm/execute'){res.writeHead(200,{'content-type':'text/event-stream'}).end('event: complete\ndata: {"runId":"owned-run","success":true,"output":{"response":"owned fixture"}}\n\n');return;}
    const payload=req.url?.includes('/api/swarm/runs/')?{runId:'owned-run',status:'completed',events:[],output:{response:'owned fixture'}}:
      req.url==='/api/guest/chat'?{response:'owned fixture',guestSessionId:'synthetic-session',guest:{limit:1,remaining:0,resetAt:'2030-01-01'}}:
      req.url==='/api/voice/transcribe'?{text:'owned transcript'}:{fixture:true,preview:{owned:true}};
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(payload));
  });
  await new Promise(r=>api.listen(0,'127.0.0.1',r));
  try{
    const {load}=loadClients(`http://127.0.0.1:${api.address().port}`),core=load('api');
    assert.equal((await core.apiFetch('/api/fixture',{method:'POST',redirect:'follow'},'synthetic-browser-access')).fixture,true);
    assert.equal(await core.streamSwarmExecute('owned fixture',{accessToken:'synthetic-browser-access'}),'owned fixture');
    assert.equal((await load('community').communityApi.createPost({category:'feedback',title:'owned',body:'owned'})).fixture,true);
    assert.equal((await load('projectRuntimeApi').projectRuntimeApi.restart('owned-project')).owned,true);
    assert.equal((await load('projectDeliveryApi').projectDeliveryApi.status('owned-project')).fixture,true);
    await load('projectDeliveryApi').projectDeliveryApi.download('owned-project');
    assert.equal(await load('voiceApi').transcribeVoiceAudio(new Blob(['synthetic audio'])),'owned transcript');
    assert.equal((await load('runGuestLaneChat').runGuestLaneChat({prompt:'owned',history:[],signal:new AbortController().signal,onPartial(){}})).response,'owned fixture');
    assert.equal(await core.waitForPersistedSwarmRun('owned-run','synthetic-browser-access',{},''),'owned fixture');
    requests=0;mode='redirect';
    await assert.rejects(core.waitForPersistedSwarmRun('owned-run','synthetic-browser-access',{signal:AbortSignal.timeout(1000)},''),e=>e.data?.code==='API_DESTINATION_DENIED');
    assert.equal(requests,1,'A redirect denial cannot become another polling attempt');
    requests=0;for(const url of ['https://outside.invalid/api','http://user:secret@127.0.0.1:'+api.address().port+'/api','http://127.0.0.1:'+api.address().port+'/api#fragment'])await assert.rejects(core.fetchApiResponse(url),e=>e.data?.code==='API_DESTINATION_DENIED');
    const abort=new AbortController();abort.abort();await assert.rejects(core.fetchApiResponse(core.API_URL+'/api',{signal:abort.signal}),{name:'AbortError'});assert.equal(requests,0);
  }finally{api.closeAllConnections();await new Promise(r=>api.close(r));}
});
test('actual Chromium opaque redirects are terminal before any outside request',async()=>{
  const {chromium}=require('@playwright/test');let outside=0;
  const sink=createServer((_req,res)=>{outside++;res.writeHead(200,{'access-control-allow-origin':'*'}).end('{}');});
  const api=createServer((req,res)=>{const cors={'access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Authorization, Content-Type'};
    if(req.method==='OPTIONS'){res.writeHead(204,cors).end();return;}res.writeHead(307,{...cors,location:`http://127.0.0.1:${sink.address().port}/collect`}).end();});
  await new Promise(r=>sink.listen(0,'127.0.0.1',r));await new Promise(r=>api.listen(0,'127.0.0.1',r));
  const source=readFileSync(new URL('../src/lib/api.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('api.ts',source,ts.ScriptTarget.Latest,true);
  const declarations=ast.statements.filter(n=>(ts.isFunctionDeclaration(n)&&n.name?.text==='fetchApiResponse')||(ts.isClassDeclaration(n)&&n.name?.text==='ApiError'));
  assert.equal(declarations.length,2);
  const moduleText=ts.transpileModule(`const API_URL=${JSON.stringify('http://127.0.0.1:'+api.address().port)};\n`+declarations.map(n=>n.getText(ast)).join('\n'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const ui=createServer((req,res)=>req.url==='/fixture.js'?res.writeHead(200,{'content-type':'text/javascript'}).end(moduleText):res.writeHead(200,{'content-type':'text/html'}).end('<!doctype html><title>Isolated API fixture</title>'));
  await new Promise(r=>ui.listen(0,'127.0.0.1',r));let browser;
  try{
    browser=await chromium.launch({headless:true});const page=await browser.newPage();const origin='http://127.0.0.1:'+ui.address().port;await page.goto(origin);
    const result=await page.evaluate(async({moduleUrl,target})=>{const client=await import(moduleUrl);try{await client.fetchApiResponse(target,{method:'POST',headers:{Authorization:'Bearer synthetic-browser-access','Content-Type':'text/plain'},body:'private synthetic fixture'});return null;}catch(e){return{status:e.status,code:e.data?.code};}},
      {moduleUrl:origin+'/fixture.js',target:'http://127.0.0.1:'+api.address().port+'/api/fixture'});
    assert.deepEqual(result,{status:403,code:'API_DESTINATION_DENIED'});assert.equal(outside,0);
  }finally{await browser?.close();ui.closeAllConnections();api.closeAllConnections();sink.closeAllConnections();await Promise.all([ui,api,sink].map(s=>new Promise(r=>s.close(r))));}
});
