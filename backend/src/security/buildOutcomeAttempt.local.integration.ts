import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { buildOutcomeFromTerminalRun, SupabaseBuildOutcomeStore } from '../ai/buildOutcomeMemory.js';

type FixtureUser = { id: string; token: string };
function guard(): void {
  assert.equal(process.env.CI, 'true');
  assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
  assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
}

/** Uses the canonical disposable users. Never runs against a provider project. */
export function registerBuildOutcomeAttemptTests(admin: SupabaseClient, getUsers: () => readonly FixtureUser[]): void {
  async function fixture(t: TestContext) {
    guard();
    const [owner, other] = getUsers();
    const runId = randomUUID(), generation = randomUUID(), completedAt = new Date().toISOString();
    const output = { type: 'error', code: 'BUILD_FAILED' };
    t.after(async () => {
      const outcomes = await admin.from('build_outcomes').delete().eq('run_id', runId).in('user_id', [owner.id, other.id]);
      assert.equal(outcomes.error, null);
      const run = await admin.from('swarm_runs').delete().eq('id', runId).eq('user_id', owner.id);
      assert.equal(run.error, null);
    });
    const inserted = await admin.from('swarm_runs').insert({ id: runId, user_id: owner.id, prompt: 'Synthetic learning fixture', status: 'error',
      output, feature_category: 'chat', completed_at: completedAt, iteration_count: 1, lease_generation: generation, worker_id: null });
    assert.equal(inserted.error, null);
    const store = new SupabaseBuildOutcomeStore({ generation, completedAt, output });
    await store.upsert(buildOutcomeFromTerminalRun({ runId, userId: owner.id, terminalStatus: 'error', featureCategory: 'chat', iterationCount: 1, completedAt, output }));
    const saved = await admin.from('build_outcomes').select('*').eq('run_id', runId).eq('user_id', owner.id).single();
    assert.equal(saved.error, null); assert.ok(saved.data);
    const args = { p_run_id: runId, p_owner_id: owner.id, p_generation: generation, p_completed_at: completedAt, p_output: output, p_outcome: saved.data };
    return { owner, other, runId, args, saved: saved.data };
  }

  test('real worker learning fence binds owner, epoch and exact terminal evidence', async t => {
    const f = await fixture(t);
    for (const patch of [
      { p_owner_id: f.other.id }, { p_generation: randomUUID() }, { p_generation: null },
      { p_completed_at: new Date(Date.parse(f.args.p_completed_at) + 1000).toISOString() },
      { p_output: { type: 'stale' } }, { p_outcome: { ...f.saved, iteration_count: 2 } },
      { p_outcome: { ...f.saved, terminal_status: 'complete' } },
      { p_outcome: { ...f.saved, user_id: f.other.id } }, { p_outcome: { ...f.saved, run_id: randomUUID() } },
      { p_outcome: { ...f.saved, unknown_field: 'not admitted' } },
    ]) {
      const denied = await admin.rpc('persist_build_outcome_attempt', { ...f.args, ...patch });
      assert.equal(denied.error, null); assert.equal(denied.data, false);
    }
    const repeated = await admin.rpc('persist_build_outcome_attempt', f.args);
    assert.equal(repeated.error, null); assert.equal(repeated.data, true);
    const read = () => admin.from('build_outcomes').select('*').eq('run_id', f.runId).single();
    assert.deepEqual((await read()).data, f.saved);
    const changed = await admin.from('swarm_runs').update({ output: { type: 'enriched' } }).eq('id', f.runId).eq('user_id', f.owner.id);
    assert.equal(changed.error, null);
    assert.equal((await admin.rpc('persist_build_outcome_attempt', f.args)).data, false);
    assert.deepEqual((await read()).data, f.saved);
    assert.equal((await admin.from('swarm_runs').update({ output: f.args.p_output }).eq('id', f.runId).eq('user_id', f.owner.id)).error, null);
    assert.equal((await admin.from('build_outcomes').update({ user_id: f.other.id }).eq('run_id', f.runId)).error, null);
    const foreign = await read(); assert.equal(foreign.error, null);
    const collision = await admin.rpc('persist_build_outcome_attempt', f.args);
    assert.equal(collision.error, null); assert.equal(collision.data, false);
    assert.deepEqual((await read()).data, foreign.data);
    for (const token of [null, f.owner.token]) {
      const browser = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
      });
      assert.equal((await browser.rpc('persist_build_outcome_attempt', f.args)).error?.code, '42501');
    }
  });

  test('real two-session learning write blocked on parent lock loses to resumed epoch', async t => {
    const f = await fixture(t);
    const url = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
    const locker = new pg.Client({ connectionString: url.href, ssl: false });
    const writer = new pg.Client({ connectionString: url.href, ssl: false });
    await locker.connect(); await writer.connect();
    let pending: Promise<pg.QueryResult> | undefined;
    try {
      await writer.query('set statement_timeout = 10000');
      const writerPid = (await writer.query('select pg_backend_pid() as pid')).rows[0].pid;
      const lockerPid = (await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
      await writer.query('set role service_role');
      await locker.query('begin');
      await locker.query('select id from public.swarm_runs where id=$1 and user_id=$2 for update', [f.runId, f.owner.id]);
      pending = writer.query('select public.persist_build_outcome_attempt($1,$2,$3,$4,$5,$6) as ok',
        [f.runId, f.owner.id, f.args.p_generation, f.args.p_completed_at, JSON.stringify(f.args.p_output), JSON.stringify(f.args.p_outcome)]);
      // Attach rejection handling immediately, but still assert the actual result below.
      void pending.catch(() => {});
      let blocked = false;
      for (let count = 0; count < 100; count++) {
        const observed = await locker.query('select pg_blocking_pids($1) as blockers', [writerPid]);
        if (observed.rows[0].blockers.includes(lockerPid)) { blocked = true; break; }
        await delay(20);
      }
      assert.equal(blocked, true, 'must observe the real blocked writer, not assume race timing');
      await locker.query("update public.swarm_runs set status='running',completed_at=null,lease_generation=$3,worker_id='fixture-new-worker' where id=$1 and user_id=$2", [f.runId, f.owner.id, randomUUID()]);
      await locker.query('commit');
      assert.equal((await pending).rows[0].ok, false);
      const retained = await admin.from('build_outcomes').select('*').eq('run_id', f.runId).eq('user_id', f.owner.id).single();
      assert.equal(retained.error, null); assert.deepEqual(retained.data, f.saved);
    } finally {
      await locker.query('rollback');
      if (pending) await pending.catch(() => {});
      await writer.end(); await locker.end();
    }
  });
}
