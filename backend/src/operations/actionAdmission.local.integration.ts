import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

export function registerActionAdmissionTests(admin: SupabaseClient, getUsers: () => readonly { id: string; project: string; token: string }[]): void {
  test('real execution claim rejects locked actor and approver revocation, plan change and expiring approval before adapters', async t => {
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,approver]=getUsers(),service=new OperationsService(admin),ids:string[]=[];
    const prior=await admin.from('operations_memberships').select('*').eq('project_id',owner.project).eq('member_user_id',approver.id).maybeSingle();
    assert.equal(prior.error,null);const membershipId=prior.data?.id??randomUUID();
    t.after(async()=>{
      if(ids.length)assert.equal((await admin.from('operations_actions').delete().eq('user_id',owner.id).in('id',ids)).error,null);
      if(prior.data)assert.equal((await admin.from('operations_memberships').upsert(prior.data)).error,null);
      else assert.equal((await admin.from('operations_memberships').delete().eq('id',membershipId)).error,null);
    });
    assert.equal((await admin.from('operations_memberships').upsert({id:membershipId,user_id:owner.id,project_id:owner.project,
      member_user_id:approver.id,role:'recovery_manager',created_by:owner.id},{onConflict:'project_id,member_user_id'})).error,null);
    const seed=async()=>{
      const action=await service.createAction(owner.id,{actionType:'resume_automation',targetType:'automation',targetId:owner.project,
        projectId:owner.project,targetVersion:1,idempotencyKey:randomUUID(),confirmed:true});ids.push(action.id);
      return service.approveAction(approver.id,action.id,'approved','Disposable claim fixture');
    };
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();
    let pending:Promise<any>|undefined;
    const waitFor=async()=>{
      for(let i=0;i<150;i++){
        await db.query('select pg_stat_clear_snapshot()');
        const rows=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%claim_operations_action_admitted%'");
        if(rows.rowCount)return;await delay(20);
      }
      assert.fail('claim must reach held PostgreSQL authority lock');
    };
    const unchanged=async(id:string)=>{
      const row=await admin.from('operations_actions').select('status,attempt_count').eq('id',id).single();
      assert.equal(row.error,null);assert.deepEqual(row.data,{status:'approved',attempt_count:0});
    };
    try {
      const action=await seed();
      for(const actor of [owner,approver]){
        await db.query('begin');await db.query('select id from operations_memberships where id=$1 for update',[membershipId]);
        pending=service.executeAction(actor.id,action.id);void pending.catch(()=>{});await waitFor();
        await db.query("update operations_memberships set role='viewer' where id=$1",[membershipId]);await db.query('commit');
        await assert.rejects(pending,{code:'forbidden',statusCode:403});pending=undefined;await unchanged(action.id);
        assert.equal((await admin.from('operations_memberships').update({role:'recovery_manager'}).eq('id',membershipId)).error,null);
      }
      await db.query('begin');await db.query('select id from operations_actions where id=$1 for update',[action.id]);
      pending=service.executeAction(owner.id,action.id);void pending.catch(()=>{});await waitFor();
      await db.query('update operations_actions set execution_plan=$2 where id=$1',[action.id,{changed:true}]);await db.query('commit');
      await assert.rejects(pending,{code:'conflict'});pending=undefined;await unchanged(action.id);
      const expired=await seed();await db.query('begin');
      await db.query("update operations_action_approvals set expires_at=clock_timestamp()+interval '1 second' where action_id=$1",[expired.id]);
      pending=service.executeAction(owner.id,expired.id);void pending.catch(()=>{});await waitFor();
      await db.query('select pg_sleep(greatest(0,extract(epoch from expires_at-clock_timestamp()))+0.05) from operations_action_approvals where action_id=$1',[expired.id]);
      await db.query('commit');await assert.rejects(pending,{code:'conflict'});pending=undefined;await unchanged(expired.id);
      const admitted=await seed();
      const args={p_actor:owner.id,p_expected:admitted,p_allowed_roles:['operator','release_manager','recovery_manager','admin'],p_approval_role:'recovery_manager',p_confirmation_required:true,p_lease_seconds:60};
      await db.query('begin');await db.query('select id from operations_actions where id=$1 for update',[admitted.id]);
      pending=Promise.resolve(admin.rpc('claim_operations_action_admitted',args));await waitFor();
      const competing=await admin.rpc('claim_operations_action_admitted',args);assert.equal(competing.error,null);assert.deepEqual(competing.data,[]);
      await db.query('commit');const claimed=await pending;pending=undefined;
      assert.equal(claimed.error,null);assert.equal(claimed.data?.length,1);assert.equal(claimed.data[0].attempt_count,1);
      assert.equal(claimed.data[0].lease_owner,`api:${owner.id}`);
      for(const token of [undefined,owner.token]){
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('claim_operations_action_admitted',args)).error?.code,'42501');
      }
      const runs=await admin.from('operations_action_runs').select('id').in('action_id',ids);assert.equal(runs.error,null);assert.deepEqual(runs.data,[]);
    }finally{await db.query('rollback');if(pending)await Promise.allSettled([pending]);await db.end();}
  });
}
