import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

export function registerActionConfirmationTests(admin: SupabaseClient, getUsers: () => readonly { id: string; project: string; token: string }[]): void {
  test('real confirmation binds a locked plan and commits approval plus audit atomically once', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const url = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
    const [owner,other] = getUsers(), ids: string[] = [], service = new OperationsService(admin);
    const db = new pg.Client({ connectionString: url.href, ssl: false }); await db.connect();
    t.after(async () => { if (ids.length) assert.equal((await admin.from('operations_actions').delete().eq('user_id',owner.id).in('id',ids)).error,null); });
    const seed = async () => {
      const action = await service.createAction(owner.id,{ actionType:'resume_automation',targetType:'automation',targetId:owner.project,
        projectId:owner.project,targetVersion:1,idempotencyKey:randomUUID(),confirmed:false });
      ids.push(action.id); assert.equal(action.status,'confirmation_required'); return action;
    };
    const waitFor = async (count: number) => {
      for (let i=0;i<150;i++) {
        await db.query('select pg_stat_clear_snapshot()');
        const rows = await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%confirm_operations_action%'");
        if ((rows.rowCount ?? 0)>=count) return; await delay(20);
      }
      assert.fail('confirmation requests must reach the held PostgreSQL row');
    };
    let pending: Promise<Record<string,any>>[]=[];
    try {
      const changed=await seed();
      await assert.rejects(service.confirmAction(other.id,changed.id),{code:'forbidden'});
      await db.query('begin');await db.query('select id from operations_actions where id=$1 for update',[changed.id]);
      pending=[service.confirmAction(owner.id,changed.id)];pending.forEach(p=>void p.catch(()=>{}));await waitFor(1);
      await db.query('update operations_actions set execution_plan=$2 where id=$1',[changed.id,{changed:true}]);await db.query('commit');
      await assert.rejects(pending[0],{code:'conflict'});pending=[];
      assert.equal((await admin.from('operations_actions').select('status').eq('id',changed.id).single()).data?.status,'confirmation_required');
      assert.deepEqual((await admin.from('operations_action_approvals').select('id').eq('action_id',changed.id)).data,[]);
      const action=await seed();
      await db.query('begin');await db.query('select id from operations_actions where id=$1 for update',[action.id]);
      pending=[0,1].map(()=>service.confirmAction(owner.id,action.id));pending.forEach(p=>void p.catch(()=>{}));await waitFor(2);await db.query('commit');
      const outcomes=await Promise.allSettled(pending);pending=[];
      assert.equal(outcomes.filter(o=>o.status==='fulfilled'&&o.value.status==='approval_required').length,1);
      assert.equal(outcomes.filter(o=>o.status==='rejected'&&o.reason.code==='conflict').length,1);
      assert.equal((await admin.from('operations_action_approvals').select('id').eq('action_id',action.id)).data?.length,1);
      assert.equal((await admin.from('production_audit_log').select('id').eq('target_id',action.id).eq('action','operations.action.confirmed')).data?.length,1);
      const rollback=await seed();
      const args=[owner.id,rollback,['operator','release_manager','recovery_manager','admin'],'recovery_manager'];
      await db.query('begin');
      for (const table of ['operations_actions','operations_action_approvals','production_audit_log']) {
        await db.query('savepoint injected');
        const condition=table==='operations_actions'?`id <> '${rollback.id}' or status <> 'approval_required'`
          :table==='operations_action_approvals'?`action_id <> '${rollback.id}'`
          :`target_id <> '${rollback.id}' or action <> 'operations.action.confirmed'`;
        await db.query(`alter table ${table} add constraint fixture_confirmation_failure check(${condition}) not valid`);await db.query('savepoint attempt');
        await assert.rejects(db.query('select * from confirm_operations_action($1,$2,$3,$4)',args),{code:'23514'});
        await db.query('rollback to savepoint attempt');
        assert.equal((await db.query('select status from operations_actions where id=$1',[rollback.id])).rows[0].status,'confirmation_required');
        assert.equal((await db.query('select id from operations_action_approvals where action_id=$1',[rollback.id])).rowCount,0);
        assert.equal((await db.query("select id from production_audit_log where target_id=$1 and action='operations.action.confirmed'",[rollback.id])).rowCount,0);
        await db.query('rollback to savepoint injected');
      }
      await db.query('rollback');
      for (const token of [undefined,owner.token]) {
        const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('confirm_operations_action',{p_actor:owner.id,p_expected:rollback,p_allowed_roles:args[2],p_approval_role:'recovery_manager'})).error?.code,'42501');
      }
      assert.equal((await service.confirmAction(owner.id,rollback.id)).status,'approval_required');
      assert.deepEqual((await admin.from('operations_action_runs').select('id').in('action_id',ids)).data,[]);
    } finally {await db.query('rollback');await Promise.allSettled(pending);await db.end();}
  });
}
