import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SupabaseProjectRuntimeStore } from '../projectRuntime/store.js';
import type { ProjectRuntimeSession } from '../projectRuntime/types.js';
import { createLivePreviewGrant, getLatestLivePreviewGrant, getLivePreviewGrant } from './store.js';

test('preview grant input and returned capability stay bound across a held session lookup',async t=>{
  const providerKeys=['XROGA_SANDBOX_FLY_APP','XROGA_SANDBOX_FLY_TOKEN','FLY_APP_NAME'],providerEnv=providerKeys.map(key=>process.env[key]);
  Object.assign(process.env,{XROGA_SANDBOX_FLY_APP:'fixture-app',XROGA_SANDBOX_FLY_TOKEN:'synthetic-provider-only',FLY_APP_NAME:'xroga-api'});
  t.after(()=>providerKeys.forEach((key,index)=>{if(providerEnv[index]===undefined)delete process.env[key];else process.env[key]=providerEnv[index];}));
  const owner=randomUUID(),project='fixture-project',sessionId=randomUUID(),run='fixture-run',now=new Date().toISOString();
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='http://127.0.0.1:49239';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-preview-fixture-only';
  t.after(()=>{
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
  });
  const session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId,userId:owner,projectId:project,providerId:'fly-project-runtime',runtimeClass:'interactive',status:'running',
    image:null,workspaceRevision:1,knownFiles:[],processes:[],createdAt:now,updatedAt:now,
    ports:[{port:3000,protocol:'http',processId:'fixture',status:'declared'}],providerState:{machineId:'abc123',app:'fixture-app'},expiresAt:null};
  let enter!:()=>void,release!:()=>void;
  const entered=new Promise<void>(resolve=>{enter=resolve;}),gate=new Promise<void>(resolve=>{release=resolve;});
  let held=true,patch:Record<string,unknown>={},outage=false,last:Record<string,any>|null=null,read:Record<string,any>|null=null;
  let shape='one',denial:string|null=null;
  t.mock.method(SupabaseProjectRuntimeStore.prototype,'loadSession',async(userId:string,id:string)=>{
    assert.equal(userId,owner);assert.equal(id,sessionId);if(held){enter();await gate;}return session;
  });
  t.mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{
    const url=new URL(String(input));assert.equal(url.origin,'http://127.0.0.1:49239');
    if(outage)return Response.json({code:'08006',message:'synthetic private diagnostic'},{status:503});
    if(init?.method==='POST'){
      assert.equal(url.pathname,'/rest/v1/rpc/create_project_preview_grant');
      const args=JSON.parse(String(init.body));assert.equal(args.p_owner,owner);assert.deepEqual(args.p_session,session);
      if(denial)return Response.json({code:denial,message:'synthetic private diagnostic'},{status:400});
      const body=args.p_grant;last={...body,created_at:now,revoked_at:null};
      return Response.json(shape==='empty'?[]:shape==='duplicate'?[last,last]:[{...last,...patch}]);
    }
    assert.equal(url.pathname,'/rest/v1/project_preview_grants');
    if(url.searchParams.has('preview_id'))assert.match(url.searchParams.get('preview_id')!,/^eq\.[0-9a-f-]+$/);
    else{assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);assert.equal(url.searchParams.get('project_id'),`eq.${project}`);assert.equal(url.searchParams.get('session_id'),`eq.${sessionId}`);}
    return Response.json(read);
  });
  const original={userId:owner,projectId:project,sessionId,runId:run,kind:'browser' as const,port:3000,expiresAt:new Date(Date.now()+60_000).toISOString()};
  const mutable={...original},pending=createLivePreviewGrant(mutable);await entered;
  Object.assign(mutable,{userId:randomUUID(),projectId:'other',sessionId:randomUUID(),runId:'other',kind:'api',port:4000,expiresAt:new Date(Date.now()+120_000).toISOString()});
  release();const saved=await pending;held=false;
  for(const key of ['userId','projectId','sessionId','runId','kind','port','expiresAt'] as const)assert.equal(saved[key],original[key]);
  assert.equal(last!.user_id,owner);assert.equal(last!.project_id,project);assert.equal(last!.session_id,sessionId);
  const receipt={...last!};
  for(patch of [{preview_id:randomUUID()},{user_id:'foreign'},{project_id:'foreign'},{session_id:'foreign'},{run_id:'foreign'},
    {preview_kind:'api'},{preview_kind:'unknown'},{port:4000},{port:'3000'},{port:0},{expires_at:new Date(Date.now()+120_000).toISOString()},
    {expires_at:'invalid'},{created_at:null},{revoked_at:now},{revoked_at:'invalid'}]){
    await assert.rejects(createLivePreviewGrant(original),{code:'RESOURCE_ACCESS_UNAVAILABLE',status:503});
  }
  patch={};for(shape of ['empty','duplicate'])await assert.rejects(createLivePreviewGrant(original),{code:'RESOURCE_ACCESS_UNAVAILABLE',status:503});shape='one';
  for(denial of ['42501','40001','22023'])await assert.rejects(createLivePreviewGrant(original),{code:'RESOURCE_NOT_FOUND',status:404});denial=null;
  outage=true;await assert.rejects(createLivePreviewGrant(original),{code:'RESOURCE_ACCESS_UNAVAILABLE',status:503});outage=false;
  read=receipt;assert.equal((await getLivePreviewGrant(receipt.preview_id.toUpperCase()))?.previewId,receipt.preview_id);
  assert.equal((await getLatestLivePreviewGrant({userId:owner,projectId:project,sessionId}))?.previewId,receipt.preview_id);
  for(const mutation of [{preview_id:'invalid'},{user_id:null},{project_id:null},{session_id:null},{run_id:null},{preview_kind:'unknown'},{port:65536},{expires_at:'invalid'},{created_at:'invalid'},{revoked_at:'invalid'}]){
    read={...receipt,...mutation};assert.equal(await getLivePreviewGrant(receipt.preview_id),null);
  }
  read={...receipt,preview_id:randomUUID()};assert.equal(await getLivePreviewGrant(receipt.preview_id),null);
  for(const mutation of [{user_id:'foreign'},{project_id:'foreign'},{session_id:'foreign'},{revoked_at:now},{expires_at:new Date(Date.now()-1).toISOString()}]){
    read={...receipt,...mutation};assert.equal(await getLatestLivePreviewGrant({userId:owner,projectId:project,sessionId}),null);
  }
  outage=true;assert.equal(await getLivePreviewGrant(receipt.preview_id),null);
});

