import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

export function registerAutomationCreationTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;project:string;token:string}[]):void{
  test('real rule creation rechecks current member and owner and rolls back rule and audit together',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,actor]=getUsers(),project=randomUUID(),membership=randomUUID(),service=new OperationsService(admin);
    t.after(async()=>{assert.equal((await admin.from('projects').delete().eq('id',project)).error,null);});
    assert.equal((await admin.from('projects').insert({id:project,user_id:owner.id,name:'Disposable rule creation',type:'app'})).error,null);
    assert.equal((await admin.from('operations_memberships').insert({id:membership,user_id:owner.id,project_id:project,member_user_id:actor.id,role:'operator',created_by:owner.id})).error,null);
    const input=()=>({ruleKey:randomUUID(),name:'Fixture rule',triggerType:'fixture',riskLevel:'high' as const,actionType:'resume_automation',
      conditions:{level:'original',apiKey:'fixture-only'},exclusions:{},maxRuns:1,windowSeconds:60,enabled:false});
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<any>[]=[];
    const waitFor=async(count:number)=>{
      for(let i=0;i<150;i++){
        await db.query('select pg_stat_clear_snapshot()');
        const result=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%create_operations_automation_rule%'");
        if((result.rowCount??0)>=count)return;await delay(20);
      }
      assert.fail('all rule creators must reach the held PostgreSQL authority lock');
    };
    const empty=async()=>{
      for(const table of ['operations_automation_rules','production_audit_log']){
        const result=await admin.from(table).select('id').eq('project_id',project);assert.equal(result.error,null);assert.deepEqual(result.data,[]);
      }
    };
    try{
      await db.query('begin');await db.query('select id from operations_memberships where id=$1 for update',[membership]);
      pending=[service.createAutomationRule(actor.id,project,input())];pending.forEach(p=>void p.catch(()=>{}));await waitFor(1);
      await db.query("update operations_memberships set role='viewer' where id=$1",[membership]);await db.query('commit');
      await assert.rejects(pending[0],{code:'forbidden'});pending=[];await empty();
      await db.query("update operations_memberships set role='operator' where id=$1",[membership]);
      await db.query('begin');await db.query('select id from projects where id=$1 for update',[project]);
      pending=[service.createAutomationRule(owner.id,project,input())];pending.forEach(p=>void p.catch(()=>{}));await waitFor(1);
      await db.query('update projects set user_id=$1 where id=$2',[actor.id,project]);await db.query('commit');
      await assert.rejects(pending[0],{code:'forbidden'});pending=[];await empty();
      await db.query('update projects set user_id=$1 where id=$2',[owner.id,project]);
      const expected={id:randomUUID(),user_id:owner.id,project_id:project,environment_id:null,version:1,rule_key:randomUUID(),name:'Rollback fixture',
        trigger_type:'fixture',risk_level:'high',action_type:'resume_automation',conditions:{},exclusions:{},rate_limit:{maxRuns:1,windowSeconds:60},
        enabled:false,emergency_stopped:false,approval_policy:{requiredRole:'recovery_manager'},verification_plan:{required:true}};
      const args=[owner.id,owner.id,project,expected,'recovery_manager'];
      await db.query('begin');
      for(const table of ['operations_automation_rules','production_audit_log']){
        await db.query('savepoint injected');await db.query(`alter table ${table} add constraint fixture_rule_failure check(project_id<>'${project}') not valid`);
        await db.query('savepoint attempt');
        await assert.rejects(db.query('select * from create_operations_automation_rule($1,$2,$3,$4,$5)',args),{code:'23514'});
        await db.query('rollback to savepoint attempt');
        assert.equal((await db.query('select id from operations_automation_rules where project_id=$1',[project])).rowCount,0);
        assert.equal((await db.query('select id from production_audit_log where project_id=$1',[project])).rowCount,0);
        await db.query('rollback to savepoint injected');
      }
      await db.query('rollback');
      const request=input();await db.query('begin');await db.query('select id from projects where id=$1 for update',[project]);
      pending=[0,1].map(()=>service.createAutomationRule(owner.id,project,request));pending.forEach(p=>void p.catch(()=>{}));await waitFor(2);
      await db.query('commit');const results=await Promise.allSettled(pending);pending=[];
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      const rejected=results.find(r=>r.status==='rejected');assert.equal(rejected?.status,'rejected');
      if(rejected?.status==='rejected')assert.equal(rejected.reason.code,'conflict');
      const rules=await admin.from('operations_automation_rules').select('*').eq('project_id',project);assert.equal(rules.error,null);assert.equal(rules.data?.length,1);
      assert.equal(rules.data![0].conditions.apiKey,'[REDACTED]');assert.equal(rules.data![0].enabled,false);assert.equal(rules.data![0].version,1);
      const audit=await admin.from('production_audit_log').select('target_id,actor_id,metadata,outcome').eq('project_id',project);
      assert.equal(audit.error,null);assert.deepEqual(audit.data,[{target_id:rules.data![0].id,actor_id:owner.id,metadata:{},outcome:'disabled'}]);
      const rpcArgs={p_actor:owner.id,p_owner:owner.id,p_project:project,p_rule:expected,p_approval_role:'recovery_manager'};
      assert.equal((await admin.rpc('create_operations_automation_rule',{...rpcArgs,p_owner:actor.id,p_rule:{...expected,user_id:actor.id}})).error?.code,'42501');
      for(const token of [undefined,owner.token]){
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('create_operations_automation_rule',rpcArgs)).error?.code,'42501');
      }
      const actions=await admin.from('operations_actions').select('id').eq('project_id',project);assert.equal(actions.error,null);assert.deepEqual(actions.data,[]);
    }finally{await db.query('rollback');await Promise.allSettled(pending);await db.end();}
  });
}
