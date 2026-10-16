import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ensureProjectIdByRepo,upsertBuildProject} from './buildProjectStore.js';

test('build persistence rejects substituted create, update and completion receipts',async t=>{
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],previous=keys.map(k=>process.env[k]);
 t.after(()=>keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}));
 process.env.SUPABASE_URL='http://127.0.0.1:49197';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
 const owner='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222';
 let mode='insert',writes:Record<string,unknown>[]=[];
 t.mock.method(globalThis,'fetch',async(raw:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(raw));assert.equal(url.origin,'http://127.0.0.1:49197');
  if(!init?.method||init.method==='GET')return Response.json(mode==='insert'||mode==='ensure'?[]:[{id:project}]);
  const body=JSON.parse(String(init.body));writes.push(body);
  if(url.pathname.endsWith('/project_messages'))return Response.json(null);
  const wrong=mode==='insert'||mode==='ensure'||mode==='update'||(mode==='complete'&&body.status==='completed');
  return Response.json([{id:wrong?'different':body.id??project}]);
 });
 const input={userId:owner,name:'fixture',userPrompt:'fixture',githubRepoName:'fixture/repo',projectFiles:[]};
 for(mode of ['insert','update','complete']){writes=[];assert.equal(await upsertBuildProject(input),null);if(mode!=='complete')assert.equal(writes.length,1);}
 mode='ensure';writes=[];assert.equal(await ensureProjectIdByRepo(owner,'fixture/repo'),null);assert.equal(writes.length,1);
 mode='valid';assert.equal(await upsertBuildProject(input),project);
});

test('build persistence snapshots owner and build data before delayed lookup',async t=>{
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'],previous=keys.map(k=>process.env[k]);
 t.after(()=>keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}));
 process.env.SUPABASE_URL='http://127.0.0.1:49197';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
 const owner='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222';
 let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
 const bodies:Record<string,unknown>[]=[];
 t.mock.method(globalThis,'fetch',async(raw:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(raw));assert.equal(url.origin,'http://127.0.0.1:49197');
  if(!init?.method||init.method==='GET'){entered();await gate;return Response.json([{id:project}]);}
  if(url.pathname.endsWith('/projects'))assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);
  bodies.push(JSON.parse(String(init.body)));return Response.json(url.pathname.endsWith('/projects')?[{id:project}]:null);
 });
 const input={userId:owner,name:'original',userPrompt:'original prompt',githubRepoName:'fixture/repo',projectFiles:[]};
 const pending=upsertBuildProject(input);await started;input.userId='foreign';input.name='changed';input.userPrompt='changed';input.githubRepoName='foreign/repo';release();
 assert.equal(await pending,project);assert.equal(bodies[0].name,'original');assert.equal(bodies[0].github_repo_name,'fixture/repo');assert.equal(bodies[1].content,'original prompt');
});
