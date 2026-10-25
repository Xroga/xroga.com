import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

export function registerActionApprovalTests(admin: SupabaseClient, getUsers: () => readonly { id: string; project: string; token: string }[]): void {
  test('real approval rechecks locked membership and atomically commits one decision with audit', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const url = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
    const [owner,actor] = getUsers(), keys: string[] = [], service = new OperationsService(admin);
    const prior = await admin.from('operations_memberships').select('*').eq('project_id', owner.project).eq('member_user_id', actor.id).maybeSingle();
    assert.equal(prior.error, null); const membershipId = prior.data?.id ?? randomUUID();
    t.after(async () => {
      if (keys.length) assert.equal((await admin.from('operations_actions').delete().eq('user_id', owner.id).in('idempotency_key', keys)).error, null);
      if (prior.data) assert.equal((await admin.from('operations_memberships').upsert(prior.data)).error, null);
      else assert.equal((await admin.from('operations_memberships').delete().eq('id', membershipId)).error, null);
    });
    assert.equal((await admin.from('operations_memberships').upsert({ id: membershipId, user_id: owner.id, project_id: owner.project,
      member_user_id: actor.id, role: 'recovery_manager', created_by: owner.id }, { onConflict: 'project_id,member_user_id' })).error, null);
    const seed = async () => {
      const key = randomUUID(); keys.push(key);
      const action = await service.createAction(owner.id, { actionType: 'resume_automation', targetType: 'automation', targetId: owner.project,
        projectId: owner.project, targetVersion: 1, idempotencyKey: key, confirmed: true });
      assert.equal(action.status, 'approval_required'); return action;
    };
    const db = new pg.Client({ connectionString: url.href, ssl: false }); await db.connect();
    let pending: Promise<Record<string,any>>[] = [];
    const waitFor = async (count: number) => {
      for (let i=0;i<150;i++) {
        await db.query('select pg_stat_clear_snapshot()');
        const rows = await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%decide_operations_action_approval%'");
        if ((rows.rowCount ?? 0) >= count) return; await delay(20);
      }
      assert.fail('every approval RPC must reach the actual held PostgreSQL lock');
    };
    try {
      const action = await seed();
      await assert.rejects(service.approveAction(owner.id, action.id, 'approved', 'Self approval denied'), { code: 'forbidden', statusCode: 403 });
      await db.query('begin'); await db.query('select id from operations_memberships where id=$1 for update', [membershipId]);
      pending = [service.approveAction(actor.id, action.id, 'approved', 'Reviewed fixture')]; pending.forEach(p=>void p.catch(()=>{}));
      await waitFor(1);
      await db.query("update operations_memberships set role='viewer' where id=$1", [membershipId]); await db.query('commit');
      await assert.rejects(pending[0], { code: 'forbidden', statusCode: 403 }); pending=[];
      const unchanged = await admin.from('operations_actions').select('status').eq('id', action.id).single();
      assert.equal(unchanged.error, null); assert.equal(unchanged.data?.status, 'approval_required');
      assert.equal((await admin.from('operations_memberships').update({ role: 'recovery_manager' }).eq('id', membershipId)).error, null);
      await db.query('begin'); await db.query('select id from operations_action_approvals where action_id=$1 for update', [action.id]);
      pending = [0,1].map(()=>service.approveAction(actor.id, action.id, 'approved', 'Reviewed fixture')); pending.forEach(p=>void p.catch(()=>{}));
      await waitFor(2); await db.query('commit');
      const outcomes = await Promise.allSettled(pending); pending=[];
      assert.equal(outcomes.filter(o=>o.status==='fulfilled' && o.value.status==='approved').length,1);
      assert.equal(outcomes.filter(o=>o.status==='rejected' && o.reason.code==='conflict').length,1);
      const audit = await admin.from('production_audit_log').select('id').eq('target_id', action.id).eq('action', 'operations.approval.approved');
      assert.equal(audit.error,null); assert.equal(audit.data?.length,1);
      const rollbackAction = await seed();
      await db.query('begin');
      const args = [actor.id,rollbackAction,'recovery_manager','approved','Reviewed fixture'];
      for (const table of ['operations_action_approvals','operations_actions','production_audit_log']) {
        await db.query('savepoint injected');
        const condition = table==='operations_action_approvals' ? `action_id <> '${rollbackAction.id}' or decision <> 'approved'`
          : table==='operations_actions' ? `id <> '${rollbackAction.id}' or status <> 'approved'`
          : `target_id <> '${rollbackAction.id}' or action <> 'operations.approval.approved'`;
        await db.query(`alter table ${table} add constraint fixture_approval_failure check(${condition}) not valid`); await db.query('savepoint attempt');
        await assert.rejects(db.query('select * from decide_operations_action_approval($1,$2,$3,$4,$5)',args),{code:'23514'});
        await db.query('rollback to savepoint attempt');
        assert.equal((await db.query('select status from operations_actions where id=$1',[rollbackAction.id])).rows[0].status,'approval_required');
        assert.equal((await db.query('select decision from operations_action_approvals where action_id=$1',[rollbackAction.id])).rows[0].decision,'pending');
        assert.equal((await db.query("select id from production_audit_log where target_id=$1 and action like 'operations.approval.%'",[rollbackAction.id])).rowCount,0);
        await db.query('rollback to savepoint injected');
      }
      await db.query('rollback');
      for (const token of [undefined,actor.token]) {
        const browser: SupabaseClient = createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
        assert.equal((await browser.rpc('decide_operations_action_approval',{p_actor:actor.id,p_expected:rollbackAction,p_required_role:'recovery_manager',p_decision:'approved',p_reason:'Reviewed fixture'})).error?.code,'42501');
      }
      assert.equal((await service.approveAction(actor.id,rollbackAction.id,'rejected','Rejected fixture')).status,'blocked');
      const runs = await admin.from('operations_action_runs').select('id').in('action_id',[action.id,rollbackAction.id]);
      assert.equal(runs.error,null);assert.deepEqual(runs.data,[]);
    } finally { await db.query('rollback');await Promise.allSettled(pending);await db.end(); }
  });
}
