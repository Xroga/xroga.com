import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {deployStaticSiteWithToken} from './vercel.js';
import {deployToNetlify} from './netlify.js';
import {syncEnvVarsToVercelProject} from './vercelEnv.js';
import {listProjectDomains} from './vercelDomains.js';
import {deployStaticPreview,deployToAllPlatforms,deployPreviewToPlatform,ensureVercelGitProject} from '../services/integrations/githubDeploy.js';
import {EgressDenied} from '../security/egress/egressPolicy.js';
import {publishingProviderRequest} from './publishingProviderRequest.js';
import {createHash} from 'node:crypto';

test('real publishing transports cannot follow a provider redirect with project or credential payloads',async t=>{
  const originalFetch=globalThis.fetch,old=process.env.NETLIFY_ACCESS_TOKEN;process.env.NETLIFY_ACCESS_TOKEN='synthetic-owner-token';let forwarded=0;
  const sink=createServer((_req,res)=>{forwarded++;res.writeHead(404,{'content-type':'application/json'}).end('{}');});
  const source=createServer((_req,res)=>res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end());
  await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>source.listen(0,'127.0.0.1',r));
  t.mock.method(globalThis,'fetch',async(_input:Parameters<typeof fetch>[0],init?:RequestInit)=>originalFetch(`http://127.0.0.1:${(source.address() as AddressInfo).port}/`,init));
  try{
    const calls=[()=>deployStaticSiteWithToken('owned-project',[{file:'index.html',data:'owned-source'}],'synthetic-owner-token',{teamId:'team_test'}),
      ()=>deployToNetlify('owned-site',[{path:'index.html',content:'owned-source'}]),
      ()=>syncEnvVarsToVercelProject({token:'synthetic-owner-token',projectName:'owned-project',env:{API_KEY:'synthetic-env-value'}}),
      ()=>listProjectDomains('synthetic-owner-token','owned-project'),()=>ensureVercelGitProject({token:'synthetic-owner-token',projectName:'owned-project',githubRepo:'owner/repo'})];
    for(const[index,invoke]of calls.entries())await t.test(['Vercel deploy','Netlify deploy','Vercel env sync','Vercel domains','Vercel Git project'][index],async()=>{forwarded=0;try{await invoke();}catch{/* Refusal is expected, no raw provider text is reported. */}assert.equal(forwarded,0,'A fixed provider may not redirect this transport');});
  }finally{if(old===undefined)delete process.env.NETLIFY_ACCESS_TOKEN;else process.env.NETLIFY_ACCESS_TOKEN=old;source.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);}
});
test('Netlify lookup cannot substitute an unrelated site after creation fails',async t=>{
  const old=process.env.NETLIFY_ACCESS_TOKEN;process.env.NETLIFY_ACCESS_TOKEN='synthetic-platform-key';let writes=0;
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    if(String(input).endsWith('/sites'))return Response.json({}, {status:409});
    if(!init?.method)return Response.json([{id:'foreign-site',name:'someone-else'}]);
    writes++;return Response.json({id:'deploy_id',url:'https://unrelated.netlify.app'});
  });
  try{await assert.rejects(deployToNetlify('exact-site',[{path:'index.html',content:'owned-source'}]));assert.equal(writes,0);}
  finally{if(old===undefined)delete process.env.NETLIFY_ACCESS_TOKEN;else process.env.NETLIFY_ACCESS_TOKEN=old;}
});
test('Netlify authorization denial stops before lookup or deployment retry',async t=>{
  const old=process.env.NETLIFY_ACCESS_TOKEN;process.env.NETLIFY_ACCESS_TOKEN='synthetic-platform-key';let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({}, {status:403});});
  try{await assert.rejects(deployToNetlify('exact-site',[]));assert.equal(calls,1);}
  finally{if(old===undefined)delete process.env.NETLIFY_ACCESS_TOKEN;else process.env.NETLIFY_ACCESS_TOKEN=old;}
});
test('known held credentials in source files stop publishing before provider dispatch',async t=>{
  const old={COMPOSIO_API_KEY:process.env.COMPOSIO_API_KEY,NETLIFY_ACCESS_TOKEN:process.env.NETLIFY_ACCESS_TOKEN};const secret='opaque-held-47c290e1fca94383b7829427';
  Object.assign(process.env,{COMPOSIO_API_KEY:secret,NETLIFY_ACCESS_TOKEN:'synthetic-platform-key'});let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({}, {status:503});});
  try{for(const invoke of [()=>deployStaticSiteWithToken('owned-project',[{file:'index.html',data:secret}],'synthetic-token',{teamId:'team_test'}),()=>deployToNetlify('owned-site',[{path:'index.html',content:secret}])]){
    calls=0;await assert.rejects(invoke());assert.equal(calls,0,'A source credential cannot become an external publishing payload');
  }}finally{for(const[key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
test('authorized Netlify create and exact-name recovery preserve the original source snapshot',async t=>{
  const old=process.env.NETLIFY_ACCESS_TOKEN;process.env.NETLIFY_ACCESS_TOKEN='synthetic-platform-key';let mode='create',uploaded='';
  const files=[{path:'index.html',content:'owned-source'}],hash=createHash('sha1').update('owned-source').digest('hex');
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=String(input);
    if(url.endsWith('/sites')){files[0].content='changed-after-admission';return mode==='create'?Response.json({id:'exact_site',url:'https://exact-site.netlify.app'}):Response.json({}, {status:409});}
    if(!init?.method)return Response.json([{id:'unrelated',name:'other'},{id:'exact_site',name:'exact-site'}]);
    if(url.endsWith('/sites/exact_site/deploys')){assert.deepEqual(JSON.parse(String(init?.body)),{files:{'/index.html':hash}});return Response.json({id:'deploy_id',required:[hash],ssl_url:'https://exact-site.netlify.app'});}
    assert.ok(url.endsWith('/deploys/deploy_id/files/'+hash));uploaded=String(init?.body);return new Response(null,{status:200});
  });
  try{for(mode of ['create','collision']){files[0].content='owned-source';const result=await deployToNetlify('exact-site',files);assert.equal(result.deployUrl,'https://exact-site.netlify.app');assert.equal(uploaded,'owned-source');}}
  finally{if(old===undefined)delete process.env.NETLIFY_ACCESS_TOKEN;else process.env.NETLIFY_ACCESS_TOKEN=old;}
});
test('publishing transport rejects destination, path, method and size violations before dispatch',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({});});
  for(const url of ['https://api.vercel.com.evil.test/v13/deployments','https://api.vercel.com/v13/deployments?target=outside','https://api.vercel.com/v9/projects/..%2Fother/env','https://api.netlify.com/api/v1/sites/../other/deploys','https://api.vercel.com/v13/deployments#fragment'])await assert.rejects(publishingProviderRequest(url,{method:'POST'}),e=>e instanceof EgressDenied);
  await assert.rejects(publishingProviderRequest('https://api.vercel.com/v13/deployments',{method:'DELETE'}),e=>e instanceof EgressDenied);
  await assert.rejects(publishingProviderRequest('https://api.vercel.com/v13/deployments',{method:'POST',body:'x'.repeat(32*1024*1024+1)}),e=>e instanceof EgressDenied);
  assert.equal(calls,0);
});
test('publishing transport bounds response bytes and never exposes provider failure bodies',async t=>{
  let cancelled=false;
  t.mock.method(globalThis,'fetch',async()=>new Response(new ReadableStream({start(c){c.enqueue(Buffer.alloc(16*1024*1024+1));},cancel(){cancelled=true;}})));
  await assert.rejects(publishingProviderRequest('https://api.vercel.com/v2/user'),e=>e instanceof EgressDenied);assert.equal(cancelled,true);
  t.mock.method(globalThis,'fetch',async()=>new Response('PRIVATE_PROVIDER_FAILURE_CANARY',{status:503}));
  const res=await publishingProviderRequest('https://api.vercel.com/v2/user');assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/PRIVATE_PROVIDER_FAILURE_CANARY/);
});
test('a cancelled publishing transport cannot dispatch or publish a late response',async t=>{
  let calls=0;const abort=new AbortController();abort.abort();
  t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({});});
  await assert.rejects(publishingProviderRequest('https://api.vercel.com/v2/user',{signal:abort.signal}),{name:'AbortError'});assert.equal(calls,0);
});
test('publishing security denials cannot become another provider or platform retry',async t=>{
  const old={VERCEL_API_KEY:process.env.VERCEL_API_KEY,NETLIFY_ACCESS_TOKEN:process.env.NETLIFY_ACCESS_TOKEN};
  Object.assign(process.env,{VERCEL_API_KEY:'synthetic-platform-key',NETLIFY_ACCESS_TOKEN:'synthetic-netlify-key'});const calls:string[]=[];
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{calls.push(String(input));return new Response(null,{status:307,headers:{location:'https://untrusted.test/'}});});
  try{
    const files=[{path:'index.html',content:'<!doctype html><html><body>owned source</body></html>'}];
    for(const invoke of [()=>deployStaticPreview('owned-project',files),()=>deployToAllPlatforms('owned-project',files),()=>deployPreviewToPlatform('owned-project',files,'vercel')]){
      calls.length=0;await assert.rejects(invoke(),e=>e instanceof EgressDenied);assert.equal(calls.length,1);assert.equal(calls.some(url=>url.includes('netlify')),false);
    }
  }finally{for(const[key,value]of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
