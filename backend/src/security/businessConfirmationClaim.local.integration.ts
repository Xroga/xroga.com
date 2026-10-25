import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function registerBusinessConfirmationClaimTests(admin: SupabaseClient, getUsers: () => readonly { id: string; token: string }[]): void {
  test('real confirmation claim binds complete reviewed plan and checks expiry after contended row locks', async t => {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const url = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
    const [owner,other] = getUsers(), ids: string[] = [];
    const plan = { version: '1.0', sessionId: 'trs_fixture', useCase: 'fixture', toolkit: 'fixture', toolSlug: 'fixture',
      arguments: {}, risk: 'write', requiresConfirmation: true, summary: 'No provider execution', requiredScopes: [], planDigest: 'a'.repeat(64) };
    t.after(async () => { if (ids.length) assert.equal((await admin.from('business_action_confirmations').delete().in('id', ids)).error, null); });
    const db = new pg.Client({ connectionString: url.href, ssl: false }); await db.connect();
    let pending: PromiseLike<any>[] = [];
    try {
      for (const mode of ['competing','expired','mutated']) {
        const id = randomUUID(); ids.push(id);
        const inserted = await db.query(`insert into business_action_confirmations(id,user_id,plan,plan_digest,summary,toolkit,risk,expires_at)
          values($1,$2,$3,$4,$5,'fixture','write',clock_timestamp()+interval '2 minutes') returning to_jsonb(business_action_confirmations) value`,
        [id,owner.id,plan,plan.planDigest,plan.summary]);
        const row = inserted.rows[0].value;
        if (mode === 'expired') {
          const updated = await db.query("update business_action_confirmations set expires_at=clock_timestamp()+interval '2 seconds' where id=$1 returning expires_at::text value", [id]);
          row.expires_at = updated.rows[0].value;
        }
        const args = { p_owner: owner.id, p_id: id, p_digest: plan.planDigest, p_plan: plan, p_expires: row.expires_at };
        if (mode === 'competing') {
          for (const patch of [{ p_owner: other.id }, { p_digest: 'b'.repeat(64) }, { p_plan: { ...plan, arguments: { changed: true } } }]) {
            const denied = await admin.rpc('claim_business_action_confirmation', { ...args, ...patch }).maybeSingle();
            assert.equal(denied.error, null); assert.equal(denied.data, null);
          }
          for (const token of [undefined,owner.token]) {
            const browser: SupabaseClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false }, ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}) });
            assert.equal((await browser.rpc('claim_business_action_confirmation', args)).error?.code, '42501');
          }
        }
        await db.query('begin'); await db.query('select id from business_action_confirmations where id=$1 for update', [id]);
        pending = Array.from({ length: mode === 'competing' ? 2 : 1 }, () => Promise.resolve(admin.rpc('claim_business_action_confirmation', args).maybeSingle()));
        let blocked = false;
        for (let i = 0; i < 150; i++) {
          await db.query('select pg_stat_clear_snapshot()');
          const waiting = await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%claim_business_action_confirmation%'");
          if ((waiting.rowCount ?? 0) >= pending.length) { blocked = true; break; } await delay(20);
        }
        assert.equal(blocked, true, 'all HTTP claims reached the held row lock');
        if (mode === 'expired') await db.query('select pg_sleep(greatest(0,extract(epoch from ($1::timestamptz-clock_timestamp())))+0.05)', [row.expires_at]);
        if (mode === 'mutated') await db.query("update business_action_confirmations set plan=jsonb_set(plan,'{arguments}','{\"changed\":true}') where id=$1", [id]);
        await db.query('commit');
        const receipts = await Promise.all(pending); pending = [];
        assert.ok(receipts.every(receipt => !receipt.error));
        const winners = receipts.filter(receipt => receipt.data);
        assert.equal(winners.length, mode === 'competing' ? 1 : 0);
        if (winners.length) {
          assert.equal(winners[0].data.user_id, owner.id); assert.equal(winners[0].data.id, id);
          assert.equal(winners[0].data.status, 'executing'); assert.deepEqual(winners[0].data.plan, plan);
          assert.ok(Number.isFinite(Date.parse(winners[0].data.claimed_at)));
        }
        const stored = await admin.from('business_action_confirmations').select('status,claimed_at').eq('id', id).single();
        assert.equal(stored.error, null); assert.equal(stored.data?.status, mode === 'competing' ? 'executing' : 'pending');
        if (mode !== 'competing') assert.equal(stored.data?.claimed_at, null);
      }
    } finally { await db.query('rollback'); await Promise.all(pending); await db.end(); }
  });
}
