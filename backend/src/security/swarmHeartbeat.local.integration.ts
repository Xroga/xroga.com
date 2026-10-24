import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTenantContext } from './tenantContext.js';
import { heartbeatOwnedRunAttempt } from './ownedRunPersistence.js';

export function registerSwarmHeartbeatTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
  test('real heartbeat uses database time after the lock and cannot refresh a cancelled or replaced worker generation',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,other]=getUsers(),run=randomUUID(),foreign=randomUUID(),worker=`heartbeat-${randomUUID()}`,generation=randomUUID(),replacement=randomUUID();
    const context=createTenantContext({userId:owner.id,via:'persisted_owner'});
    t.after(async()=>{assert.equal((await admin.from('swarm_runs').delete().in('id',[run,foreign])).error,null);});
    assert.equal((await admin.from('swarm_runs').insert([owner,other].map((user,index)=>({id:index?foreign:run,user_id:user.id,
      prompt:'Immutable heartbeat canary',status:'running',worker_id:worker,lease_generation:generation,heartbeat_at:new Date().toISOString(),
      output:{canary:true},events:[],last_sequence:7,iteration_count:2})))).error,null);
    const snapshot=async(id=run)=>{
      const result=await admin.from('swarm_runs').select('id,user_id,prompt,status,worker_id,lease_generation,heartbeat_at,output,events,last_sequence,iteration_count,completed_at').eq('id',id).single();
      assert.equal(result.error,null);return result.data;
    };
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<void>|undefined;
    const waitFor=async()=>{
      for(let i=0;i<150;i++){
        await db.query('select pg_stat_clear_snapshot()');
        const result=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%heartbeat_swarm_run_attempt%'");
        if(result.rowCount)return;await delay(20);
      }
      assert.fail('the actual worker heartbeat must reach the held generation row lock');
    };
    try{
      const before=await snapshot(),canary=await snapshot(foreign);
      await db.query('begin');await db.query('select id from swarm_runs where id=$1 for update',[run]);
      pending=heartbeatOwnedRunAttempt(admin,context,run,worker,generation);void pending.catch(()=>{});await waitFor();
      const boundary=await db.query('select clock_timestamp() value');await db.query('commit');await pending;pending=undefined;
      assert.equal((await db.query('select heartbeat_at>=$2::timestamptz valid from swarm_runs where id=$1',[run,boundary.rows[0].value])).rows[0].valid,true);
      const after=await snapshot();assert.notEqual(after.heartbeat_at,before.heartbeat_at);
      assert.deepEqual({...after,heartbeat_at:before.heartbeat_at},before);
      await assert.rejects(heartbeatOwnedRunAttempt(admin,context,foreign,worker,generation),{code:'RUN_STATE_CONFLICT'});assert.deepEqual(await snapshot(foreign),canary);
      await db.query('begin');await db.query('select id from swarm_runs where id=$1 for update',[run]);
      pending=heartbeatOwnedRunAttempt(admin,context,run,worker,generation);void pending.catch(()=>{});await waitFor();
      await db.query('update swarm_runs set lease_generation=$2 where id=$1',[run,replacement]);await db.query('commit');
      await assert.rejects(pending,{code:'RUN_STATE_CONFLICT'});pending=undefined;
      assert.deepEqual(await snapshot(),{...after,lease_generation:replacement});
      await db.query('begin');await db.query('select id from swarm_runs where id=$1 for update',[run]);
      pending=heartbeatOwnedRunAttempt(admin,context,run,worker,replacement);void pending.catch(()=>{});await waitFor();
      await db.query("update swarm_runs set status='cancelled',worker_id=null,completed_at=clock_timestamp() where id=$1",[run]);await db.query('commit');
      await assert.rejects(pending,{code:'RUN_STATE_CONFLICT'});pending=undefined;assert.equal((await snapshot()).heartbeat_at,after.heartbeat_at);
      await db.query("update swarm_runs set status='running',worker_id=$2,completed_at=null where id=$1",[run,worker]);
      await db.query('begin');await db.query(`alter table swarm_runs add constraint fixture_heartbeat_failure check(id<>'${run}' or heartbeat_at<'2001-01-01') not valid`);
      await db.query('savepoint attempt');await assert.rejects(db.query('select * from heartbeat_swarm_run_attempt($1,$2,$3,$4)',[run,owner.id,worker,replacement]),{code:'23514'});
      await db.query('rollback to savepoint attempt');assert.equal((await db.query('select heartbeat_at from swarm_runs where id=$1',[run])).rows[0].heartbeat_at.toISOString(),new Date(after.heartbeat_at).toISOString());await db.query('rollback');
      const args={p_run_id:run,p_owner_id:owner.id,p_worker_id:worker,p_generation:replacement};
      for(const token of [undefined,owner.token]){
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('heartbeat_swarm_run_attempt',args)).error?.code,'42501');
      }
    }finally{await db.query('rollback');if(pending)await Promise.allSettled([pending]);await db.end();}
  });
}
