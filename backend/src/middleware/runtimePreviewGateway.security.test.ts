import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {resolveTarget} from './runtimePreviewGateway.js';
import {livePreviewUrl} from '../synthesis/livePreview/signing.js';
import type {LivePreviewGrant} from '../synthesis/livePreview/types.js';

test('actual shared HTTP/WebSocket resolver binds signed grant, persisted owner/project/session, lifetime and declared target',async t=>{
  const keys=['NODE_ENV','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','XROGA_PREVIEW_SIGNING_SECRET','XROGA_SANDBOX_FLY_APP','XROGA_SANDBOX_FLY_TOKEN','FLY_APP_NAME'];const old=keys.map(k=>process.env[k]);
  Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55441',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only',XROGA_PREVIEW_SIGNING_SECRET:'synthetic-signing-only',XROGA_SANDBOX_FLY_APP:'xroga-isolated-runtime',XROGA_SANDBOX_FLY_TOKEN:'synthetic-provider-only',FLY_APP_NAME:'xroga-api'});
  t.after(()=>keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}));
  const owner=randomUUID(),project=randomUUID(),session=randomUUID(),now=new Date().toISOString();
  const grant:LivePreviewGrant={previewId:randomUUID(),userId:owner,projectId:project,sessionId:session,runId:randomUUID(),kind:'browser',port:3000,expiresAt:new Date(Date.now()+60000).toISOString(),createdAt:now,revokedAt:null};
  const originalGrant={preview_id:grant.previewId,user_id:owner,project_id:project,session_id:session,run_id:grant.runId,preview_kind:grant.kind,port:3000,expires_at:grant.expiresAt,created_at:now,revoked_at:null};
  const state={schemaVersion:'1.0.0',providerId:'fly-project-runtime',userId:owner,projectId:project,sessionId:session,status:'running',runtimeClass:'interactive',ports:[{port:3000,protocol:'http',status:'listening'}],expiresAt:null,providerState:{machineId:'abc123',app:'xroga-isolated-runtime'}};
  let grantRow:Record<string,unknown>={...originalGrant},row:Record<string,unknown>={user_id:owner,project_id:project,session_id:session,state};
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{
    const url=new URL(String(input));assert.equal(url.origin,process.env.SUPABASE_URL,'No target connection or provider IO is authorized');
    if(url.pathname==='/rest/v1/project_preview_grants'){assert.equal(url.searchParams.get('preview_id'),'eq.'+grant.previewId);return Response.json(grantRow);}
    assert.equal(url.pathname,'/rest/v1/project_runtime_sessions');assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.equal(url.searchParams.get('session_id'),'eq.'+session);return Response.json(row);
  });
  const host=new URL(livePreviewUrl(grant)).hostname;
  assert.deepEqual(await resolveTarget(host),{host:'abc123.vm.xroga-isolated-runtime.internal',port:3000,publicHost:host});
  for(const change of [{user_id:randomUUID()},{project_id:randomUUID()},{session_id:randomUUID()},
    {state:{...state,userId:randomUUID()}},{state:{...state,projectId:randomUUID()}},{state:{...state,status:'stopped'}},
    {state:{...state,expiresAt:'invalid'}},{state:{...state,ports:[]}},{state:{...state,providerState:{machineId:'127.0.0.1/metadata',app:'xroga'}}},
    {state:{...state,providerId:undefined}},{state:{...state,providerId:'unknown-provider'}},{state:{...state,providerState:{machineId:'abc123',app:'other-valid-app'}}}]){
    row={user_id:owner,project_id:project,session_id:session,state,...change};assert.equal(await resolveTarget(host),null);
  }
  row={user_id:owner,project_id:project,session_id:session,state};
  for(const change of [{revoked_at:now},{expires_at:new Date(Date.now()-1).toISOString()},{expires_at:'invalid'},{project_id:randomUUID()}]){
    grantRow={...originalGrant,...change};assert.equal(await resolveTarget(host),null);
  }
  grantRow={...originalGrant};assert.equal(await resolveTarget(host.replace(grant.previewId.replaceAll('-',''),'0'.repeat(32))),null);
});
