import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

export function registerAutomationAdmissionTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;project:string;token:string}[]):void{
  test('real automation serializes different triggers and replay before creating any approved action',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,actor]=getUsers(),project=randomUUID(),member=randomUUID(),service=new OperationsService(admin);
    t.after(async()=>{
      assert.equal((await admin.from('operations_actions').delete().eq('project_id',project)).error,null);
      assert.equal((await admin.from('projects').delete().eq('id',project).eq('user_id',owner.id)).error,null);
    });
    assert.equal((await admin.from('projects').insert({id:project,user_id:owner.id,name:'Disposable automation admission',type:'app'})).error,null);
    assert.equal((await admin.from('operations_memberships').insert({id:member,user_id:owner.id,project_id:project,member_user_id:actor.id,role:'operator',created_by:owner.id})).error,null);
    const seed=async():Promise<Record<string,any>>=>{
      const id=randomUUID();const result=await admin.from('operations_automation_rules').insert({id,user_id:owner.id,project_id:project,rule_key:id,
        name:'Disposable quota fixture',trigger_type:`fixture:${id}`,risk_level:'high',action_type:'resume_automation',conditions:{level:'original'},
        exclusions:{},rate_limit:{maxRuns:1,windowSeconds:60},enabled:true}).select('*').single();
      assert.equal(result.error,null);assert.ok(result.data);return result.data;
    };
    const signal=(rule:Record<string,any>,id=randomUUID())=>({triggerType:rule.trigger_type,triggerId:id,targetType:'automation',targetId:project,targetVersion:1,attributes:{level:'original'},evidenceReference:'proof'});
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<any>[]=[];
    const waitFor=async(count:number)=>{
      for(let i=0;i<150;i++){
        await db.query('select pg_stat_clear_snapshot()');
        const rows=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%admit_operations_automation_run%'");
        if((rows.rowCount??0)>=count)return;await delay(20);
      }
      assert.fail('every signal must reach the held PostgreSQL admission lock');
    };
    const runs=async(rule:string)=>{const r=await admin.from('operations_automation_runs').select('*').eq('rule_id',rule);assert.equal(r.error,null);return r.data!;};
    try{
      for(const mode of ['different','duplicate']){
        const rule=await seed(),first=signal(rule),second=mode==='duplicate'?first:signal(rule);
        await db.query('begin');await db.query('select id from operations_automation_rules where id=$1 for update',[rule.id]);
        pending=[first,second].map(input=>service.evaluateAutomationSignal(owner.id,project,input));pending.forEach(p=>void p.catch(()=>{}));
        await waitFor(2);await db.query('commit');const results=await Promise.all(pending);pending=[];
        const stored=await runs(rule.id),ids=stored.map(row=>row.id);
        assert.equal(stored.length,mode==='duplicate'?1:2);
        assert.equal(stored.filter(row=>row.status==='approval_required').length,1);
        assert.equal(stored.filter(row=>row.status==='rate_limited').length,mode==='duplicate'?0:1);
        if(mode==='duplicate')assert.equal(results[0][0].id,results[1][0].id);
        const actions=await admin.from('operations_actions').select('id,status,attempt_count,idempotency_key').eq('project_id',project).in('idempotency_key',ids);
        assert.equal(actions.error,null);assert.equal(actions.data?.length,1);assert.equal(actions.data![0].status,'approval_required');assert.equal(actions.data![0].attempt_count,0);
        assert.equal(stored.find(row=>row.status==='approval_required')?.id,actions.data![0].idempotency_key);
        const admitted=await admin.from('production_audit_log').select('id').eq('project_id',project).eq('action','operations.automation.admitted').in('target_id',ids);
        assert.equal(admitted.error,null);assert.equal(admitted.data?.length,stored.length);
        await assert.rejects(service.evaluateAutomationSignal(owner.id,project,{...first,evidenceReference:'changed'}),{code:'conflict',statusCode:409});
        assert.equal((await runs(rule.id)).length,stored.length);
      }
      const changed=await seed();await db.query('begin');await db.query('select id from operations_automation_rules where id=$1 for update',[changed.id]);
      pending=[service.evaluateAutomationSignal(owner.id,project,signal(changed))];pending.forEach(p=>void p.catch(()=>{}));await waitFor(1);
      await db.query('update operations_automation_rules set emergency_stopped=true,version=version+1 where id=$1',[changed.id]);await db.query('commit');
      await assert.rejects(pending[0],{code:'conflict'});pending=[];assert.deepEqual(await runs(changed.id),[]);
      const revoked=await seed();await db.query('begin');await db.query('select id from operations_memberships where id=$1 for update',[member]);
      pending=[service.evaluateAutomationSignal(actor.id,project,signal(revoked))];pending.forEach(p=>void p.catch(()=>{}));await waitFor(1);
      await db.query("update operations_memberships set role='viewer' where id=$1",[member]);await db.query('commit');
      await assert.rejects(pending[0],{code:'forbidden'});pending=[];assert.deepEqual(await runs(revoked.id),[]);
      const rollback=await seed(),digest='f'.repeat(64),args=[owner.id,owner.id,project,rollback,digest,{level:'original'},'proof'];
      await db.query('begin');
      for(const table of ['operations_automation_runs','production_audit_log']){
        await db.query('savepoint injected');
        const condition=table==='operations_automation_runs'?`rule_id<>'${rollback.id}'`:`action<>'operations.automation.admitted' or metadata->>'ruleId'<>'${rollback.id}'`;
        await db.query(`alter table ${table} add constraint fixture_automation_failure check(${condition}) not valid`);await db.query('savepoint attempt');
        await assert.rejects(db.query('select admit_operations_automation_run($1,$2,$3,$4,$5,$6,$7)',args),{code:'23514'});await db.query('rollback to savepoint attempt');
        assert.equal((await db.query('select id from operations_automation_runs where rule_id=$1',[rollback.id])).rowCount,0);
        assert.equal((await db.query("select id from production_audit_log where action='operations.automation.admitted' and metadata->>'ruleId'=$1",[rollback.id])).rowCount,0);
        await db.query('rollback to savepoint injected');
      }
      await db.query('rollback');
      const rpcArgs={p_actor:owner.id,p_owner:owner.id,p_project:project,p_expected_rule:rollback,p_digest:digest,p_attributes:{level:'original'},p_evidence:'proof'};
      assert.equal((await admin.rpc('admit_operations_automation_run',{...rpcArgs,p_owner:actor.id})).error?.code,'42501');
      for(const token of [undefined,owner.token]){
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('admit_operations_automation_run',rpcArgs)).error?.code,'42501');
      }
      const actions=await admin.from('operations_actions').select('id').eq('project_id',project);assert.equal(actions.error,null);
      const executed=await admin.from('operations_action_runs').select('id').in('action_id',actions.data!.map(row=>row.id));assert.equal(executed.error,null);assert.deepEqual(executed.data,[]);
    }finally{await db.query('rollback');await Promise.allSettled(pending);await db.end();}
  });
}
