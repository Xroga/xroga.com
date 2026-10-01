import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACTIVE_RUN_STATUSES,
  failInFlightRuns,
  orphanLeaseFilter,
  reconcileOrphanedRuns,
  reconcileOutput,
  type ReconcileReason,
} from './runReconciler.js';

import {
  activeRunIds,
  completeRun,
  createRun,
} from './runStore.js';

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

test('restart and deploy interruption copy does not claim uncertain publication', () => {
  for (const reason of ['worker_restarted', 'deploy_interrupted'] as const) {
    const message = String(reconcileOutput(reason).error);
    assert.match(message, /did not record a completed publication or deployment/i);
    assert.match(message, /Check any connected provider/i);
    assert.doesNotMatch(message, /No files were pushed|no deployment was created/i);
    assert.doesNotMatch(
      message,
      /publication succeeded|deployment succeeded|successfully deployed|deployed to/i,
    );
  }
});

test('orphan reconciliation selects only stale leases and legacy stale rows', () => {
  const cutoff =
    '2026-10-02T00:00:00.000Z';

  assert.equal(
    orphanLeaseFilter(
      cutoff,
    ),
    `heartbeat_at.lt.${cutoff},and(heartbeat_at.is.null,created_at.lt.${cutoff})`,
  );
});

test('only runs created by this worker are held for shutdown', () => {
  const runId =
    `00000000-0000-4000-8000-${Date.now().toString().padStart(12, '0').slice(-12)}`;

  createRun(
    '00000000-0000-4000-8000-000000000001',
    'worker ownership fixture',
    runId,
  );

  assert.equal(
    activeRunIds()
      .includes(
        runId,
      ),
    true,
  );

  completeRun(
    runId,
    {
      output: {
        type:
          'engineering',
      },
    },
  );

  assert.equal(
    activeRunIds()
      .includes(
        runId,
      ),
    false,
  );
});

test('the history cache cap cannot evict a run that this worker still owns', () => {
  const runIds = Array.from(
    { length: 41 },
    (_, index) =>
      `00000000-0000-4000-8000-${String(100_000 + index).padStart(12, '0')}`,
  );

  for (const runId of runIds) {
    createRun(
      '00000000-0000-4000-8000-000000000002',
      'worker cache-cap fixture',
      runId,
    );
  }

  for (const runId of runIds) {
    assert.equal(activeRunIds().includes(runId), true);
    completeRun(runId, { output: { type: 'engineering' } });
  }
});

test('the user is given an exact same-run recovery action without being asked to debug', () => {
  for (const reason of REASONS) {
    const output = reconcileOutput(reason);
    const message = String(output.error);

    assert.match(message, /Retry to continue this exact build/i);
    assert.equal(output.resumable, true);
    assert.equal(output.resumeMode, 'same_run');
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
