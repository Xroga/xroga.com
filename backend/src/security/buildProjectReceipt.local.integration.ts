import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {ensureProjectIdByRepo,upsertBuildProject} from '../services/memory/buildProjectStore.js';

export function registerBuildProjectReceiptTests(admin:SupabaseClient,getUsers:()=>readonly {id:string}[]):void{
 test('real build persistence receipts preserve exact owner, project and inline file identity',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const owner=getUsers()[0].id,repo=`fixture/receipt-${randomUUID()}`;
  t.after(async()=>{assert.equal((await admin.from('projects').delete().eq('user_id',owner).eq('github_repo_name',repo)).error,null);});
  const id=await ensureProjectIdByRepo(owner,repo);assert.ok(id);
  assert.equal(await ensureProjectIdByRepo(owner,repo),id);
  assert.equal(await upsertBuildProject({userId:owner,name:'Receipt fixture',userPrompt:'Fixture only',githubRepoName:repo,projectFiles:[{path:'index.html',content:'<p>Receipt fixture</p>'}]}),id);
  const project=await admin.from('projects').select('id,user_id,status').eq('id',id).single();assert.equal(project.error,null);assert.deepEqual(project.data,{id,user_id:owner,status:'completed'});
  const files=await admin.from('project_files').select('id,project_id,content,file_url,storage_metadata').eq('project_id',id);assert.equal(files.error,null);assert.equal(files.data?.length,1);
  const file=files.data![0];assert.equal(file.project_id,id);assert.equal(file.content,'<p>Receipt fixture</p>');assert.ok(file.file_url.includes(file.id));assert.equal(file.storage_metadata.ownerId,owner);assert.equal(file.storage_metadata.provider,'database');
 });
}
