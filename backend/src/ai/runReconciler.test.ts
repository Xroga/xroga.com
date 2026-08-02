import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACTIVE_RUN_STATUSES,
  failInFlightRuns,
  reconcileOrphanedRuns,
  reconcileOutput,
  type ReconcileReason,
} from './runReconciler.js';

/**
 * Cover for orphaned-run reconciliation.
 *
 * Production evidence this exists for: one run held `running` for 14.6 hours after
 * its builder went silent, and a user's build was killed mid-flight by an ordinary
 * API deploy. Both left a row at `running` with no worker and no explanation.
 *
 * The database paths are exercised in the deployed environment; these tests pin the
 * contract that does not need a database — the reasons are typed, the messages are
 * truthful about side effects, and neither entry point can act without credentials.
 */

const REASONS: ReconcileReason[] = ['worker_restarted', 'deploy_interrupted', 'worker_lost'];

test('every reason produces a typed, interrupted outcome', () => {
  for (const reason of REASONS) {
    const output = reconcileOutput(reason);
    assert.equal(output.type, 'error');
    assert.equal(output.code, 'BUILD_INTERRUPTED');
    assert.equal(output.reason, reason);
    assert.equal(typeof output.error, 'string');
  }
});

test('a reconciled run never implies work reached GitHub or Vercel', () => {
  // The whole point: the user must know nothing shipped.
  for (const reason of REASONS) {
    const message = String(reconcileOutput(reason).error);
    assert.match(message, /No files were pushed/);
    assert.match(message, /no deployment was created/);
    assert.doesNotMatch(message, /success|complete|ready|deployed to/i);
  }
});

test('the user is told what to do next, without being asked to debug', () => {
  for (const reason of REASONS) {
    const message = String(reconcileOutput(reason).error);
    assert.match(message, /Please run it again\./);
    assert.doesNotMatch(message, /TypeScript|npm|install|terminal/i);
  }
});

test('an interrupted build is distinguishable from a build that genuinely failed', () => {
  // BUILD_FAILED means Xroga tried and could not; BUILD_INTERRUPTED means it never
  // got to finish. Collapsing them would misreport a deploy as a product defect.
  assert.equal(reconcileOutput('deploy_interrupted').code, 'BUILD_INTERRUPTED');
  assert.notEqual(reconcileOutput('deploy_interrupted').code, 'BUILD_FAILED');
});

test('only `running` is treated as an owned, active status', () => {
  // Reconciling a terminal status would rewrite finished history.
  assert.deepEqual([...ACTIVE_RUN_STATUSES], ['running']);
  for (const terminal of ['complete', 'error', 'cancelled']) {
    assert.ok(!(ACTIVE_RUN_STATUSES as readonly string[]).includes(terminal), terminal);
  }
});

test('reconciliation is inert without service credentials', async () => {
  // Guards the local and CI environments: no key, no writes, no throw.
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.equal(await reconcileOrphanedRuns(), 0);
    assert.equal(await failInFlightRuns(['a', 'b'], 'deploy_interrupted'), 0);
  } finally {
    if (saved !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  }
});

test('shutdown with nothing in flight does no work at all', async () => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  try {
    // Returns before touching the client, so an empty shutdown cannot fail a deploy.
    assert.equal(await failInFlightRuns([], 'deploy_interrupted'), 0);
  } finally {
    if (saved === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  }
});
