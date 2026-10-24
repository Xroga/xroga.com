import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GrowthService } from './growthService.js';

export function registerGrowthActivationEvaluationTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;project:string;token:string}[]):void{
  test('real activation derives owned evidence under locks and cannot overwrite a foreign lifecycle',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,viewer]=getUsers(),project=randomUUID(),membership=randomUUID(),definition=randomUUID(),deployment=randomUUID(),event=randomUUID(),service=new GrowthService(admin);
    t.after(async()=>{
      assert.equal((await admin.from('analytics_events').delete().eq('id',event)).error,null);
      assert.equal((await admin.from('deployment_status').delete().eq('id',deployment)).error,null);
      assert.equal((await admin.from('projects').delete().eq('id',project)).error,null);
    });
    assert.equal((await admin.from('projects').insert({id:project,user_id:owner.id,name:'Disposable activation evaluation',type:'app'})).error,null);
    const member={id:membership,user_id:owner.id,project_id:project,member_user_id:viewer.id,role:'viewer',created_by:owner.id};
    assert.equal((await admin.from('operations_memberships').insert(member)).error,null);
    assert.equal((await admin.from('growth_activation_definitions').insert({id:definition,tenant_id:owner.id,project_id:project,version:1,
      name:'Fixture activation',required_event_names:['identity.linked.v1']})).error,null);
    assert.equal((await admin.from('deployment_status').insert({id:deployment,user_id:owner.id,project_id:project,target:'github',status:'deployed',verification_state:'verified'})).error,null);
    assert.equal((await admin.from('analytics_events').insert({id:event,tenant_id:owner.id,project_id:project,user_id:owner.id,
      event_type:'identity.linked.v1',environment:'test',idempotency_key:randomUUID()})).error,null);
    const snapshot=async()=>{const result=await admin.from('growth_lifecycle_state').select('*').eq('project_id',project);assert.equal(result.error,null);return result.data!;};
    const clear=async()=>{assert.equal((await admin.from('growth_lifecycle_state').delete().eq('project_id',project)).error,null);};
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<any>[]=[];
    const waitFor=async(count=1)=>{
      for(let i=0;i<150;i++){
        await db.query('select pg_stat_clear_snapshot()');
        const result=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%evaluate_growth_activation%'");
        if((result.rowCount??0)>=count)return;await delay(20);
      }
      assert.fail('actual activation evaluation must reach the held evidence/authority/lifecycle lock');
    };
    try{
      const control=await service.evaluateActivation(viewer.id,project,owner.id);assert.equal(control.activated,true);
      assert.equal(control.lifecycle?.tenant_id,owner.id);assert.equal(control.lifecycle?.evidence_reference,`activation:${definition}:${deployment}`);
      for(const mode of ['definition','deployment','event','membership']){
        await clear();const table=mode==='definition'?'growth_activation_definitions':mode==='deployment'?'deployment_status':mode==='event'?'analytics_events':'operations_memberships';
        const id=mode==='definition'?definition:mode==='deployment'?deployment:mode==='event'?event:membership;
        await db.query('begin');await db.query(`select id from ${table} where id=$1 for update`,[id]);
        pending=[service.evaluateActivation(viewer.id,project,owner.id)];pending.forEach(p=>void p.catch(()=>{}));await waitFor();
        if(mode==='definition')await db.query("update growth_activation_definitions set required_event_names=array['product.defined.v1'] where id=$1",[id]);
        if(mode==='deployment')await db.query("update deployment_status set verification_state='unavailable' where id=$1",[id]);
        if(mode==='event')await db.query('update analytics_events set tenant_id=$2,project_id=$3 where id=$1',[id,viewer.id,viewer.project]);
        if(mode==='membership')await db.query('delete from operations_memberships where id=$1',[id]);
        await db.query('commit');
        if(mode==='membership')await assert.rejects(pending[0],{code:'forbidden'});
        else assert.deepEqual(await pending[0],{activated:false,lifecycle:null,reason:mode==='deployment'?'deployment_unverified':'required_events_missing'});
        pending=[];assert.deepEqual(await snapshot(),[]);
        assert.equal((await admin.from('growth_activation_definitions').update({required_event_names:['identity.linked.v1']}).eq('id',definition)).error,null);
        assert.equal((await admin.from('deployment_status').update({verification_state:'verified'}).eq('id',deployment)).error,null);
        assert.equal((await admin.from('analytics_events').update({tenant_id:owner.id,project_id:project}).eq('id',event)).error,null);
        if(mode==='membership')assert.equal((await admin.from('operations_memberships').insert(member)).error,null);
      }
      const owned=await service.evaluateActivation(owner.id,project,owner.id),before=await snapshot();
      await db.query('begin');await db.query('select id from growth_lifecycle_state where id=$1 for update',[owned.lifecycle!.id]);
      pending=[service.evaluateActivation(owner.id,project,owner.id)];pending.forEach(p=>void p.catch(()=>{}));await waitFor();
      await db.query('update growth_lifecycle_state set tenant_id=$2 where id=$1',[owned.lifecycle!.id,viewer.id]);await db.query('commit');
      await assert.rejects(pending[0],{code:'conflict'});pending=[];assert.deepEqual(await snapshot(),before.map(row=>({...row,tenant_id:viewer.id})));
      await clear();await db.query('begin');await db.query('lock table growth_lifecycle_state in share mode');
      pending=[0,1].map(()=>service.evaluateActivation(owner.id,project,owner.id));pending.forEach(p=>void p.catch(()=>{}));await waitFor(2);
      await db.query('commit');const winners=await Promise.all(pending);pending=[];assert.equal(winners[0].lifecycle.id,winners[1].lifecycle.id);assert.equal((await snapshot()).length,1);
      const stable=await snapshot();await db.query('begin');
      await db.query(`alter table growth_lifecycle_state add constraint fixture_evaluation_failure check(project_id<>'${project}' or lifecycle_state<>'activated') not valid`);
      await db.query('savepoint attempt');const roles=['viewer','operator','release_manager','recovery_manager','admin'];
      await assert.rejects(db.query('select evaluate_growth_activation($1,$2,$3,$4,$5)',[owner.id,owner.id,project,owner.id,roles]),{code:'23514'});
      await db.query('rollback to savepoint attempt');await db.query('rollback');assert.deepEqual(await snapshot(),stable);
      const args={p_actor:owner.id,p_tenant:owner.id,p_project:project,p_subject:owner.id,p_allowed_roles:roles};
      assert.equal((await admin.rpc('evaluate_growth_activation',{...args,p_tenant:viewer.id})).error?.code,'42501');
      for(const token of [undefined,owner.token]){
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('evaluate_growth_activation',args)).error?.code,'42501');
      }
    }finally{await db.query('rollback');await Promise.allSettled(pending);await db.end();}
  });
}
