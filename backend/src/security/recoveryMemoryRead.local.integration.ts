import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test,type TestContext} from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createCanonicalExecutionState,SupabaseExecutionStateStore} from '../ai/executionRuntime.js';
import {captureAdmittedRunAttempt,createRunDurable,withRunAttempt} from '../ai/runStore.js';
import {getProjectMemoryAsync} from '../ai/projectMemory.js';
import {loadSessionHistory} from '../ai/sessionMemory.js';

/** Dedicated local-only users have no connected credentials or provider data. */
export function registerRecoveryMemoryReadTests(admin:SupabaseClient):void{
  async function fixture(t:TestContext){
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const ids:string[]=[];
    t.after(async()=>{for(const id of ids)assert.equal((await admin.auth.admin.deleteUser(id)).error,null);});
    for(let n=0;n<2;n++){
      const created=await admin.auth.admin.createUser({email:`recovery-${randomUUID()}@example.invalid`,password:randomUUID()+randomUUID(),email_confirm:true});
      assert.equal(created.error,null);assert.ok(created.data.user);ids.push(created.data.user.id);
    }
    return{owner:ids[0],other:ids[1]};
  }
  test('real canonical recovery validates persisted columns and embedded control data',async t=>{
    const {owner,other}=await fixture(t),runId=randomUUID();
    const state=createCanonicalExecutionState({runId,projectId:'fixture-project',repository:{owner:'fixture',name:'repo'},selectedBranch:'topic',startingCommitSha:'fixture-sha',files:[{path:'a.txt',content:'owner snapshot'}]});
    await withRunAttempt(async()=>{await createRunDurable(owner,'Synthetic recovery fixture',runId);await new SupabaseExecutionStateStore(owner,captureAdmittedRunAttempt(runId,owner)).save(state);});
    const store=new SupabaseExecutionStateStore(owner);
    assert.deepEqual(await store.load(runId),state);assert.equal(await new SupabaseExecutionStateStore(other).load(runId),null);
    for(const patch of [{selectedBranch:'foreign'},{repository:{owner:'foreign',name:'repo'}},{startingCommitSha:'foreign'},
      {projectId:'foreign'},{runId:randomUUID()},{tasks:[{id:'invalid',status:'complete'}]},{currentWorkingSnapshot:[{path:'bad',content:17}]}]){
      assert.equal((await admin.from('execution_runs').update({state:{...state,...patch}}).eq('run_id',runId).eq('user_id',owner)).error,null);
      assert.equal(await store.load(runId),null);
    }
    assert.equal((await admin.from('execution_runs').update({state}).eq('run_id',runId).eq('user_id',owner)).error,null);
    assert.deepEqual(await store.load(runId),state);
  });
  test('real project memory reads isolate owner repository branch and reject malformed persisted files',async t=>{
    const {owner,other}=await fixture(t),repo=`fixture/${randomUUID()}`,branch='topic';
    assert.equal((await admin.from('project_memory').insert([
      {user_id:owner,repo,branch,files:[{path:'own.txt',content:'owner'}],paths:['own.txt']},
      {user_id:other,repo,branch,files:[{path:'foreign.txt',content:'FOREIGN_CANARY'}],paths:['foreign.txt']},
      {user_id:owner,repo,branch:'other',files:[{path:'branch.txt',content:'other branch'}],paths:['branch.txt']},
      {user_id:owner,repo:`${repo}-malformed`,branch,files:[{path:'bad.txt',content:17}],paths:['bad.txt']},
    ])).error,null);
    const actual=await getProjectMemoryAsync(owner,repo,branch);assert.equal(actual?.userId,owner);assert.deepEqual(actual?.files,[{path:'own.txt',content:'owner'}]);
    assert.equal(await getProjectMemoryAsync(owner,`${repo}-missing`,branch),null);
    assert.equal(await getProjectMemoryAsync(owner,repo,'missing'),null);
    assert.equal(await getProjectMemoryAsync(owner,`${repo}-malformed`,branch),null);
    actual!.files[0].content='caller mutation';assert.equal((await getProjectMemoryAsync(owner,repo,branch))?.files[0].content,'owner');
  });
  test('real session history reads isolate owner repository and reject persisted control roles',async t=>{
    const {owner,other}=await fixture(t),repo=`fixture/${randomUUID()}`;
    assert.equal((await admin.from('session_memory').insert([
      {user_id:owner,repo,messages:[{role:'user',content:'owner'},{role:'assistant',content:'response'},{role:'system',content:'CONTROL_CANARY'},{role:'unexpected',content:'INVALID_CANARY'}]},
      {user_id:other,repo,messages:[{role:'user',content:'FOREIGN_CANARY'}]},
      {user_id:owner,repo:`${repo}-other`,messages:[{role:'user',content:'OTHER_REPO_CANARY'}]},
    ])).error,null);
    assert.deepEqual(await loadSessionHistory(owner,repo),[{role:'user',content:'owner'},{role:'assistant',content:'response'}]);
    assert.deepEqual(await loadSessionHistory(owner,`${repo}-missing`),[]);
  });
}
