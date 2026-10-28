import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import vm from 'node:vm';
import ts from 'typescript';
import * as tenant from '../security/tenantContext.js';
const require=createRequire(import.meta.url),owner='11111111-1111-4111-8111-111111111111';
function fixture(){
  const handlers=new Map<string,Function>(),router:any={};for(const method of ['get','post','patch','delete'])router[method]=(path:string,handler:Function)=>{handlers.set(method+':'+path,handler);return router;};
  let saves=0,lookups=0,revision='11111111-1111-4111-8111-111111111112',revoked=false;
  const auth={getGitHubToken:async()=>{lookups++;return'synthetic-owner-token';},getGitHubStorageMeta:async()=>null,saveGitHubConnection:async()=>{saves++;}};
  const query:any={select(){return this;},eq(column:string,value:string){if(column==='user_id')assert.equal(value,owner);if(column==='provider')assert.equal(value,'github');return this;},maybeSingle:async()=>({data:{user_id:owner,provider:'github',access_token:'vault:v3:synthetic',credential_revision:revision,metadata:{revoked}},error:null})};
  const ports:any={'express':{Router:()=>router},'zod':require('zod')};
  const exports:any={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL('./github.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,process:{env:{GITHUB_CLIENT_ID:'synthetic-client',GITHUB_CLIENT_SECRET:'synthetic-secret'}},Buffer,URL,URLSearchParams,Headers,Response,AbortSignal,console,fetch:(...args:Parameters<typeof fetch>)=>fetch(...args),require:(id:string)=>{
      if(id in ports)return ports[id];if(id.endsWith('/tenantContext.js'))return tenant;if(id.endsWith('/githubAuth.js'))return auth;
      if(id.endsWith('/oauthState.js'))return{verifyOAuthState:()=>true};if(id.endsWith('/oauthPkceStore.js'))return{consumePkceSession:async()=>({authorization_revision:'synthetic-revision',redirect_uri:'https://xroga.com/dashboard/integrations/github/callback'})};
      if(id.endsWith('/serviceRoleGuard.js'))return{getTenantSupabaseAdmin:(context:unknown)=>{tenant.requireTenantContext(context);return{from:()=>query};}};
      if(id.endsWith('/supabase.js'))return{getSupabaseAdmin:()=>({from:()=>query})};return{};
    }});
  return{handlers,saves:()=>saves,lookups:()=>lookups,rotate(){revision='11111111-1111-4111-8111-111111111113';},revoke(){revoked=true;}};
}
async function invoke(f:ReturnType<typeof fixture>,route:string,context:unknown=tenant.createTenantContext({userId:owner,via:'remote_getuser'}),params={owner:'owned',repo:'repository'}){
  let status=200,payload:any;const res={status(n:number){status=n;return this;},json(value:unknown){payload=value;return this;}};
  await f.handlers.get(route)!({userId:owner,tenantContext:context,body:{code:'synthetic-code',state:'synthetic-state'},params},res);
  return{status,payload};
}
test('actual GitHub OAuth token, identity and account-read routes reject real redirects before save or successful listing',async t=>{
  const nativeFetch=globalThis.fetch;let mode='',forwarded=0;
  const sink=createServer((_req,res)=>{forwarded++;res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({access_token:'redirected-token',login:'redirected-user',id:1}));});
  const source=createServer((req,res)=>{
    const path=new URL(req.url!,'http://fixture').pathname;
    if(mode==='token'&&path.includes('/access_token')||mode==='identity'&&path==='/user'||mode==='repos'&&path==='/user/repos'||mode==='branches'&&path.includes('/branches')){res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end();return;}
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(path.includes('/access_token')?{access_token:'synthetic-owner-token'}:[]));
  });await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>source.listen(0,'127.0.0.1',r));
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{const url=new URL(String(input));assert.ok(['github.com','api.github.com'].includes(url.hostname));return nativeFetch(`http://127.0.0.1:${(source.address() as AddressInfo).port}${url.pathname}${url.search}`,init);});
  try{for(mode of ['token','identity','repos','branches'])await t.test(mode,async()=>{
    forwarded=0;const f=fixture(),result=await invoke(f,['token','identity'].includes(mode)?'post:/connect':mode==='repos'?'get:/repos':'get:/repos/:owner/:repo/branches');assert.equal(forwarded,0);assert.ok(result.status>=400);assert.equal(f.saves(),0);
  });}finally{source.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);}
});

test('GitHub account read rejects cloned actor before credential lookup',async()=>{
  const f=fixture(),context=tenant.createTenantContext({userId:owner,via:'remote_getuser'});
  await assert.rejects(invoke(f,'get:/repos',{...context}));assert.equal(f.lookups(),0);
});

test('GitHub account reads refuse in-flight rotation, revocation, unsafe repo paths and oversized receipts',async t=>{
  for(const mode of ['rotate','revoke','oversized']){
    const f=fixture();let calls=0;
    t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(new ReadableStream({start(controller){if(mode==='rotate')f.rotate();if(mode==='revoke')f.revoke();controller.enqueue(Buffer.from(mode==='oversized'?'x'.repeat(2*1024*1024+1):'[]'));controller.close();}}));});
    const result=await invoke(f,'get:/repos');assert.ok(result.status>=400);assert.equal(calls,1);assert.equal(f.saves(),0);t.mock.restoreAll();
  }
  let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;return Response.json([]);});
  for(const params of [{owner:'owned',repo:'..'},{owner:'owned@outside.invalid',repo:'repository'},{owner:'owned',repo:'repository/../foreign'}])assert.ok((await invoke(fixture(),'get:/repos/:owner/:repo/branches',undefined,params)).status>=400);
  assert.equal(requests,0);
});

test('authorized GitHub account reads and OAuth exchange keep their real contracts',async t=>{
  let requests=0,mode='positive';
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    requests++;const url=new URL(String(input));assert.equal(init?.redirect,'manual');assert.ok(init?.signal instanceof AbortSignal);
    if(mode==='503')return Response.json({error:'PRIVATE_PROVIDER_CANARY'},{status:503});
    if(mode==='401')return Response.json({error:'PRIVATE_PROVIDER_CANARY'},{status:401});
    return Response.json(url.pathname.endsWith('/access_token')?{access_token:'synthetic-owner-token'}:url.pathname==='/user'?{login:'fixture',id:42}:url.pathname.endsWith('/branches')?[{name:'main',protected:true}]:[{full_name:'owned/repository',default_branch:'main',private:true,updated_at:'synthetic-time'}]);
  });
  for(const route of ['post:/connect','get:/status','get:/repos','get:/repos/:owner/:repo/branches']){
    const f=fixture(),result=await invoke(f,route);assert.equal(result.status,200);if(route==='post:/connect')assert.equal(f.saves(),1);
  }
  mode='401';const denied=await invoke(fixture(),'get:/status');assert.ok(denied.status>=400);assert.equal(denied.payload.connected,false);
  mode='503';const unavailable=await invoke(fixture(),'get:/repos');assert.equal(unavailable.status,502);assert.ok(!JSON.stringify(unavailable.payload).includes('PRIVATE_PROVIDER_CANARY'));
  assert.ok(requests>=6);
});
