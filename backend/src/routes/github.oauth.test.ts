import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { createTenantContext } from '../security/tenantContext.js';

test('GitHub routes persist and consume owner-bound state, reject replay and refuse late callback saves',async()=>{
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','GITHUB_CLIENT_ID','GITHUB_CLIENT_SECRET'];
  const old=keys.map(key=>process.env[key]);keys.forEach(key=>process.env[key]='synthetic-only');
  process.env.SUPABASE_URL='http://127.0.0.1:49195';
  const original=globalThis.fetch;
  let stored:Record<string,string>|null=null,revision=randomUUID(),consumed=false,lost=false,outage=false;
  let providerCalls=0;const rpcCalls:string[]=[];
  const context=createTenantContext({userId:'11111111-1111-4111-8111-111111111111',via:'remote_getuser'});
  const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as AuthRequest).userId=context.userId;(req as AuthRequest).tenantContext=context;next();});
  const {default:router}=await import('./github.js');app.use('/github',router);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input instanceof Request?input.url:input));
    if(url.origin===base)return original(input,init);
    if(url.origin===process.env.SUPABASE_URL){
      rpcCalls.push(url.pathname);const body=JSON.parse(String(init?.body));assert.equal(body.p_owner_id,context.userId);
      if(outage)return Response.json({message:'PRIVATE_DATABASE_CANARY'},{status:503});
      if(url.pathname.endsWith('/begin_oauth_session')){assert.equal(body.p_provider,'github_oauth_pkce');stored=body.p_session;consumed=false;revision=randomUUID();return Response.json(true);}
      if(url.pathname.endsWith('/consume_oauth_session')){
        if(consumed||body.p_state!==stored?.state)return Response.json(null);consumed=true;
        return Response.json({...stored,authorization_revision:revision});
      }
      if(url.pathname.endsWith('/save_github_oauth_connection')){
        assert.equal(body.p_revision,revision);assert.equal(body.p_provider_user_id,'42');assert.equal(body.p_access_token,'SYNTHETIC_TOKEN');return Response.json(!lost);
      }
      throw new Error('Unexpected persistence operation');
    }
    providerCalls++;
    if(url.href==='https://github.com/login/oauth/access_token'){
      assert.equal(JSON.parse(String(init?.body)).redirect_uri,stored?.redirect_uri);return Response.json({access_token:'SYNTHETIC_TOKEN'});
    }
    assert.equal(url.href,'https://api.github.com/user');return Response.json({login:'fixture',id:42});
  };
  const start=async()=>{const result=await fetch(`${base}/github/oauth`);assert.equal(result.status,200);
    return new URL((await result.json() as {url:string}).url).searchParams.get('state')!;};
  const connect=(state:string)=>fetch(`${base}/github/connect`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state,code:'synthetic',redirectUri:'https://wrong.invalid/callback'})});
  try {
    const state=await start();lost=true;const late=await connect(state);assert.equal(late.status,500);assert.match((await late.json() as {error:string}).error,/changed during authorization/);
    assert.equal(providerCalls,2);const replay=await connect(state);assert.equal(replay.status,400);assert.equal(providerCalls,2);
    lost=false;const fresh=await connect(await start());assert.equal(fresh.status,200);assert.equal((await fresh.json() as {connected:boolean}).connected,true);
    outage=true;const denied=await fetch(`${base}/github/oauth`);assert.equal(denied.status,503);assert.ok(!(await denied.text()).includes('PRIVATE_DATABASE_CANARY'));
    assert.ok(rpcCalls.every(path=>path.startsWith('/rest/v1/rpc/')));
  } finally {globalThis.fetch=original;keys.forEach((key,i)=>{if(old[i]===undefined)delete process.env[key];else process.env[key]=old[i];});
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
