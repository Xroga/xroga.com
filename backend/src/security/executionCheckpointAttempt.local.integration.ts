import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createCanonicalExecutionState, SupabaseExecutionStateStore } from '../ai/executionRuntime.js';
import { captureAdmittedRunAttempt, createRunDurable, withRunAttempt } from '../ai/runStore.js';

export function registerExecutionCheckpointAttemptTests(admin: SupabaseClient, getUsers: () => readonly {id:string;token:string}[]): void {
  async function fixture(t: TestContext) {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const [owner,other] = getUsers(), runId = randomUUID();
    t.after(async () => {
      assert.equal((await admin.from('execution_runs').delete().eq('run_id',runId).in('user_id',[owner.id,other.id])).error,null);
      assert.equal((await admin.from('swarm_runs').delete().eq('id',runId).eq('user_id',owner.id)).error,null);
    });
    const state = createCanonicalExecutionState({runId,projectId:'fixture-project',databaseProjectId:randomUUID()});
    const attempt = await withRunAttempt(async () => {
      await createRunDurable(owner.id,'Synthetic checkpoint fixture',runId);
      const captured = captureAdmittedRunAttempt(runId,owner.id);
      await new SupabaseExecutionStateStore(owner.id,captured).save(state);
      return captured;
    });
    const { workerId,generation } = attempt;
    const args = {p_run_id:runId,p_owner_id:owner.id,p_worker_id:workerId,p_generation:generation,p_state:state,p_status:'completed'};
    const saved = await admin.from('execution_runs').select('*').eq('run_id',runId).single(); assert.equal(saved.error,null);
    return {owner,other,runId,args,saved:saved.data};
  }
  test('real checkpoint fence rejects wrong owner epoch lineage and unprivileged clients',async t => {
    const f=await fixture(t);
    for(const patch of [
      {p_owner_id:f.other.id},{p_generation:null},{p_generation:randomUUID()},{p_worker_id:'stale'},
      {p_state:{...f.args.p_state,runId:randomUUID()}},{p_state:{...f.args.p_state,projectId:'another'}},
      {p_state:{...f.args.p_state,databaseProjectId:randomUUID()}},{p_state:{...f.args.p_state,selectedBranch:'other'}},
      {p_state:{...f.args.p_state,repository:{owner:'other',name:'repo'}}},
    ]) { const denied=await admin.rpc('persist_execution_checkpoint_attempt',{...f.args,...patch}); assert.equal(denied.error,null); assert.equal(denied.data,false); }
    const read=()=>admin.from('execution_runs').select('*').eq('run_id',f.runId).single();
    assert.deepEqual((await read()).data,f.saved);
    const accepted=await admin.rpc('persist_execution_checkpoint_attempt',{...f.args,p_state:{...f.args.p_state,blockers:['new evidence']}});
    assert.equal(accepted.error,null);assert.equal(accepted.data,true);
    const anon=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!);
    const authenticated=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{global:{headers:{Authorization:`Bearer ${f.owner.token}`}}});
    for(const client of [anon,authenticated]) assert.ok((await client.rpc('persist_execution_checkpoint_attempt',f.args)).error);
    assert.equal((await admin.from('execution_runs').update({user_id:f.other.id}).eq('run_id',f.runId)).error,null);
    const collision=await read();
    assert.equal((await admin.rpc('persist_execution_checkpoint_attempt',f.args)).data,false);
    assert.deepEqual((await read()).data,collision.data);
  });
  for(const cancel of [false,true]) test(`real checkpoint parent-lock race rejects stale write after ${cancel?'cancellation':'resume'}`,async t=>{
    const f=await fixture(t),url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const locker=new pg.Client({connectionString:url.href,ssl:false}),writer=new pg.Client({connectionString:url.href,ssl:false});
    await locker.connect();await writer.connect();let pending:Promise<pg.QueryResult>|undefined;
    try{
      await writer.query('set statement_timeout=10000');
      const writerPid=(await writer.query('select pg_backend_pid() as pid')).rows[0].pid;
      const lockerPid=(await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
      await writer.query('set role service_role');await locker.query('begin');
      await locker.query('select id from public.swarm_runs where id=$1 and user_id=$2 for update',[f.runId,f.owner.id]);
      pending=writer.query('select public.persist_execution_checkpoint_attempt($1,$2,$3,$4,$5,$6) as ok',
        [f.runId,f.owner.id,f.args.p_worker_id,f.args.p_generation,JSON.stringify({...f.args.p_state,blockers:['stale overwrite']}),f.args.p_status]);
      void pending.catch(()=>{});let blocked=false;
      for(let count=0;count<100;count++){const observed=await locker.query('select pg_blocking_pids($1) as blockers',[writerPid]);if(observed.rows[0].blockers.includes(lockerPid)){blocked=true;break;}await delay(20);}
      assert.equal(blocked,true,'observe writer actually waiting on canonical parent lock');
      if(cancel) await locker.query('select public.cancel_swarm_run_owned($1,$2)',[f.runId,f.owner.id]);
      else await locker.query("update public.swarm_runs set lease_generation=$3,worker_id='new-worker' where id=$1 and user_id=$2",[f.runId,f.owner.id,randomUUID()]);
      await locker.query('commit');assert.equal((await pending).rows[0].ok,false);
      const retained=await admin.from('execution_runs').select('*').eq('run_id',f.runId).single();assert.equal(retained.error,null);assert.deepEqual(retained.data,f.saved);
    }finally{await locker.query('rollback');if(pending)await pending.catch(()=>{});await writer.end();await locker.end();}
  });
}
