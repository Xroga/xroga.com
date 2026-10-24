import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ensureProjectIdByRepo,findProjectIdByRepo,upsertBuildProject} from './buildProjectStore.js';
import {createTenantContext,type TenantContext} from '../../security/tenantContext.js';

const owner='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',message='33333333-3333-4333-8333-333333333333';
const context=createTenantContext({userId:owner,via:'persisted_owner'});
function atomicReceipt(body:any){
 const repo=body.p_project.github_repo_name;
 return{created:body.p_expected_id===null,project:{id:project,user_id:owner,...body.p_project,github_repo_name:repo??null,github_repo_url:body.p_project.github_repo_url??null,status:'in_progress'},messages:[{
  id:message,project_id:project,role:'user',content:body.p_build.user_prompt,metadata:{...(body.p_build.run_id!==undefined?{runId:body.p_build.run_id}:{}),...(body.p_build.deploy_url!==undefined?{deployUrl:body.p_build.deploy_url}:{}),...(repo?{githubRepoName:repo}:{}),githubBranch:body.p_build.github_branch,source:'build'}}]};
}

test('dormant project exports require original issued owner context before any database access',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{assert.fail('Invalid authority must not reach persistence');});
 for(const invalid of [owner,{...context},JSON.parse(JSON.stringify(context))]){
  await assert.rejects(findProjectIdByRepo(invalid as TenantContext,'fixture/repo'),{status:401});
  await assert.rejects(ensureProjectIdByRepo(invalid as TenantContext,'fixture/repo'),{status:401});
  await assert.rejects(upsertBuildProject(invalid as TenantContext,{userId:owner,name:'fixture',userPrompt:'fixture',projectFiles:[]}),{status:401});
 }
 await assert.rejects(upsertBuildProject(context,{userId:'44444444-4444-4444-8444-444444444444',name:'fixture',userPrompt:'fixture',projectFiles:[]}),{status:404});
});

test('build persistence rejects substituted create, update and completion receipts',async t=>{
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],previous=keys.map(k=>process.env[k]);
 t.after(()=>keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}));
 process.env.SUPABASE_URL='http://127.0.0.1:49197';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
 let mode='insert',writes:Record<string,unknown>[]=[];
 t.mock.method(globalThis,'fetch',async(raw:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(raw));assert.equal(url.origin,'http://127.0.0.1:49197');
  if(!init?.method||init.method==='GET')return Response.json(mode==='insert'||mode==='ensure'?[]:[{id:project,user_id:owner,github_repo_name:'fixture/repo'}]);
  const body=JSON.parse(String(init.body));writes.push(body);
  assert.notEqual(url.pathname,'/rest/v1/project_messages','Required messages must share the owned parent transaction');
  if(url.pathname.endsWith('/rpc/save_owned_build_project_atomic')){
   const receipt=atomicReceipt(body);if(mode==='insert'||mode==='update')receipt.project.id='different';return Response.json(receipt);
  }
  const wrong=mode==='insert'||mode==='ensure'||mode==='update'||(mode==='complete'&&body.status==='completed');
  return Response.json(body.status==='completed'?{id:wrong?'different':project,user_id:owner,status:'completed'}:[{id:wrong?'different':body.id??project,user_id:owner,github_repo_name:'fixture/repo'}]);
 });
 const input={userId:owner,name:'fixture',userPrompt:'fixture',githubRepoName:'fixture/repo',projectFiles:[]};
 for(mode of ['insert','update','complete']){writes=[];assert.equal(await upsertBuildProject(context,input),null);if(mode!=='complete')assert.equal(writes.length,1);}
 mode='ensure';writes=[];assert.equal(await ensureProjectIdByRepo(context,'fixture/repo'),null);assert.equal(writes.length,1);
 mode='valid';assert.equal(await upsertBuildProject(context,input),project);
 assert.equal(await upsertBuildProject(context,{...input,githubRepoName:undefined}),project);
 assert.equal(await upsertBuildProject(context,{...input,githubRepoName:''}),project);
});

test('build persistence snapshots owner and build data before delayed lookup',async t=>{
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],previous=keys.map(k=>process.env[k]);
 t.after(()=>keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}));
 process.env.SUPABASE_URL='http://127.0.0.1:49197';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
 let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
 const bodies:Record<string,unknown>[]=[];
 t.mock.method(globalThis,'fetch',async(raw:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(raw));assert.equal(url.origin,'http://127.0.0.1:49197');
  if(!init?.method||init.method==='GET'){entered();await gate;return Response.json([{id:project,user_id:owner,github_repo_name:'fixture/repo'}]);}
  if(url.pathname.endsWith('/projects'))assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);
  const body=JSON.parse(String(init.body));bodies.push(body);
  return Response.json(url.pathname.endsWith('/rpc/save_owned_build_project_atomic')?atomicReceipt(body):{id:project,user_id:owner,status:'completed'});
 });
 const input={userId:owner,name:'original',userPrompt:'original prompt',githubRepoName:'fixture/repo',projectFiles:[]};
 const pending=upsertBuildProject(context,input);await started;input.userId='foreign';input.name='changed';input.userPrompt='changed';input.githubRepoName='foreign/repo';release();
 assert.equal(await pending,project);assert.equal((bodies[0].p_project as any).name,'original');assert.equal((bodies[0].p_project as any).github_repo_name,'fixture/repo');assert.equal((bodies[0].p_build as any).user_prompt,'original prompt');
});

test('atomic build persistence rejects foreign parent and altered required-message receipts before completion',async t=>{
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],previous=keys.map(k=>process.env[k]);
 t.after(()=>keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}));
 process.env.SUPABASE_URL='http://127.0.0.1:49197';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
 let mode='',completions=0;
 t.mock.method(globalThis,'fetch',async(raw:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(raw));assert.equal(url.origin,'http://127.0.0.1:49197');
  if(!init?.method||init.method==='GET')return Response.json([{id:project,user_id:owner,github_repo_name:'fixture/repo'}]);
  if(init.method==='PATCH'){completions++;return Response.json({id:project,user_id:owner,status:'completed'});}
  assert.equal(url.pathname,'/rest/v1/rpc/save_owned_build_project_atomic');const receipt:any=atomicReceipt(JSON.parse(String(init.body)));
  if(mode==='owner')receipt.project.user_id='44444444-4444-4444-8444-444444444444';
  if(mode==='repo')receipt.project.github_repo_name='foreign/repo';
  if(mode==='status')receipt.project.status='completed';
  if(mode==='created')delete receipt.created;
  if(mode==='parent')receipt.messages[0].project_id='44444444-4444-4444-8444-444444444444';
  if(mode==='content')receipt.messages[0].content='foreign';
  if(mode==='metadata')receipt.messages[0].metadata.runId='foreign';
  if(mode==='empty')receipt.messages=[];
  if(mode==='duplicate')receipt.messages.push(receipt.messages[0]);
  return Response.json(receipt);
 });
 const input={userId:owner,name:'fixture',userPrompt:'Exact prompt',githubRepoName:'fixture/repo',projectFiles:[]};
 for(mode of ['owner','repo','status','created','parent','content','metadata','empty','duplicate']){assert.equal(await upsertBuildProject(context,input),null);assert.equal(completions,0);}
 mode='valid';assert.equal(await upsertBuildProject(context,input),project);assert.equal(completions,1);
});
