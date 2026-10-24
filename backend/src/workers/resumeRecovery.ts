/**
 * Lease-aware restart recovery for the canonical scheduler (INFRA-006).
 *
 * `recoverCanonicalExecutionStateForResume` (synthesis/reliability/canonicalResume.ts) already does the hard part: a task found `running`
 * after a restart is put back to `ready` without spending an attempt, and an interrupted non-idempotent operation (publish, commit, deploy,
 * mutation) is BLOCKED rather than replayed. It cannot know who else is alive. After a restart of ONE API process, a browser task may still
 * be running on a worker that did not restart, and resuming it would start a second copy.
 *
 * This wrapper asks the lease store. A `running` task whose lease is still held by a live worker is left exactly as it was; every other
 * interrupted task goes through the unchanged canonical recovery. The handler's own lease acquisition (and fencing) remains the final
 * guard, so a race between this check and a worker taking a lease is still safe.
 */
import type { CanonicalExecutionState } from '../ai/executionRuntime.js';
import { recoverCanonicalExecutionStateForResume, type CanonicalResumeResult } from '../synthesis/reliability/canonicalResume.js';
import type { LeaseStore } from './leaseStore.js';

export interface LeaseAwareResume extends CanonicalResumeResult {
  /** tasks left `running` because a live worker still holds their lease */
  readonly heldByLiveWorker: readonly string[];
}

export async function recoverRunWithLeases(input: CanonicalExecutionState, leases: LeaseStore, tenantId: string): Promise<LeaseAwareResume> {
  const held: string[] = [];
  for (const task of input.tasks) {
    if (task.status !== 'running') continue;
    const holder = await leases.holder({ tenantId, runId: input.runId, taskId: task.id });
    if (holder) held.push(task.id);
  }
  const result = recoverCanonicalExecutionStateForResume(input);
  if (!held.length) return { ...result, heldByLiveWorker: [] };

  const originals = new Map(input.tasks.filter((t) => held.includes(t.id)).map((t) => [t.id, structuredClone(t)]));
  result.state.tasks = result.state.tasks.map((t) => originals.get(t.id) ?? t);
  return {
    state: result.state,
    resumedTaskIds: result.resumedTaskIds.filter((id) => !held.includes(id)),
    blockedUncertainTaskIds: result.blockedUncertainTaskIds.filter((id) => !held.includes(id)),
    heldByLiveWorker: held,
  };
}
