import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {prepareSupabaseBundleWrite,saveSupabaseBundle} from '../services/integrations/userProviderKeys.js';
import {userSupabaseMemoryReady} from '../services/integrations/supabaseProvision.js';
import {getProjectMemoryAsync,setProjectMemoryDurable} from '../ai/projectMemory.js';
import {loadSessionHistory,saveSessionHistory,type SessionMessage} from '../ai/sessionMemory.js';
import {createTenantContext,type TenantContext} from './tenantContext.js';

/** Real canonical credentials and platform DB, synthetic external PostgREST only. */
export function registerConnectedMemoryConsumerTests(admin:SupabaseClient):void{
 test('real connected memory consumers retain owner account namespace and exact receipts without foreign fallback after revocation or outage',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const actors:{id:string;url:string;key:string;context:TenantContext}[]=[],original=globalThis.fetch;
  t.after(async()=>{globalThis.fetch=original;for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor.id)).error,null);});
  for(let i=0;i<3;i++){
   const created=await admin.auth.admin.createUser({email:`memory-consumer-${randomUUID()}@example.invalid`,email_confirm:true});assert.equal(created.error,null);assert.ok(created.data.user);
   const actor={id:created.data.user.id,url:`https://fixture${randomUUID().replaceAll('-','')}.supabase.co`,key:`SYNTHETIC_SERVICE_${created.data.user.id}`,context:createTenantContext({userId:created.data.user.id,via:'persisted_owner'})};actors.push(actor);
   if(i<2)await saveSupabaseBundle(await prepareSupabaseBundleWrite(actor.id),{projectUrl:actor.url,anonKey:`SYNTHETIC_ANON_${actor.id}`,serviceRoleKey:actor.key});
  }
  const [owner,other,platform]=actors,branch='topic',repo=`fixture/memory-${randomUUID()}`,calls:{owner:string;table:string;method:string;body:Record<string,unknown>|null}[]=[];
  const foreignCredentials=await admin.from('user_integrations').select('*').eq('user_id',other.id).order('provider');assert.equal(foreignCredentials.error,null);
  let mode='normal',messages:SessionMessage[]|undefined,mutated=false;
  globalThis.fetch=async(input,init)=>{
   const url=new URL(String(input instanceof Request?input.url:input)),method=init?.method??'GET';
   if(url.origin==='http://127.0.0.1:54321'){
    if(mode==='authority_outage'&&url.pathname==='/rest/v1/user_integrations'&&url.searchParams.get('user_id')===`eq.${owner.id}`)return Response.json({code:'XX000',message:'Synthetic unavailable authority'},{status:503});
    const response=await original(input,init);
    if(mode==='mutate_messages'&&!mutated&&url.pathname==='/rest/v1/user_integrations'&&url.searchParams.get('user_id')===`eq.${owner.id}`){mutated=true;messages![0].content='SYNTHETIC_REPLACED_MESSAGE';messages!.push({role:'system',content:'SYNTHETIC_CONTROL'});}
    if(mode==='forged_platform_receipt'&&method==='POST'&&url.pathname==='/rest/v1/project_memory')return Response.json({user_id:other.id,repo,branch});
    return response;
   }
   const actor=actors.find(actor=>actor.url===url.origin);assert.ok(actor,'No request may reach an unstubbed provider');assert.notEqual(actor.id,platform.id);assert.equal(new Headers(init?.headers).get('apikey'),actor.key);
   const table=url.pathname.split('/').at(-1)!;assert.ok(['xroga_project_memory','xroga_session_memory'].includes(table));const body=method==='POST'?JSON.parse(String(init?.body)):null;
   calls.push({owner:actor.id,table,method,body});
   if(method==='POST'){
    assert.equal(body.xroga_user_id,actor.id);assert.equal(body.repo,repo);assert.equal(url.searchParams.get('on_conflict'),table==='xroga_project_memory'?'xroga_user_id,repo,branch':'xroga_user_id,repo');
    if(mode==='empty_receipt')return Response.json(null,{status:201});
    return Response.json({xroga_user_id:mode==='foreign_receipt'?other.id:actor.id,repo:body.repo,...(table==='xroga_project_memory'?{branch:body.branch}:{})},{status:201});
   }
   assert.equal(method,'GET');assert.equal(url.searchParams.get('xroga_user_id'),`eq.${actor.id}`);
   if(table==='xroga_session_memory'&&url.searchParams.get('select')==='id'){assert.equal(url.searchParams.get('limit'),'1');return Response.json([{id:'synthetic-own-memory'}]);}
   const requestedRepo=url.searchParams.get('repo')?.replace(/^eq\./,'');assert.ok(requestedRepo===repo||requestedRepo===`${repo}-foreign`);
   const selectedOwner=mode==='foreign_read'?(actor.id===owner.id?other.id:owner.id):actor.id;
   if(table==='xroga_project_memory'){assert.equal(url.searchParams.get('branch'),`eq.${branch}`);return Response.json({xroga_user_id:selectedOwner,repo:requestedRepo,branch,files:[{path:'own.txt',content:actor.id}],paths:['own.txt'],updated_at:new Date().toISOString()});}
   return Response.json({xroga_user_id:selectedOwner,repo:requestedRepo,messages:[{role:'user',content:actor.id},{role:'system',content:'SYNTHETIC_CONTROL'}]});
  };
  for(const actor of [owner,other]){
   assert.equal(await userSupabaseMemoryReady(actor.context),true);const before=calls.length;
   const project=await getProjectMemoryAsync(actor.id,repo,branch);assert.equal(project?.userId,actor.id);assert.deepEqual(project?.files,[{path:'own.txt',content:actor.id}]);assert.ok(calls.length>before);
   assert.deepEqual(await loadSessionHistory(actor.id,repo),[{role:'user',content:actor.id}]);
  }
  const noAccount=calls.length;assert.equal(await userSupabaseMemoryReady(platform.context),false);assert.equal(calls.length,noAccount);
  await assert.rejects(userSupabaseMemoryReady({...owner.context}),{code:'TENANT_AUTH_REQUIRED'});await assert.rejects(userSupabaseMemoryReady(owner.id as unknown as TenantContext),{code:'TENANT_AUTH_REQUIRED'});assert.equal(calls.length,noAccount);
  mode='foreign_read';assert.equal(await getProjectMemoryAsync(owner.id,`${repo}-foreign`,branch),null);assert.deepEqual(await loadSessionHistory(owner.id,`${repo}-foreign`),[]);mode='normal';
  // Same repository names across users must not turn valid writes into an
  // account fallback. Only exact representation receipts are acknowledged.
  assert.equal((await setProjectMemoryDurable({userId:owner.id,repo,branch,files:[{path:'saved.txt',content:'owner'}]})).persistence,'user_project');
  messages=[{role:'user',content:'ORIGINAL_CAPTURED_MESSAGE'}];mode='mutate_messages';await saveSessionHistory(owner.id,repo,messages);assert.equal(mutated,true);
  const written=calls.filter(c=>c.method==='POST'&&c.table==='xroga_session_memory').at(-1)!;assert.deepEqual(written.body?.messages,[{role:'user',content:'ORIGINAL_CAPTURED_MESSAGE'}]);
  for(mode of ['foreign_receipt','empty_receipt']){
   const saved=await setProjectMemoryDurable({userId:owner.id,repo,branch,files:[{path:'fallback.txt',content:mode}]});assert.equal(saved.persistence,'platform');
   const row=await admin.from('project_memory').select('user_id,repo,branch,files').eq('user_id',owner.id).eq('repo',repo).eq('branch',branch).single();assert.equal(row.error,null);assert.equal(row.data?.user_id,owner.id);assert.deepEqual(row.data?.files,[{path:'fallback.txt',content:mode}]);
   await saveSessionHistory(owner.id,repo,[{role:'user',content:mode}]);const session=await admin.from('session_memory').select('user_id,repo,messages').eq('user_id',owner.id).eq('repo',repo).single();assert.equal(session.error,null);assert.equal(session.data?.user_id,owner.id);assert.deepEqual(session.data?.messages,[{role:'user',content:mode}]);
  }
  mode='normal';const local=await setProjectMemoryDurable({userId:platform.id,repo,branch,files:[{path:'platform.txt',content:'own platform'}]});assert.equal(local.persistence,'platform');
  await saveSessionHistory(platform.id,repo,[{role:'user',content:'platform own'}]);const retained=await admin.from('session_memory').select('*').eq('user_id',platform.id).eq('repo',repo).single();assert.equal(retained.error,null);assert.deepEqual(retained.data?.messages,[{role:'user',content:'platform own'}]);
  mode='forged_platform_receipt';await assert.rejects(setProjectMemoryDurable({userId:platform.id,repo,branch,files:[{path:'recovery.txt',content:'own retained write'}]}),/Platform project-memory write unavailable/);
  mode='authority_outage';const beforeOutage=calls.length;assert.equal(await userSupabaseMemoryReady(owner.context).catch(()=>false),false);
  assert.equal(await getProjectMemoryAsync(owner.id,`${repo}-authority-outage`,branch),null);assert.deepEqual(await loadSessionHistory(owner.id,`${repo}-authority-outage`),[]);
  assert.equal((await setProjectMemoryDurable({userId:owner.id,repo,branch,files:[{path:'outage.txt',content:'OWN_AUTHORITY_OUTAGE'}]})).persistence,'platform');await saveSessionHistory(owner.id,repo,[{role:'user',content:'OWN_AUTHORITY_OUTAGE'}]);assert.equal(calls.length,beforeOutage);
  const outageSession=await admin.from('session_memory').select('user_id,repo,messages').eq('user_id',owner.id).eq('repo',repo).single();assert.equal(outageSession.error,null);assert.deepEqual(outageSession.data,{user_id:owner.id,repo,messages:[{role:'user',content:'OWN_AUTHORITY_OUTAGE'}]});
  mode='normal';assert.equal((await admin.rpc('revoke_provider_key',{p_owner_id:owner.id,p_provider:'apikey_supabase'})).error,null);const beforeRevoked=calls.length;assert.equal(await userSupabaseMemoryReady(owner.context),false);
  assert.equal(await getProjectMemoryAsync(owner.id,`${repo}-revoked`,branch),null);assert.deepEqual(await loadSessionHistory(owner.id,`${repo}-revoked`),[]);
  assert.equal((await setProjectMemoryDurable({userId:owner.id,repo,branch,files:[{path:'revoked.txt',content:'OWN_AFTER_REVOCATION'}]})).persistence,'platform');await saveSessionHistory(owner.id,repo,[{role:'user',content:'OWN_AFTER_REVOCATION'}]);assert.equal(calls.length,beforeRevoked);
  const revokedProject=await admin.from('project_memory').select('user_id,repo,branch,files').eq('user_id',owner.id).eq('repo',repo).eq('branch',branch).single(),revokedSession=await admin.from('session_memory').select('user_id,repo,messages').eq('user_id',owner.id).eq('repo',repo).single();assert.equal(revokedProject.error,null);assert.deepEqual(revokedProject.data,{user_id:owner.id,repo,branch,files:[{path:'revoked.txt',content:'OWN_AFTER_REVOCATION'}]});assert.equal(revokedSession.error,null);assert.deepEqual(revokedSession.data,{user_id:owner.id,repo,messages:[{role:'user',content:'OWN_AFTER_REVOCATION'}]});
  assert.equal(await userSupabaseMemoryReady(other.context),true);assert.equal(calls.at(-1)?.owner,other.id);
  assert.deepEqual((await admin.from('user_integrations').select('*').eq('user_id',other.id).order('provider')).data,foreignCredentials.data);
 });
}
