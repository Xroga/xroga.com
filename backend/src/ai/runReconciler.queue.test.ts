import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { QUEUED_RUN_TTL_MS, reconcileOrphanedRuns } from './runReconciler.js';
import { fakeTable, type Row } from '../workers/__tests__/postgrestFilter.js';

const NOW = Date.parse('2026-10-29T12:00:00.000Z');
const MIN = 60_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function run(id: string, extra: Row): Row {
  return { id, status: 'running', worker_id: null, lease_generation: null, heartbeat_at: null, output: null, completed_at: null, created_at: ago(500 * MIN), ...extra };
}

function setup() {
  const rows: Row[] = [
    run('queued-10m', { heartbeat_at: ago(10 * MIN) }), // admitted, waiting for launch capacity
    run('queued-59m', { heartbeat_at: ago(59 * MIN) }),
    run('queued-90m', { heartbeat_at: ago(90 * MIN) }), // waited past the queue bound
    run('worker-stale', { worker_id: 'w1', lease_generation: 'g1', heartbeat_at: ago(10 * MIN) }),
    run('worker-fresh', { worker_id: 'w2', lease_generation: 'g2', heartbeat_at: ago(MIN) }),
    run('legacy-no-heartbeat', {}), // predates the lease migration
    run('done', { status: 'complete', heartbeat_at: ago(500 * MIN) }),
  ];
  const client = { from: (table: string) => { assert.equal(table, 'swarm_runs'); return fakeTable(rows); } } as unknown as SupabaseClient;
  return { rows, client, by: (id: string) => rows.find((r) => r.id === id)! };
}

const reasonOf = (row: Row) => (row.output as { reason: string }).reason;

test('a request waiting for capacity is not ended as a stopped worker, but is ended honestly once it exceeds its own bound', async (t) => {
  t.mock.method(Date, 'now', () => NOW);
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'synthetic-only';
  const { client, by } = setup();
  const ended = await reconcileOrphanedRuns({ client });
  // still queued: a 10- or 59-minute wait for launch capacity is legitimate
  assert.equal(by('queued-10m').status, 'running');
  assert.equal(by('queued-59m').status, 'running');
  // beyond the bound: ended as never started, with an accurate reason (nothing ran)
  assert.equal(by('queued-90m').status, 'error');
  assert.equal(reasonOf(by('queued-90m')), 'never_started');
  assert.match(String((by('queued-90m').output as { error: string }).error), /Nothing was run/);
  // worker-held runs keep the five-minute rule and the old reason
  assert.equal(by('worker-stale').status, 'error');
  assert.equal(reasonOf(by('worker-stale')), 'worker_restarted');
  assert.equal(by('worker-fresh').status, 'running');
  // legacy rows with no heartbeat are still ended as before and never described as "never started"
  assert.equal(by('legacy-no-heartbeat').status, 'error');
  assert.equal(reasonOf(by('legacy-no-heartbeat')), 'worker_restarted');
  // terminal runs are untouched
  assert.equal(by('done').status, 'complete');
  assert.equal(ended, 3);
  assert.ok(QUEUED_RUN_TTL_MS > 5 * MIN);
});

test('the queue bound can be raised but never lowered below the orphan grace', async (t) => {
  t.mock.method(Date, 'now', () => NOW);
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'synthetic-only';
  const { client, by } = setup();
  await reconcileOrphanedRuns({ client, queuedTtlMs: 1 });
  // a 1ms bound is clamped to the five-minute grace, so the 10-minute-old queued request ends
  assert.equal(by('queued-10m').status, 'error');
  assert.equal(reasonOf(by('queued-10m')), 'never_started');
});
