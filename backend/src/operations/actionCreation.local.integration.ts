import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

export function registerActionCreationTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;project:string;token:string}[]):void{
  test('real creation rechecks role environment and maintenance and rolls back action approval and audit together',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,actor]=getUsers(),project=randomUUID(),membership=randomUUID(),environment=randomUUID(),windowId=randomUUID();
    const service=new OperationsService(admin);
    t.after(async()=>{
      assert.equal((await admin.from('operations_actions').delete().eq('project_id',project)).error,null);
      assert.equal((await admin.from('operations_environments').delete().eq('id',environment)).error,null);
      assert.equal((await admin.from('projects').delete().eq('id',project).eq('user_id',owner.id)).error,null);
    });
    assert.equal((await admin.from('projects').insert({id:project,user_id:owner.id,name:'Disposable action creation',type:'app'})).error,null);
    assert.equal((await admin.from('operations_memberships').insert({id:membership,user_id:owner.id,project_id:project,member_user_id:actor.id,role:'operator',created_by:owner.id})).error,null);
    assert.equal((await admin.from('operations_environments').insert({id:environment,user_id:owner.id,project_id:project,environment_key:environment,environment_type:'test'})).error,null);
    const input=(confirmed=false)=>{const idempotencyKey=randomUUID();return {actionType:'resume_automation',targetType:'automation',targetId:project,
      projectId:project,targetVersion:1,idempotencyKey,confirmed};};
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<any>|undefined;
    const waitFor=async()=>{
      for(let i=0;i<150;i++){
        await db.query('select pg_stat_clear_snapshot()');
        const rows=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%create_operations_action%'");
        if(rows.rowCount)return;await delay(20);
      }
      assert.fail('creation reached the held PostgreSQL authority row');
    };
    const empty=async()=>{
      for(const table of ['operations_actions','production_audit_log']){
        const rows=await admin.from(table).select('id').eq('project_id',project);assert.equal(rows.error,null);assert.deepEqual(rows.data,[]);
      }
    };
    try{
      await db.query('begin');await db.query('select id from operations_memberships where id=$1 for update',[membership]);
      pending=service.createAction(actor.id,input());void pending.catch(()=>{});await waitFor();
      await db.query("update operations_memberships set role='viewer' where id=$1",[membership]);await db.query('commit');
      await assert.rejects(pending,{code:'forbidden',statusCode:403});pending=undefined;await empty();
      await db.query('begin');await db.query('select id from operations_environments where id=$1 for update',[environment]);
      pending=service.createAction(owner.id,{...input(),environmentId:environment});void pending.catch(()=>{});await waitFor();
      await db.query('update operations_environments set user_id=$2,project_id=$3 where id=$1',[environment,actor.id,actor.project]);await db.query('commit');
      await assert.rejects(pending,{code:'forbidden',statusCode:403});pending=undefined;await empty();
      await db.query("insert into operations_maintenance_windows(id,user_id,project_id,starts_at,ends_at,reason,owner_id) values($1,$2,$3,clock_timestamp()+interval '5 seconds',clock_timestamp()+interval '1 hour','Disposable future window',$2)",[windowId,owner.id,project]);
      await db.query('begin');await db.query('select id from operations_maintenance_windows where id=$1 for update',[windowId]);
      pending=service.createAction(owner.id,input());void pending.catch(()=>{});await waitFor();
      await db.query('select pg_sleep(greatest(0,extract(epoch from starts_at-clock_timestamp()))+0.05) from operations_maintenance_windows where id=$1',[windowId]);
      await db.query('commit');await assert.rejects(pending,{code:'precondition_failed',statusCode:409});pending=undefined;await empty();
      assert.equal((await admin.from('operations_maintenance_windows').delete().eq('id',windowId)).error,null);
      const key=randomUUID();
      const row={user_id:owner.id,project_id:project,environment_id:null,requested_by:owner.id,action_type:'resume_automation',target_type:'automation',target_id:project,
        permission_required:'manage_automation',risk_level:'high',status:'approval_required',idempotency_key:key,target_version:1,action_plan_digest:'fixture',
        preconditions:[],execution_plan:{},rollback_plan:{},verification_plan:{required:true},max_attempts:1,confirmation_digest:'fixture'};
      const args=[owner.id,row,['operator','release_manager','recovery_manager','admin'],'recovery_manager',true,{...row,idempotency_key:'[REDACTED]'}];
      const originalApprovals=(await db.query('select count(*)::int n from operations_action_approvals where user_id=$1',[owner.id])).rows[0].n;
      await db.query('begin');
      for(const table of ['operations_actions','operations_action_approvals','production_audit_log']){
        await db.query('savepoint injected');
        const condition=table==='operations_action_approvals'?`user_id<>'${owner.id}'`:`project_id<>'${project}'`;
        await db.query(`alter table ${table} add constraint fixture_creation_failure check(${condition}) not valid`);await db.query('savepoint attempt');
        await assert.rejects(db.query('select create_operations_action($1,$2,$3,$4,$5,$6)',args),{code:'23514'});
        await db.query('rollback to savepoint attempt');
        assert.equal((await db.query('select count(*)::int n from operations_actions where project_id=$1',[project])).rows[0].n,0);
        assert.equal((await db.query('select count(*)::int n from production_audit_log where project_id=$1',[project])).rows[0].n,0);
        assert.equal((await db.query('select count(*)::int n from operations_action_approvals where user_id=$1',[owner.id])).rows[0].n,originalApprovals);
        await db.query('rollback to savepoint injected');
      }
      await db.query('rollback');
      const rpcArgs={p_actor:owner.id,p_expected:row,p_allowed_roles:args[2],p_approval_role:'recovery_manager',p_confirmation_required:true,p_audit_after:args[5]};
      for(const token of [undefined,owner.token]){
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('create_operations_action',rpcArgs)).error?.code,'42501');
      }
      const accepted=await service.createAction(owner.id,input(true));assert.equal(accepted.status,'approval_required');
      const approval=await admin.from('operations_action_approvals').select('requester_id,action_plan_digest').eq('action_id',accepted.id).single();
      assert.equal(approval.error,null);assert.deepEqual(approval.data,{requester_id:owner.id,action_plan_digest:accepted.action_plan_digest});
      const audit=await admin.from('production_audit_log').select('after_state').eq('target_id',accepted.id).eq('action','operations.action.requested').single();
      assert.equal(audit.error,null);assert.equal(audit.data?.after_state.idempotency_key,'[REDACTED]');
      assert.deepEqual((await admin.from('operations_action_runs').select('id').eq('action_id',accepted.id)).data,[]);
    }finally{await db.query('rollback');if(pending)await Promise.allSettled([pending]);await db.end();}
  });
}
