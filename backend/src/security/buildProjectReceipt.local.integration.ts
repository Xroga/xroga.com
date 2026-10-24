import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {ensureProjectIdByRepo,findProjectIdByRepo,projectIdentityId,upsertBuildProject} from '../services/memory/buildProjectStore.js';
import {type TenantContext} from './tenantContext.js';
import {storeProjectFile} from '../services/storage/projectFiles.js';
import {createClient} from '@supabase/supabase-js';
import {setTimeout as delay} from 'node:timers/promises';
import pg from 'pg';

export function registerBuildProjectReceiptTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;context:TenantContext;token:string}[]):void{
 const connect=()=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');return new pg.Client({connectionString:url.href,ssl:false});
 };
 test('real build persistence receipts preserve exact owner, project and inline file identity',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const [actor,other]=getUsers(),owner=actor.id,repo=`fixture/receipt-${randomUUID()}`,ids:string[]=[];
  t.after(async()=>{if(ids.length)assert.equal((await admin.from('projects').delete().in('id',ids)).error,null);});
  const identities=await Promise.all([ensureProjectIdByRepo(actor.context,repo),ensureProjectIdByRepo(actor.context,repo)]),id=identities[0];assert.ok(id);assert.deepEqual(identities,[id,id]);ids.push(id);
  assert.equal(await ensureProjectIdByRepo(actor.context,repo),id);
  assert.equal(await upsertBuildProject(actor.context,{userId:owner,name:'Receipt fixture',userPrompt:'Fixture only',githubRepoName:repo,projectFiles:[{path:'index.html',content:'<p>Receipt fixture</p>'}]}),id);
  const project=await admin.from('projects').select('id,user_id,status').eq('id',id).single();assert.equal(project.error,null);assert.deepEqual(project.data,{id,user_id:owner,status:'completed'});
  const files=await admin.from('project_files').select('id,project_id,content,file_url,storage_metadata').eq('project_id',id);assert.equal(files.error,null);assert.equal(files.data?.length,1);
  const file=files.data![0];assert.equal(file.project_id,id);assert.equal(file.content,'<p>Receipt fixture</p>');assert.ok(file.file_url.includes(file.id));assert.equal(file.storage_metadata.ownerId,owner);assert.equal(file.storage_metadata.provider,'database');
  const foreignId=await ensureProjectIdByRepo(other.context,repo);assert.ok(foreignId);assert.notEqual(foreignId,id);ids.push(foreignId);
  assert.equal(await findProjectIdByRepo(actor.context,repo),id);assert.equal(await findProjectIdByRepo(other.context,repo),foreignId);
  const foreignBefore=await admin.from('projects').select('*').eq('id',foreignId).single();assert.equal(foreignBefore.error,null);
  await assert.rejects(storeProjectFile(actor.context,foreignId,'denied.txt','MUST_NOT_PERSIST','text/plain','code'),{status:404});
  for(const context of [actor.id,{...actor.context},JSON.parse(JSON.stringify(actor.context))])await assert.rejects(findProjectIdByRepo(context as TenantContext,repo),{status:401});
  await assert.rejects(upsertBuildProject(actor.context,{userId:other.id,name:'Denied',userPrompt:'Denied',githubRepoName:repo,projectFiles:[]}),{status:404});
  assert.deepEqual((await admin.from('projects').select('*').eq('id',foreignId).single()).data,foreignBefore.data);
  assert.equal(await upsertBuildProject(other.context,{userId:other.id,name:'Foreign own positive',userPrompt:'OTHER_OWNER_ONLY',githubRepoName:repo,projectFiles:[{path:'index.html',content:'OTHER_OWNER_FILE'}]}),foreignId);
  assert.equal((await admin.from('project_files').select('content').eq('id',file.id).single()).data?.content,'<p>Receipt fixture</p>');
  const otherFiles=await admin.from('project_files').select('project_id,content,storage_metadata').eq('project_id',foreignId);assert.equal(otherFiles.error,null);assert.equal(otherFiles.data?.length,1);assert.equal(otherFiles.data![0].content,'OTHER_OWNER_FILE');assert.equal(otherFiles.data![0].storage_metadata.ownerId,other.id);
  const directRepo=`fixture/direct-${randomUUID()}`,direct=await upsertBuildProject(actor.context,{userId:owner,name:'Direct owned build',userPrompt:'NEW_OWNED_BUILD',summaryText:'NEW_OWNED_SUMMARY',githubRepoName:directRepo,projectFiles:[]});assert.ok(direct);ids.push(direct);
  const created=await admin.from('projects').select('id,user_id,status,name').eq('id',direct).single();assert.equal(created.error,null);assert.deepEqual(created.data,{id:direct,user_id:owner,status:'completed',name:'Direct owned build'});
  const directMessages=await admin.from('project_messages').select('project_id,role,content').eq('project_id',direct);assert.equal(directMessages.error,null);assert.equal(directMessages.data?.length,2);assert.deepEqual(directMessages.data!.map((m:any)=>[m.project_id,m.role,m.content]).sort((a:any,b:any)=>a[1].localeCompare(b[1])),[[direct,'assistant','NEW_OWNED_SUMMARY'],[direct,'user','NEW_OWNED_BUILD']]);
  const activity=await admin.from('activity_logs').select('user_id,project_id,action').eq('project_id',direct);assert.equal(activity.error,null);assert.deepEqual(activity.data,[{user_id:owner,project_id:direct,action:'created_project'}]);
  const collisionRepo=`fixture/collision-${randomUUID()}`,collisionId=projectIdentityId(owner,collisionRepo);assert.ok(collisionId);ids.push(collisionId);
  const occupied=await admin.from('projects').insert({id:collisionId,user_id:other.id,name:'Foreign collision canary',type:'app',github_repo_name:`foreign/${randomUUID()}`}).select('*').single();assert.equal(occupied.error,null);
  assert.equal(await ensureProjectIdByRepo(actor.context,collisionRepo),null);assert.equal(await findProjectIdByRepo(actor.context,collisionRepo),null);
  assert.deepEqual((await admin.from('projects').select('*').eq('id',collisionId).single()).data,occupied.data);
  assert.equal((await admin.from('projects').delete().eq('id',collisionId)).error,null);assert.equal(await ensureProjectIdByRepo(actor.context,collisionRepo),collisionId);
  assert.equal((await admin.from('projects').select('user_id').eq('id',collisionId).single()).data?.user_id,owner);
 });
 test('real build and file writes reject project transfers at the decisive parent lock without crossing owner namespaces',{timeout:60000},async t=>{
  const[owner,other]=getUsers(),ids:string[]=[],db=connect();await db.connect();let pending:Promise<unknown>|undefined;
  t.after(async()=>{if(ids.length)assert.equal((await admin.from('projects').delete().in('id',ids)).error,null);});
  try{
   for(const mode of ['build','server_file','browser_file']){
    const repo=`fixture/parent-${randomUUID()}`,id=await ensureProjectIdByRepo(owner.context,repo);assert.ok(id);ids.push(id);
    const before=await admin.from('projects').select('*').eq('id',id).single();assert.equal(before.error,null);
    await db.query('begin');await db.query('select id from projects where id=$1 for update',[id]);
    if(mode==='build')pending=upsertBuildProject(owner.context,{userId:owner.id,name:'MUST_NOT_PERSIST',userPrompt:'MUST_NOT_PERSIST',summaryText:'MUST_NOT_PERSIST',githubRepoName:repo,projectFiles:[{path:'index.html',content:'MUST_NOT_PERSIST'}]});
    else if(mode==='server_file')pending=storeProjectFile(owner.context,id,'must-not-persist.txt','MUST_NOT_PERSIST','text/plain','code');
    else{
     const browser=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${owner.token}`}}});
     pending=Promise.resolve(browser.from('project_files').insert({id:randomUUID(),project_id:id,file_name:'browser-denied.txt',file_path:'browser-denied.txt',file_type:'code',content:'MUST_NOT_PERSIST'}));
    }
    void pending.catch(()=>{});let blocked=false;
    for(let n=0;n<150;n++){await db.query('select pg_stat_clear_snapshot()');const wait=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and pg_backend_pid()=any(pg_blocking_pids(pid)) and wait_event_type='Lock' and query like $1",[mode==='build'?'%save_owned_build_project_atomic%':'%project_files%']);if(wait.rowCount){blocked=true;break;}await delay(20);}assert.equal(blocked,true,`${mode} reached the actual parent lock`);
    await db.query('update projects set user_id=$2 where id=$1',[id,other.id]);await db.query('commit');
    if(mode==='build')assert.equal(await pending,null);else if(mode==='server_file')await assert.rejects(pending,{code:'FILE_RECORD_WRITE_UNAVAILABLE'});else assert.equal(((await pending) as {error:{code:string}}).error?.code,'42501');pending=undefined;
    const after=await admin.from('projects').select('*').eq('id',id).single();assert.equal(after.error,null);
    // The fixture's intentional ownership transfer also updates this timestamp.
    assert.deepEqual({...after.data,updated_at:before.data!.updated_at},{...before.data,user_id:other.id});
    assert.ok(Date.parse(after.data!.updated_at)>=Date.parse(before.data!.updated_at));
    for(const table of ['project_messages','project_files']){const rows:{data:{id:string}[]|null;error:unknown}=await admin.from(table).select('id').eq('project_id',id);assert.equal(rows.error,null);assert.deepEqual(rows.data,[]);}
   }
  }finally{await db.query('rollback');if(pending)await Promise.allSettled([pending]);await db.end();}
 });
 test('real build project messages roll back with their parent and concurrent owned recoveries retain exact receipts',{timeout:60000},async t=>{
  const[owner]=getUsers(),repo=`fixture/rollback-${randomUUID()}`,id=await ensureProjectIdByRepo(owner.context,repo);assert.ok(id);
  t.after(async()=>{assert.equal((await admin.from('projects').delete().eq('id',id)).error,null);});
  const db=connect(),constraint=`fixture_build_summary_${randomUUID().replaceAll('-','')}`,failedRepo=`fixture/fail-${randomUUID()}`,failureSummary=`FAIL_${randomUUID()}`,failureName=`ROLLBACK_${randomUUID()}`;await db.connect();
  t.after(async()=>{assert.equal((await admin.from('projects').delete().eq('user_id',owner.id).eq('github_repo_name',failedRepo)).error,null);});
  const before=await admin.from('projects').select('*').eq('id',id).single();assert.equal(before.error,null);
  try{
   await db.query(`alter table project_messages add constraint ${constraint} check(role<>'assistant' or content<>'${failureSummary}') not valid`);
   assert.equal(await upsertBuildProject(owner.context,{userId:owner.id,name:failureName,userPrompt:'MUST_ROLL_BACK',summaryText:failureSummary,githubRepoName:repo,projectFiles:[]}),null);
   assert.deepEqual((await admin.from('projects').select('*').eq('id',id).single()).data,before.data);
   assert.deepEqual((await admin.from('project_messages').select('id').eq('project_id',id)).data,[]);
   assert.equal(await upsertBuildProject(owner.context,{userId:owner.id,name:failureName,userPrompt:'MUST_ROLL_BACK_NEW_PARENT',summaryText:failureSummary,githubRepoName:failedRepo,projectFiles:[]}),null);
   const absent=await admin.from('projects').select('id').eq('user_id',owner.id).eq('github_repo_name',failedRepo);assert.equal(absent.error,null);assert.deepEqual(absent.data,[]);
   const activities=await admin.from('activity_logs').select('id').eq('user_id',owner.id).eq('details->>name',failureName);assert.equal(activities.error,null);assert.deepEqual(activities.data,[]);
  }finally{await db.query(`alter table project_messages drop constraint if exists ${constraint}`);await db.end();}
  const firstRun=randomUUID(),secondRun=randomUUID();const inputs=[firstRun,secondRun].map((runId,n)=>({userId:owner.id,name:`Owned recovery${n}`,userPrompt:`Exact recovery${n}`,summaryText:`Exact summary${n}`,githubRepoName:repo,runId,projectFiles:[]}));
  assert.deepEqual(await Promise.all(inputs.map(input=>upsertBuildProject(owner.context,input))),[id,id]);
  const messages=await admin.from('project_messages').select('id,project_id,role,content,metadata').eq('project_id',id);assert.equal(messages.error,null);assert.equal(messages.data?.length,4);assert.equal(new Set(messages.data!.map((m:any)=>m.id)).size,4);
  for(const input of inputs){const row:Record<string,any>|undefined=messages.data!.find((m:any)=>m.role==='user'&&m.metadata.runId===input.runId);assert.ok(row);assert.equal(row.project_id,id);assert.equal(row.content,input.userPrompt);assert.equal(row.metadata.githubRepoName,repo);assert.equal(row.metadata.githubBranch,'main');}
  assert.equal((await admin.from('projects').select('user_id,status').eq('id',id).single()).data?.status,'completed');
  for(const token of [undefined,owner.token]){const browser=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});const denied:{error:{code?:string}|null}=await browser.rpc('save_owned_build_project_atomic',{p_owner_id:owner.id,p_expected_id:id,p_project:{name:'Denied',type:'app'},p_build:{user_prompt:'Denied'}});assert.equal(denied.error?.code,'42501');}
 });
}
