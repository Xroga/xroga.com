import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test,type TestContext} from 'node:test';
import pg from 'pg';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {captureAdmittedRunAttempt,createRunDurable,withRunAttempt,completeRun,persistRunState} from '../ai/runStore.js';
import {RunTrace} from '../ai/runTrace.js';

export function registerRunTraceAttemptTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
  async function fixture(t:TestContext,terminal=false){
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const [owner,other]=getUsers(),runId=randomUUID();
    t.after(async()=>{
      assert.equal((await admin.from('swarm_run_traces').delete().eq('run_id',runId).in('user_id',[owner.id,other.id])).error,null);
      assert.equal((await admin.from('build_outcomes').delete().eq('run_id',runId).eq('user_id',owner.id)).error,null);
      assert.equal((await admin.from('swarm_runs').delete().eq('id',runId).eq('user_id',owner.id)).error,null);
    });
    const attempt=await withRunAttempt(async()=>{
      await createRunDurable(owner.id,'Synthetic trace fixture',runId);const captured=captureAdmittedRunAttempt(runId,owner.id);
      const trace=new RunTrace(runId,owner.id);trace.bindAttempt(captured);trace.add('fixture','running','Synthetic diagnostic');
      if(terminal){completeRun(runId,{output:{type:'complete'},success:true});await persistRunState(runId);}
      await trace.persist();return captured;
    });
    const saved=await admin.from('swarm_run_traces').select('*').eq('run_id',runId).eq('user_id',owner.id).single();assert.equal(saved.error,null);assert.ok(saved.data);
    const args={p_run_id:runId,p_owner_id:owner.id,p_worker_id:attempt.workerId,p_generation:attempt.generation,p_stages:saved.data.stages,p_meta:saved.data.meta};
    return{owner,other,runId,args,saved:saved.data};
  }
  test('real diagnostic trace accepts actual finalized epoch, denies wrong parent and forged generations',async t=>{
    const f=await fixture(t,true);
    const run=await admin.from('swarm_runs').select('status,worker_id,lease_generation').eq('id',f.runId).single();assert.equal(run.error,null);assert.equal(run.data?.status,'complete');assert.equal(run.data?.worker_id,null);assert.equal(run.data?.lease_generation,f.args.p_generation);
    for(const patch of [{p_run_id:randomUUID()},{p_owner_id:f.other.id},{p_generation:null},{p_generation:randomUUID()},{p_stages:{}},{p_meta:[]}]){
      const denied=await admin.rpc('persist_run_trace_attempt',{...f.args,...patch});assert.equal(denied.error,null);assert.equal(denied.data,false);
    }
    const repeated=await admin.rpc('persist_run_trace_attempt',f.args);assert.equal(repeated.error,null);assert.equal(repeated.data,true);
    for(const token of [null,f.owner.token]){const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{}),auth:{persistSession:false,autoRefreshToken:false}});assert.ok((await client.rpc('persist_run_trace_attempt',f.args)).error);}
    assert.equal((await admin.from('swarm_run_traces').update({user_id:f.other.id}).eq('run_id',f.runId)).error,null);
    assert.equal((await admin.rpc('persist_run_trace_attempt',f.args)).data,false);
    assert.equal((await admin.from('swarm_run_traces').select('user_id').eq('run_id',f.runId).single()).data?.user_id,f.other.id);
  });
  for(const cancel of [false,true])test(`real stale trace writer loses observed parent-lock race to ${cancel?'cancellation':'resume'}`,async t=>{
    const f=await fixture(t),url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const locker=new pg.Client({connectionString:url.href,ssl:false}),writer=new pg.Client({connectionString:url.href,ssl:false});await locker.connect();await writer.connect();let pending:Promise<pg.QueryResult>|undefined;
    try{
      await writer.query('set statement_timeout=10000');const writerPid=(await writer.query('select pg_backend_pid() as pid')).rows[0].pid,lockerPid=(await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
      await writer.query('set role service_role');await locker.query('begin');await locker.query('select id from public.swarm_runs where id=$1 and user_id=$2 for update',[f.runId,f.owner.id]);
      pending=writer.query('select public.persist_run_trace_attempt($1,$2,$3,$4,$5,$6) as ok',[f.runId,f.owner.id,f.args.p_worker_id,f.args.p_generation,JSON.stringify(f.args.p_stages),JSON.stringify({stale:'CANARY'})]);void pending.catch(()=>{});
      let blocked=false;for(let n=0;n<100;n++){const observed=await locker.query('select pg_blocking_pids($1) as blockers',[writerPid]);if(observed.rows[0].blockers.includes(lockerPid)){blocked=true;break;}await delay(20);}assert.equal(blocked,true);
      if(cancel)await locker.query('select public.cancel_swarm_run_owned($1,$2)',[f.runId,f.owner.id]);else await locker.query("update public.swarm_runs set lease_generation=$3,worker_id='resumed-worker' where id=$1 and user_id=$2",[f.runId,f.owner.id,randomUUID()]);
      await locker.query('commit');assert.equal((await pending).rows[0].ok,false);
      const retained=await admin.from('swarm_run_traces').select('*').eq('run_id',f.runId).eq('user_id',f.owner.id).single();assert.equal(retained.error,null);assert.deepEqual(retained.data,f.saved);
    }finally{await locker.query('rollback');if(pending)await pending.catch(()=>{});await writer.end();await locker.end();}
  });
}
