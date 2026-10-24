import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

export function registerActionCompletionTests(admin: SupabaseClient, getUsers: () => readonly { id: string; project: string; token: string }[]): void {
  const connection = () => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const url = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
    return new pg.Client({ connectionString: url.href, ssl: false });
  };
  const result = { status: 'verified', safeSummary: 'Synthetic completion receipt, no provider executed' };
  test('real completion transaction rolls back every partial write and denies browser roles', async () => {
    const db = connection(); await db.connect(); const [owner, other] = getUsers();
    const id = randomUUID(), evidence = `ev_${randomUUID()}`;
    try {
      await db.query('begin');
      await db.query(`insert into operations_actions(id,user_id,project_id,action_type,target_type,target_id,requested_by,
        permission_required,risk_level,status,idempotency_key,target_version,action_plan_digest,confirmation_digest,
        lease_owner,lease_expires_at,attempt_count) values($1::uuid,$2,$3::uuid,'emergency_stop','automation',$3::text,$2,
        'manage_automation','high','running',$1::text,1,'fixture','fixture',$4,clock_timestamp()+interval '60 seconds',1)`,
      [id, owner.id, owner.project, `api:${owner.id}`]);
      const expected = (await db.query('select to_jsonb(a) value from operations_actions a where id=$1', [id])).rows[0].value;
      const args = [owner.id, expected, evidence, 'internal_database', result];
      for (const patch of [{ user_id: other.id }, { action_plan_digest: 'changed' }, { attempt_count: 2 }, { lease_owner: `api:${other.id}` }]) {
        await db.query('savepoint invalid');
        await assert.rejects(db.query('select * from complete_operations_action($1,$2,$3,$4,$5)', [owner.id, { ...expected, ...patch }, evidence, 'internal_database', result]));
        await db.query('rollback to savepoint invalid');
      }
      for (const table of ['production_evidence','operations_action_runs','operations_actions','production_audit_log']) {
        await db.query('savepoint injected');
        const condition = table === 'operations_actions' ? `id <> '${id}' or status <> 'verified'`
          : table === 'production_audit_log' ? `target_id <> '${id}' or action <> 'operations.action.completed'`
          : table === 'production_evidence' ? `id <> '${evidence}'` : `action_id <> '${id}'`;
        await db.query(`alter table ${table} add constraint fixture_completion_failure check(${condition}) not valid`);
        await db.query('savepoint attempt');
        await assert.rejects(db.query('select * from complete_operations_action($1,$2,$3,$4,$5)', args), { code: '23514' });
        await db.query('rollback to savepoint attempt');
        assert.equal((await db.query('select status from operations_actions where id=$1', [id])).rows[0].status, 'running');
        for (const query of ['select id from production_evidence where action_id=$1', 'select id from operations_action_runs where action_id=$1', "select id from production_audit_log where target_id=$1 and action='operations.action.completed'"]) {
          assert.equal((await db.query(query, [id])).rowCount, 0);
        }
        await db.query('rollback to savepoint injected');
      }
      await db.query('savepoint expired');
      await db.query("update operations_actions set lease_expires_at=clock_timestamp()-interval '1 second' where id=$1", [id]);
      await db.query('savepoint expired_attempt');
      await assert.rejects(db.query('select * from complete_operations_action($1,$2,$3,$4,$5)', args), { code: '40001' });
      await db.query('rollback to savepoint expired');
      const completed = await db.query('select * from complete_operations_action($1,$2,$3,$4,$5)', args);
      assert.equal(completed.rows[0].status, 'verified'); assert.equal(completed.rows[0].evidence_reference, evidence);
      for (const token of [undefined, owner.token]) {
        const browser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}) });
        assert.equal((await browser.rpc('complete_operations_action', { p_actor: owner.id, p_expected: expected, p_evidence_id: evidence, p_provider: 'internal_database', p_result: result })).error?.code, '42501');
      }
    } finally { await db.query('rollback'); await db.end(); }
  });
  test('real held-lock completion rejects an intervening attempt before evidence or audit writes', async t => {
    const db = connection(); await db.connect(); const [owner] = getUsers();
    const key = randomUUID(), evidence = `ev_${randomUUID()}`, service = new OperationsService(admin);
    const action = await service.createAction(owner.id, { actionType: 'emergency_stop', projectId: owner.project,
      targetType: 'automation', targetId: owner.project, targetVersion: 1, idempotencyKey: key, confirmed: false });
    t.after(async () => { assert.equal((await admin.from('operations_actions').delete().eq('id', action.id).eq('user_id', owner.id)).error, null); });
    let pending: PromiseLike<any> | undefined;
    let completions: PromiseLike<any>[] = [];
    try {
      const seeded = await admin.from('operations_actions').update({ status: 'running', attempt_count: 1,
        lease_owner: `api:${owner.id}`, lease_expires_at: new Date(Date.now() + 60_000).toISOString() }).eq('id', action.id).select('*').single();
      assert.equal(seeded.error, null);
      await db.query('begin'); await db.query('select id from operations_actions where id=$1 for update', [action.id]);
      pending = Promise.resolve(admin.rpc('complete_operations_action', { p_actor: owner.id, p_expected: seeded.data,
        p_evidence_id: evidence, p_provider: 'internal_database', p_result: result }));
      let blocked = false;
      for (let i = 0; i < 150; i++) {
        await db.query('select pg_stat_clear_snapshot()');
        const rows = await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%complete_operations_action%'");
        if (rows.rowCount) { blocked = true; break; } await delay(20);
      }
      assert.equal(blocked, true, 'HTTP completion reached the held PostgreSQL row lock');
      await db.query('update operations_actions set attempt_count=2 where id=$1', [action.id]); await db.query('commit');
      assert.equal((await pending).error?.code, '40001');
      for (const [table, column] of [['production_evidence','action_id'], ['operations_action_runs','action_id'], ['production_audit_log','target_id']]) {
        let query = admin.from(table).select('id').eq(column, action.id);
        if (table === 'production_audit_log') query = query.eq('action', 'operations.action.completed');
        const rows = await query; assert.equal(rows.error, null); assert.deepEqual(rows.data, []);
      }
      const current = await admin.from('operations_actions').select('status,attempt_count').eq('id', action.id).single();
      assert.equal(current.error, null); assert.deepEqual(current.data, { status: 'running', attempt_count: 2 });
      const admitted = await admin.from('operations_actions').select('*').eq('id', action.id).single();
      assert.equal(admitted.error, null);
      await db.query('begin'); await db.query('select id from operations_actions where id=$1 for update', [action.id]);
      completions = [0,1].map(() => Promise.resolve(admin.rpc('complete_operations_action', { p_actor: owner.id,
        p_expected: admitted.data, p_evidence_id: `ev_${randomUUID()}`, p_provider: 'internal_database', p_result: result })));
      blocked = false;
      for (let i = 0; i < 150; i++) {
        await db.query('select pg_stat_clear_snapshot()');
        const rows = await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%complete_operations_action%'");
        if ((rows.rowCount ?? 0) >= 2) { blocked = true; break; } await delay(20);
      }
      assert.equal(blocked, true, 'both competing completions reached the held row lock'); await db.query('commit');
      const receipts = await Promise.all(completions);
      assert.equal(receipts.filter(row => !row.error).length, 1);
      assert.equal(receipts.filter(row => row.error?.code === '40001').length, 1);
      for (const [table, column] of [['production_evidence','action_id'], ['operations_action_runs','action_id'], ['production_audit_log','target_id']]) {
        let query = admin.from(table).select('id').eq(column, action.id);
        if (table === 'production_audit_log') query = query.eq('action', 'operations.action.completed');
        const rows = await query; assert.equal(rows.error, null); assert.equal(rows.data?.length, 1);
      }
    } finally { await db.query('rollback'); if (pending) await pending; await Promise.all(completions); await db.end(); }
  });
}
