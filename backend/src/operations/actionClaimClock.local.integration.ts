import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

export function registerActionClaimClockTests(admin: SupabaseClient, getUsers: () => readonly { id: string; project: string; token: string }[]): void {
  test('real claim samples lease time after a held row and retains exclusion, attempt limits and browser denial', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const url = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
    const db = new pg.Client({ connectionString: url.href, ssl: false }); await db.connect();
    const [owner] = getUsers();
    const action = await new OperationsService(admin).createAction(owner.id, { actionType: 'emergency_stop', projectId: owner.project,
      targetType: 'automation', targetId: owner.project, targetVersion: 1, idempotencyKey: randomUUID(), confirmed: false });
    t.after(async () => { assert.equal((await admin.from('operations_actions').delete().eq('id', action.id).eq('user_id', owner.id)).error, null); });
    const args = { p_action_id: action.id, p_lease_owner: `api:${owner.id}`, p_lease_seconds: 10 };
    let pending: PromiseLike<any> | undefined;
    try {
      // Expire an existing lease while the request is blocked. No adapter runs.
      await db.query("update operations_actions set status='running',attempt_count=1,lease_owner='fixture:old',lease_expires_at=clock_timestamp()+interval '1 second' where id=$1", [action.id]);
      await db.query('begin'); await db.query('select id from operations_actions where id=$1 for update', [action.id]);
      pending = Promise.resolve(admin.rpc('operations_claim_action', args));
      let blocked = false;
      for (let i = 0; i < 150; i++) {
        await db.query('select pg_stat_clear_snapshot()');
        const rows = await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%operations_claim_action%'");
        if (rows.rowCount) { blocked = true; break; } await delay(20);
      }
      assert.equal(blocked, true, 'claim reached held row lock');
      const competing = await admin.rpc('operations_claim_action', args);
      assert.equal(competing.error, null); assert.deepEqual(competing.data, [], 'advisory exclusion is immediate');
      // Wait past both the old lease and the requested ten-second new lease,
      // measured entirely by PostgreSQL rather than the application clock.
      await db.query('select pg_sleep(10.1)');
      await db.query('commit');
      const claimed = await pending; assert.equal(claimed.error, null); assert.equal(claimed.data?.length, 1);
      assert.equal(claimed.data[0].attempt_count, 2); assert.equal(claimed.data[0].lease_owner, args.p_lease_owner);
      const fresh = await db.query('select lease_expires_at>clock_timestamp() as live, extract(epoch from lease_expires_at-updated_at)::int as duration from operations_actions where id=$1', [action.id]);
      assert.deepEqual(fresh.rows[0], { live: true, duration: 10 });
      const duplicate = await admin.rpc('operations_claim_action', args); assert.equal(duplicate.error, null); assert.deepEqual(duplicate.data, []);
      await db.query("update operations_actions set attempt_count=max_attempts,lease_expires_at=clock_timestamp()-interval '1 second' where id=$1", [action.id]);
      const exhausted = await admin.rpc('operations_claim_action', args); assert.equal(exhausted.error, null); assert.deepEqual(exhausted.data, []);
      for (const token of [undefined, owner.token]) {
        const browser: SupabaseClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}) });
        assert.equal((await browser.rpc('operations_claim_action', args)).error?.code, '42501');
      }
      assert.deepEqual((await admin.from('operations_action_runs').select('id').eq('action_id', action.id)).data, []);
    } finally { await db.query('rollback'); if (pending) await pending; await db.end(); }
  });
}
