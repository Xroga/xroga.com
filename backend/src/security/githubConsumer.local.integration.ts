import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import express from 'express';
import type {SupabaseClient} from '@supabase/supabase-js';
import {authMiddleware} from '../middleware/auth.js';
import githubRouter from '../routes/github.js';
import {getGithubDefaultRepo} from '../services/integrations/githubDeploy.js';
import {resolveIdentity,resetIdentityResolution} from '../lib/resolveIdentity.js';

/** Actual Auth/router/database selection, with every provider request refused locally. */
export function registerGithubConsumerTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
 test('real remote identity factory derives each subject from Auth and rejects absent forged or unavailable verification',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const previous=process.env.REQUIRE_REMOTE_AUTH_CHECK,original=globalThis.fetch;
  process.env.REQUIRE_REMOTE_AUTH_CHECK='1';resetIdentityResolution();
  t.after(()=>{globalThis.fetch=original;previous===undefined?delete process.env.REQUIRE_REMOTE_AUTH_CHECK:process.env.REQUIRE_REMOTE_AUTH_CHECK=previous;resetIdentityResolution();});
  for(const actor of getUsers()){
   const results=await Promise.all(Array.from({length:3},()=>resolveIdentity(actor.token)));
   assert.ok(results.every(result=>result.userId===actor.id&&['remote_getuser','deduplicated'].includes(result.via)));
  }
  await assert.rejects(resolveIdentity(''));await assert.rejects(resolveIdentity('SYNTHETIC_INVALID_BEARER_TOKEN_ONLY'));
  globalThis.fetch=async(input,init)=>{const url=new URL(String(input instanceof Request?input.url:input));assert.equal(url.hostname,'127.0.0.1');if(url.pathname==='/auth/v1/user')return Response.json({message:'Synthetic Auth outage'},{status:503});return original(input,init);};
  await assert.rejects(resolveIdentity(getUsers()[0].token));
 });
 test('real GitHub repository consumer selects only authenticated owner credentials and rejects metadata-time disconnect replacement and outage',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const [owner,other]=getUsers(),original=globalThis.fetch,actors=[owner,other],sent:string[]=[];
  const tokens=new Map(actors.map(a=>[a.id,`SYNTHETIC_CONSUMER_${a.id}`]));
  let mode='normal',intercepted=false;
  t.after(async()=>{globalThis.fetch=original;assert.equal((await admin.from('github_integrations').delete().in('user_id',actors.map(a=>a.id))).error,null);});
  for(const actor of actors)assert.equal((await admin.from('github_integrations').upsert({user_id:actor.id,access_token:tokens.get(actor.id),repo_strategy:'manual',default_repo:`fixture/${actor.id}`},{onConflict:'user_id'})).error,null);
  const foreignBefore=await admin.from('github_integrations').select('*').eq('user_id',other.id).single();assert.equal(foreignBefore.error,null);
  globalThis.fetch=async(input,init)=>{
   const url=new URL(String(input instanceof Request?input.url:input));
   if(url.origin==='https://api.github.com'){
    assert.equal(init?.method??'GET','GET');assert.match(url.pathname,/^\/repos\/fixture\//);
    const authorization=new Headers(init?.headers).get('authorization');assert.ok([...tokens.values()].some(token=>authorization===`Bearer ${token}`));sent.push(authorization!);
    return Response.json({message:'Synthetic provider refusal, never forwarded'},{status:404});
   }
   assert.equal(url.hostname,'127.0.0.1','No external request may leave this disposable fixture');
   if(url.pathname==='/rest/v1/github_integrations'&&url.searchParams.get('select')==='repo_strategy,default_repo'&&url.searchParams.get('user_id')===`eq.${owner.id}`){
    if(mode==='outage'){intercepted=true;return Response.json({code:'XX000',message:'synthetic unavailable'},{status:500});}
    const response=await original(input,init);
    if(!intercepted&&['disconnect','replace'].includes(mode)){
     intercepted=true;
     if(mode==='disconnect'){const r=await admin.rpc('revoke_github_oauth_connection',{p_owner_id:owner.id});assert.equal(r.error,null);assert.equal(r.data,true);}
     else assert.equal((await admin.from('github_integrations').update({access_token:'SYNTHETIC_RECONNECTED'}).eq('user_id',owner.id)).error,null);
    }
    return response;
   }
   return original(input,init);
  };
  const app=express();app.use('/api/github',authMiddleware,githubRouter);const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.close();server.closeAllConnections();await once(server,'close');});
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const request=(token:string|undefined,forged:string)=>fetch(`http://127.0.0.1:${address.port}/api/github/repo-state?repoName=fixture/selected&userId=${forged}&tenantId=${forged}`,{headers:token?{authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(15_000)});
  assert.equal((await request(undefined,owner.id)).status,401);assert.deepEqual(sent,[]);
  for(const actor of actors){
   assert.equal(await getGithubDefaultRepo(actor.id),`fixture/${actor.id}`);
   const response=await request(actor.token,actors.find(a=>a.id!==actor.id)!.id);assert.equal(response.status,200);assert.equal((await response.json() as {status:string}).status,'unavailable');assert.equal(sent.at(-1),`Bearer ${tokens.get(actor.id)}`);
  }
  for(mode of ['disconnect','replace','outage']){
   assert.equal((await admin.from('github_integrations').update({access_token:tokens.get(owner.id)}).eq('user_id',owner.id)).error,null);
   const previousRequests:number=sent.length;intercepted=false;const response=await request(owner.token,other.id);assert.equal(response.status,200);assert.equal((await response.json() as {status:string}).status,'unavailable');assert.equal(intercepted,true);assert.equal(sent.length,previousRequests,'Unavailable current authority cannot reach the provider consumer');
   assert.deepEqual((await admin.from('github_integrations').select('*').eq('user_id',other.id).single()).data,foreignBefore.data);
  }
  mode='normal';assert.equal((await admin.from('github_integrations').update({access_token:tokens.get(owner.id)}).eq('user_id',owner.id)).error,null);
  assert.equal(await getGithubDefaultRepo(owner.id),`fixture/${owner.id}`);const restored=await request(owner.token,other.id);assert.equal(restored.status,200);assert.equal(sent.at(-1),`Bearer ${tokens.get(owner.id)}`);
 });
}
