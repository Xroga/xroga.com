import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

export function registerGrowthOutcomeTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;project:string;token:string}[]):void{
  test('real experiment outcome binds current membership and parents and records one concurrent replay',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,other]=getUsers(),service=new GrowthService(admin),experiments:string[]=[],events:string[]=[];
    const prior=await admin.from('operations_memberships').select('*').eq('project_id',owner.project).eq('member_user_id',other.id).maybeSingle();
    assert.equal(prior.error,null);const memberId=prior.data?.id??randomUUID();
    t.after(async()=>{
      if(experiments.length)assert.equal((await admin.from('growth_experiments').delete().in('id',experiments)).error,null);
      if(events.length)assert.equal((await admin.from('analytics_events').delete().in('id',events)).error,null);
      if(prior.data)assert.equal((await admin.from('operations_memberships').upsert(prior.data)).error,null);
      else assert.equal((await admin.from('operations_memberships').delete().eq('id',memberId)).error,null);
    });
    assert.equal((await admin.from('operations_memberships').upsert({id:memberId,user_id:owner.id,project_id:owner.project,
      member_user_id:other.id,role:'viewer',created_by:owner.id},{onConflict:'project_id,member_user_id'})).error,null);
    const seed=async()=>{
      const experimentId=randomUUID(),assignmentId=randomUUID(),eventId=randomUUID();experiments.push(experimentId);events.push(eventId);
      assert.equal((await admin.from('growth_experiments').insert({id:experimentId,tenant_id:owner.id,project_id:owner.project,
        key:experimentId,variants:[{key:'a',weight:1}],allocation_seed:'fixture',minimum_sample_size:1,status:'running'})).error,null);
      assert.equal((await admin.from('growth_experiment_assignments').insert({id:assignmentId,experiment_id:experimentId,tenant_id:owner.id,
        subject_key:'fixture',variant:'a',exposed_at:new Date().toISOString()})).error,null);
      assert.equal((await admin.from('analytics_events').insert({id:eventId,user_id:owner.id,tenant_id:owner.id,project_id:owner.project,
        experiment_id:experimentId,event_type:'identity.linked.v1',environment:'test',idempotency_key:randomUUID()})).error,null);
      return {experimentId,assignmentId,eventId,metricKey:'fixture'};
    };
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<any>[]=[];
    const waitFor=async(count=1)=>{
      for(let i=0;i<150;i++){
        await db.query('select pg_stat_clear_snapshot()');
        const result=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%record_growth_experiment_outcome%'");
        if((result.rowCount??0)>=count)return;await delay(20);
      }
      assert.fail('outcome must reach held PostgreSQL parent lock');
    };
    const empty=async(id:string)=>{const rows=await admin.from('growth_experiment_outcomes').select('id').eq('experiment_id',id);assert.equal(rows.error,null);assert.deepEqual(rows.data,[]);};
    try{
      const revoked=await seed();await db.query('begin');await db.query('select id from operations_memberships where id=$1 for update',[memberId]);
      pending=[service.recordExperimentOutcome(other.id,revoked)];pending.forEach(p=>void p.catch(()=>{}));await waitFor();
      await db.query('delete from operations_memberships where id=$1',[memberId]);await db.query('commit');
      await assert.rejects(pending[0],{code:'forbidden',statusCode:403});pending=[];await empty(revoked.experimentId);
      for(const parent of ['experiment','assignment','event']as const){
        const input=await seed();const table=parent==='experiment'?'growth_experiments':parent==='assignment'?'growth_experiment_assignments':'analytics_events';
        const id=parent==='experiment'?input.experimentId:parent==='assignment'?input.assignmentId:input.eventId;
        await db.query('begin');await db.query(`select id from ${table} where id=$1 for update`,[id]);
        pending=[service.recordExperimentOutcome(owner.id,input)];pending.forEach(p=>void p.catch(()=>{}));await waitFor();
        if(parent==='event')await db.query('update analytics_events set project_id=$2 where id=$1',[id,other.project]);
        else await db.query(`update ${table} set tenant_id=$2 where id=$1`,[id,other.id]);
        await db.query('commit');await assert.rejects(pending[0],{code:'not_found',statusCode:404});pending=[];await empty(input.experimentId);
      }
      const input=await seed();await db.query('begin');await db.query('lock table growth_experiment_outcomes in share mode');
      pending=[0,1].map(()=>service.recordExperimentOutcome(owner.id,input));pending.forEach(p=>void p.catch(()=>{}));await waitFor(2);
      await db.query('commit');const [first,second]=await Promise.all(pending);pending=[];assert.equal(first.id,second.id);
      const stored=await admin.from('growth_experiment_outcomes').select('id').eq('experiment_id',input.experimentId);assert.equal(stored.error,null);assert.deepEqual(stored.data,[{id:first.id}]);
      const rollback=await seed();await db.query('begin');
      await db.query(`alter table growth_experiment_outcomes add constraint fixture_outcome_failure check(event_id<>'${rollback.eventId}') not valid`);
      await db.query('savepoint attempt');
      const args=[owner.id,owner.id,owner.project,rollback.experimentId,rollback.assignmentId,rollback.eventId,rollback.metricKey];
      await assert.rejects(db.query('select * from record_growth_experiment_outcome($1,$2,$3,$4,$5,$6,$7)',args),{code:'23514'});
      await db.query('rollback to savepoint attempt');assert.equal((await db.query('select id from growth_experiment_outcomes where experiment_id=$1',[rollback.experimentId])).rowCount,0);await db.query('rollback');
      for(const token of [undefined,owner.token]){
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('record_growth_experiment_outcome',{p_actor:owner.id,p_tenant:owner.id,p_project:owner.project,
          p_experiment:rollback.experimentId,p_assignment:rollback.assignmentId,p_event:rollback.eventId,p_metric:rollback.metricKey})).error?.code,'42501');
      }
    }finally{await db.query('rollback');await Promise.allSettled(pending);await db.end();}
  });
}