test('native Google grant admission uses the owned declared session without requiring Fly routing fields',async t=>{
  const owner=randomUUID(),project=randomUUID(),sessionId=randomUUID(),run=randomUUID(),now=new Date().toISOString();
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL='http://127.0.0.1:49239';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-preview-fixture-only';
  t.after(()=>{
    if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
    if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey;
  });
  const session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId,userId:owner,projectId:project,providerId:'google-gce',runtimeClass:'interactive',status:'running',
    image:'synthetic-pinned-image',workspaceRevision:1,knownFiles:[],processes:[],createdAt:now,updatedAt:now,
    ports:[{port:3000,protocol:'http',processId:'fixture',status:'declared'}],
    providerState:{gce:{name:'xroga-exec-slot-1',runtimeId:sessionId,instanceId:'123'},project:'synthetic-project',zone:'us-central1-a',baseImageId:'123'},
    expiresAt:new Date(Date.now()+120_000).toISOString()};
  let current:ProjectRuntimeSession|null=session,calls=0;
  t.mock.method(SupabaseProjectRuntimeStore.prototype,'loadSession',async()=>current);
  t.mock.method(globalThis,'fetch',async(input:unknown,init?:RequestInit)=>{
    assert.equal(String(input),'http://127.0.0.1:49239/rest/v1/rpc/create_project_preview_grant');
    calls++;const args=JSON.parse(String(init?.body));assert.equal(args.p_owner,owner);assert.deepEqual(args.p_session,session);
    return Response.json([{...args.p_grant,created_at:now,revoked_at:null}]);
  });
  const input={userId:owner,projectId:project,sessionId,runId:run,kind:'browser' as const,port:3000,expiresAt:new Date(Date.now()+60_000).toISOString()};
  assert.equal((await createLivePreviewGrant(input)).sessionId,sessionId);assert.equal(calls,1);
  for(const patch of [{userId:randomUUID()},{projectId:randomUUID()},{sessionId:randomUUID()},{status:'stopped'},
    {runtimeClass:'verification'},{ports:[]},{expiresAt:new Date(Date.now()-1).toISOString()}]){
    current={...session,...patch} as ProjectRuntimeSession;
    await assert.rejects(createLivePreviewGrant(input),{status:404,code:'RESOURCE_NOT_FOUND'});assert.equal(calls,1);
  }
  current=null;await assert.rejects(createLivePreviewGrant(input),{status:404,code:'RESOURCE_NOT_FOUND'});assert.equal(calls,1);
});
