import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {test} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {SupabaseProjectRuntimeStore} from '../synthesis/projectRuntime/store.js';
import type {ProjectRuntimeSession} from '../synthesis/projectRuntime/types.js';
import {loadProjectRuntimeSession} from './runtimeProjectBinding.js';
export function registerRuntimeProjectBindingTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[],request:(path:string,token?:string,method?:string,body?:unknown)=>Promise<Response>):void{
 test('real runtime API refuses same-owner cross-project session references before provider access',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const owner=getUsers()[0],store=new SupabaseProjectRuntimeStore(),projectId=`binding-${randomUUID()}`,otherProject=`binding-${randomUUID()}`,sessionId=randomUUID(),runId=randomUUID(),now=new Date().toISOString();
  t.after(async()=>{
   assert.equal((await admin.from('project_runtime_revisions').delete().eq('user_id',owner.id).eq('project_id',projectId)).error,null);
   assert.equal((await admin.from('project_runtime_sessions').delete().eq('user_id',owner.id).eq('session_id',sessionId)).error,null);
  });
  const session:ProjectRuntimeSession={schemaVersion:'1.0.0',sessionId,userId:owner.id,projectId:otherProject,providerId:'fixture-no-execution',runtimeClass:'interactive',status:'running',image:null,workspaceRevision:1,knownFiles:[],processes:[],ports:[],providerState:{},createdAt:now,updatedAt:now,expiresAt:null};
  await store.saveSession(session);
  const project={projectId,runId,contract:{projectId,runId,semanticGoal:{goal:'Synthetic preview'}},recipe:{previewStrategy:'browser'},workspace:{files:[{path:'index.html',content:'<html>fixture</html>'}]},runtime:{sessionId,providerId:session.providerId,runtimeClass:'interactive',status:'running'}};
  const saved=await store.saveRevision(owner.id,project as unknown as Parameters<typeof store.saveRevision>[1]);
  assert.equal((await loadProjectRuntimeSession(store,owner.id,otherProject,sessionId))?.sessionId,sessionId);
  await assert.rejects(loadProjectRuntimeSession(store,owner.id,projectId,sessionId),{status:404});
  for(const [suffix,method] of [['/logs','GET'],['/stop','POST'],['/restart','POST'],['','GET']]){
   const response=await request(`/api/project-runtime/${projectId}${suffix}`,owner.token,method);assert.equal(response.status,404);assert.equal((await response.json() as {code:string}).code,'RESOURCE_NOT_FOUND');
  }
  assert.deepEqual(await store.loadSession(owner.id,sessionId),session);
  const revisions=await admin.from('project_runtime_revisions').select('revision_id').eq('user_id',owner.id).eq('project_id',projectId);assert.equal(revisions.error,null);assert.deepEqual(revisions.data,[{revision_id:saved.revisionId}]);
 });
}
