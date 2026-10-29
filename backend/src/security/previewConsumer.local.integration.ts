import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {resolveTarget} from '../middleware/runtimePreviewGateway.js';
import {SupabaseProjectRuntimeStore} from '../synthesis/projectRuntime/store.js';
import type {ProjectRuntimeSession} from '../synthesis/projectRuntime/types.js';
import {createLivePreviewGrant,getLatestLivePreviewGrant,revokeLivePreviewGrants} from '../synthesis/livePreview/store.js';
import {livePreviewUrl} from '../synthesis/livePreview/signing.js';

/** Exercise the actual HTTP/WebSocket resolver without opening an upstream socket. */
export function registerPreviewConsumerTests(admin:SupabaseClient,getUsers:()=>readonly {id:string}[]):void{
 test('real signed preview consumer rechecks current private grant and session before selecting any upstream target',async t=>{
  const priorProviderApp=process.env.XROGA_SANDBOX_FLY_APP;
  const priorProviderToken=process.env.XROGA_SANDBOX_FLY_TOKEN;
  const priorControlApp=process.env.FLY_APP_NAME;
  Object.assign(process.env,{XROGA_SANDBOX_FLY_APP:'fixture-private',XROGA_SANDBOX_FLY_TOKEN:'synthetic-provider-only',FLY_APP_NAME:'xroga-api'});
  t.after(()=>{
    if(priorProviderApp===undefined)delete process.env.XROGA_SANDBOX_FLY_APP;else process.env.XROGA_SANDBOX_FLY_APP=priorProviderApp;
    if(priorProviderToken===undefined)delete process.env.XROGA_SANDBOX_FLY_TOKEN;else process.env.XROGA_SANDBOX_FLY_TOKEN=priorProviderToken;
    if(priorControlApp===undefined)delete process.env.FLY_APP_NAME;else process.env.FLY_APP_NAME=priorControlApp;
  });
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const [owner,other]=getUsers(),store=new SupabaseProjectRuntimeStore(),sessionIds:string[]=[],original=globalThis.fetch,prior=process.env.XROGA_PREVIEW_SIGNING_SECRET;
  process.env.XROGA_PREVIEW_SIGNING_SECRET=`SYNTHETIC_LOCAL_${randomUUID()}`;
  t.after(async()=>{globalThis.fetch=original;if(prior===undefined)delete process.env.XROGA_PREVIEW_SIGNING_SECRET;else process.env.XROGA_PREVIEW_SIGNING_SECRET=prior;assert.equal((await admin.from('project_preview_grants').delete().in('session_id',sessionIds)).error,null);assert.equal((await admin.from('project_runtime_sessions').delete().in('session_id',sessionIds)).error,null);});
  const seed=async(userId:string)=>{
   const now=new Date().toISOString(),session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId:randomUUID(),userId,projectId:`signed-fixture-${randomUUID()}`,providerId:'fly-project-runtime',runtimeClass:'interactive',status:'running',image:null,workspaceRevision:1,knownFiles:[],processes:[],ports:[{port:3000,protocol:'http',processId:'fixture',status:'declared'}],providerState:{machineId:'abc123',app:'fixture-private'},createdAt:now,updatedAt:now,expiresAt:new Date(Date.now()+60_000).toISOString()};
   sessionIds.push(session.sessionId);await store.saveSession(session);const grant=await createLivePreviewGrant({userId,projectId:session.projectId,sessionId:session.sessionId,runId:randomUUID(),kind:'browser',port:3000,expiresAt:session.expiresAt!});return{session,grant,host:new URL(livePreviewUrl(grant)).hostname};
  };
  const own=await seed(owner.id),foreign=await seed(other.id);let outage=false;
  globalThis.fetch=async(input,init)=>{const url=new URL(String(input instanceof Request?input.url:input));assert.equal(url.origin,'http://127.0.0.1:54321','Resolver may query only disposable authority, never a provider');if(outage&&url.pathname==='/rest/v1/project_preview_grants')return Response.json({message:'SYNTHETIC_AUTHORITY_OUTAGE'},{status:503});return original(input,init);};
  const target=await resolveTarget(own.host);assert.ok(target);
  const {revalidate,expiresAt,...route}=target;
  assert.deepEqual(route,{host:'abc123.vm.fixture-private.internal',port:3000,publicHost:own.host});
  assert.equal(expiresAt,Date.parse(own.grant.expiresAt));assert.equal(await revalidate(),true);
  const parts=own.host.split('.');parts[1]=parts[1][0]==='a'?'b'+parts[1].slice(1):'a'+parts[1].slice(1);assert.equal(await resolveTarget(parts.join('.')),null);
  parts[0]=foreign.grant.previewId.replaceAll('-','');parts[1]=own.host.split('.')[1];assert.equal(await resolveTarget(parts.join('.')),null);
  assert.equal(await resolveTarget('invalid.example.invalid'),null);
  assert.equal(await getLatestLivePreviewGrant({userId:other.id,projectId:own.session.projectId,sessionId:own.session.sessionId}),null);
  assert.equal(await getLatestLivePreviewGrant({userId:owner.id,projectId:foreign.session.projectId,sessionId:foreign.session.sessionId}),null);
  assert.equal((await getLatestLivePreviewGrant({userId:owner.id,projectId:own.session.projectId,sessionId:own.session.sessionId}))?.previewId,own.grant.previewId);
  const snapshot=async()=>{const r=await admin.from('project_preview_grants').select('*').eq('preview_id',own.grant.previewId).single();assert.equal(r.error,null);return r.data!;};
  const before=await snapshot();await revokeLivePreviewGrants({userId:other.id,projectId:own.session.projectId,sessionId:own.session.sessionId});assert.deepEqual(await snapshot(),before);
  assert.equal((await admin.from('project_runtime_sessions').update({state:{...own.session,ports:[]}}).eq('session_id',own.session.sessionId).eq('user_id',owner.id)).error,null);assert.equal(await resolveTarget(own.host),null);
  assert.equal((await admin.from('project_runtime_sessions').update({state:own.session}).eq('session_id',own.session.sessionId).eq('user_id',owner.id)).error,null);assert.ok(await resolveTarget(own.host));
  outage=true;assert.equal(await resolveTarget(own.host),null);assert.equal(await revalidate(),false);outage=false;
  await revokeLivePreviewGrants({userId:owner.id,projectId:own.session.projectId,sessionId:own.session.sessionId});assert.equal(await resolveTarget(own.host),null);assert.equal(await revalidate(),false);assert.equal(await getLatestLivePreviewGrant({userId:owner.id,projectId:own.session.projectId}),null);
  assert.ok(await resolveTarget(foreign.host));const after=await snapshot();assert.equal(after.user_id,before.user_id);assert.equal(after.project_id,before.project_id);assert.equal(after.session_id,before.session_id);assert.equal(after.run_id,before.run_id);assert.ok(after.revoked_at);
 });
}
