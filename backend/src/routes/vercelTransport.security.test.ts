import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as auth from '../services/integrations/vercelAuth.js';
import * as tenant from '../security/tenantContext.js';
import {TenantAccessError} from '../security/tenantErrors.js';
const require=createRequire(import.meta.url),owner='11111111-1111-4111-8111-111111111111';
function routerFixture(){
  const handlers=new Map<string,Function>();let saves=0,lookups=0;
  const router:any={};for(const method of ['get','post','delete'])router[method]=(path:string,handler:Function)=>{handlers.set(method+':'+path,handler);return router;};
  const authPort={...auth,getVercelToken:async(user:string)=>{assert.equal(user,owner);lookups++;return'synthetic-owner-token';},parseVercelOAuthState:()=>({userId:owner}),getVercelOAuthCallbackUrl:()=> 'https://xroga.com/dashboard/integrations/vercel/callback',
    exchangeVercelOAuthCode:async()=>({access_token:'synthetic-owner-token',expires_in:3600}),probeVercelApiCapabilities:async()=>({canListProjects:false,canReadDeployments:false}),saveVercelConnection:async()=>{saves++;}};
  const source=readFileSync(new URL('./vercel.ts',import.meta.url),'utf8'),exports:any={};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,fetch:(...args:Parameters<typeof fetch>)=>fetch(...args),console,
    require:(id:string)=>id==='express'?{Router:()=>router}:id==='zod'?require('zod'):id.endsWith('/vercelAuth.js')?authPort:id.endsWith('/tenantContext.js')?tenant:id.endsWith('/tenantErrors.js')?{TenantAccessError}:id.endsWith('/githubDeploy.js')?{hasManagedVercelDeployment:()=>false}:{}});
  return{handlers,saves:()=>saves,lookups:()=>lookups};
}
async function invoke(f:ReturnType<typeof routerFixture>,path:string,context:unknown=tenant.createTenantContext({userId:owner,via:'remote_getuser'})){
  let status=200,payload:unknown;const res={status(n:number){status=n;return this;},json(value:unknown){payload=value;return this;}};
  await f.handlers.get(path.startsWith('/connect')?'post:/connect':'get:/projects')!({userId:owner,tenantContext:context,body:{code:'synthetic-code',state:'synthetic-state'}},res);
  return{status,payload};
}
test('actual Vercel route callbacks cannot follow identity or account-list redirects or save after denial',async t=>{
  const nativeFetch=globalThis.fetch;let mode='',forwarded=0;
  const sink=createServer((_req,res)=>{forwarded++;res.writeHead(200,{'content-type':'application/json'}).end('{}');});
  const source=createServer((req,res)=>{
    const path=new URL(req.url!,'http://fixture').pathname;
    const denied=mode==='identity'&&path==='/login/oauth/userinfo'||mode==='legacy'&&path==='/v2/user'||mode==='projects'&&path==='/v9/projects'||mode==='teams'&&path==='/v2/teams';
    if(denied){res.writeHead(307,{location:`http://127.0.0.1:${(sink.address() as AddressInfo).port}/collect`}).end();return;}
    if(mode==='legacy'&&path==='/login/oauth/userinfo'){res.writeHead(401,{'content-type':'application/json'}).end('{}');return;}
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({projects:[],teams:[],preferred_username:'fixture',user:{username:'fixture'}}));
  });
  await new Promise<void>(r=>sink.listen(0,'127.0.0.1',r));await new Promise<void>(r=>source.listen(0,'127.0.0.1',r));
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{const url=new URL(String(input));assert.equal(url.origin,'https://api.vercel.com');return nativeFetch(`http://127.0.0.1:${(source.address() as AddressInfo).port}${url.pathname}${url.search}`,init);});
  try{
    for(mode of ['identity','legacy','projects','teams'])await t.test(mode,async()=>{
      forwarded=0;const f=routerFixture(),result=await invoke(f,['identity','legacy'].includes(mode)?'/connect':'/projects');
      assert.equal(forwarded,0,'Credentials cannot select a redirected provider destination');assert.ok(result.status>=400);assert.equal(f.saves(),0);
    });
  }finally{source.closeAllConnections();sink.closeAllConnections();await Promise.all([new Promise<void>(r=>source.close(()=>r())),new Promise<void>(r=>sink.close(()=>r()))]);}
});
test('Vercel account-list route requires original actor before credential lookup',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({projects:[],teams:[]});});
  const original=tenant.createTenantContext({userId:owner,via:'remote_getuser'}),f=routerFixture();
  const result=await invoke(f,'/projects',{...original});assert.ok(result.status>=400);assert.equal(f.lookups(),0);assert.equal(calls,0);
});
test('authorized Vercel routes keep personal/team lists and ordinary identity fallback',async t=>{
  let mode='projects';const requests:string[]=[];
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{
    const url=new URL(String(input));requests.push(url.href);
    if(url.pathname==='/login/oauth/userinfo')return Response.json({}, {status:401});
    if(url.pathname==='/v2/user')return Response.json({user:{username:'verified-fixture',id:'fixture-user'}});
    if(url.pathname==='/v2/teams')return Response.json({teams:[{id:mode==='bad-team'?'team_fixture&other=1':'team_fixture',name:'Owned team'}]});
    assert.equal(url.pathname,'/v9/projects');return Response.json({projects:[{id:url.searchParams.has('teamId')?'prj_team':'prj_personal',name:'owned-project'}]});
  });
  const f=routerFixture(),list=await invoke(f,'/projects');assert.equal(list.status,200);assert.equal((list.payload as any).projects.length,2);assert.equal(f.lookups(),1);
  requests.length=0;const connected=routerFixture(),identity=await invoke(connected,'/connect');assert.equal(identity.status,200);assert.equal(connected.saves(),1);assert.equal((identity.payload as any).username,'verified-fixture');
  assert.deepEqual(requests.map(url=>new URL(url).pathname),['/login/oauth/userinfo','/v2/user']);
  mode='bad-team';requests.length=0;const denied=await invoke(routerFixture(),'/projects');assert.ok(denied.status>=400);assert.equal(requests.some(url=>url.includes('%26')),false);
});
