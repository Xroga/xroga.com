import assert from 'node:assert/strict';
import {test} from 'node:test';
import {persistBuildRun,type BuildPersistInput} from './buildPersistence.js';
import {createTenantContext,type TenantContext} from '../../security/tenantContext.js';
import {getPreviousBuilds} from './buildMemory.js';

test('dormant legacy build writer rejects non-issued and foreign authority before database access',async()=>{
 const original=globalThis.fetch,owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
 const context=createTenantContext({userId:owner,via:'persisted_owner'});
 const input:BuildPersistInput={userId:owner,prompt:'Synthetic local fixture',featureCategory:'landing_page',success:true,polishedReply:'Fixture only'};
 globalThis.fetch=async()=>assert.fail('Invalid authority cannot reach any database or network');
 try{
  for(const value of [undefined,null,owner,{userId:owner,tenantId:owner},{...context}])await assert.rejects(persistBuildRun(value as TenantContext,input),{status:401,code:'TENANT_AUTH_REQUIRED'});
  for(const value of [undefined,null,owner,{userId:owner,tenantId:owner},{...context}])await assert.rejects(getPreviousBuilds(value as TenantContext),{status:401,code:'TENANT_AUTH_REQUIRED'});
  await assert.rejects(persistBuildRun(context,{...input,userId:other}),{status:404,code:'RESOURCE_NOT_FOUND'});
 }finally{globalThis.fetch=original;}
});

test('legacy build persistence requires exact owner parent and run receipts and does not acknowledge unavailable writes',async t=>{
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],previous=keys.map(k=>process.env[k]);
 t.after(()=>keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}));
 process.env.SUPABASE_URL='http://127.0.0.1:49195';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
 const owner='00000000-0000-4000-8000-000000000001',context=createTenantContext({userId:owner,via:'persisted_owner'}),run='00000000-0000-4000-8000-000000000003',project='00000000-0000-4000-8000-000000000004';
 const input:BuildPersistInput={userId:owner,runId:run,projectId:project,prompt:'Synthetic fixture',featureCategory:'landing_page',success:true,polishedReply:'Fixture only',messagesSnapshot:[{content:'ORIGINAL'}]};
 let mode='valid';
 t.mock.method(globalThis,'fetch',async(raw:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(raw));assert.equal(url.origin,'http://127.0.0.1:49195');assert.equal(url.pathname,'/rest/v1/swarm_runs');assert.equal(init?.method,'POST');assert.equal(url.searchParams.has('on_conflict'),false);assert.equal(url.searchParams.get('select'),'id,user_id,project_id,prompt,status,output');
  const body=JSON.parse(String(init?.body));assert.equal(body.user_id,owner);assert.equal(body.project_id,project);assert.equal(body.id,run);assert.deepEqual(body.output.messagesSnapshot,[{content:'ORIGINAL'}]);
  if(mode==='outage')return Response.json({message:'SYNTHETIC_PRIVATE_DATABASE_DETAIL'},{status:503});
  if(mode==='empty')return Response.json(null);
  if(mode==='array')return Response.json([{id:run,user_id:owner,project_id:project},{id:run,user_id:owner,project_id:project}]);
  return Response.json({id:mode==='run'?'different':run,user_id:mode==='owner'?'different':owner,project_id:mode==='parent'?'different':project,prompt:mode==='prompt'?'different':body.prompt,status:mode==='status'?'failed':body.status,output:mode==='output'?{foreign:true}:body.output});
 });
 assert.equal(await persistBuildRun(context,input),run);
 for(mode of ['empty','array','run','owner','parent','prompt','status','output','outage'])await assert.rejects(persistBuildRun(context,input),{status:503,code:'RESOURCE_ACCESS_UNAVAILABLE'});
});

test('legacy build persistence retains captured owner parent and nested output when its caller changes during I/O',async t=>{
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],previous=keys.map(k=>process.env[k]);
 t.after(()=>keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}));
 process.env.SUPABASE_URL='http://127.0.0.1:49195';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
 const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',context=createTenantContext({userId:owner,via:'persisted_owner'}),run='00000000-0000-4000-8000-000000000003',project='00000000-0000-4000-8000-000000000004';
 const input:BuildPersistInput={userId:owner,runId:run,projectId:project,prompt:'Original prompt',featureCategory:'landing_page',success:true,polishedReply:'Original reply',messagesSnapshot:[{content:'ORIGINAL'}]};
 t.mock.method(globalThis,'fetch',async(raw:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  assert.equal(new URL(String(raw)).origin,'http://127.0.0.1:49195');
  const body=JSON.parse(String(init?.body));assert.equal(body.user_id,owner);assert.equal(body.project_id,project);assert.equal(body.prompt,'Original prompt');assert.deepEqual(body.output.messagesSnapshot,[{content:'ORIGINAL'}]);
  input.userId=other;input.projectId=other;input.runId=other;input.polishedReply='REPLACED';(input.messagesSnapshot![0] as {content:string}).content='REPLACED';
  return Response.json(body);
 });
 assert.equal(await persistBuildRun(context,input),run);
});
