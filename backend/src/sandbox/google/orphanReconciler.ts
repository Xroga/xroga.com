/**
 * Recovery of Google execution machines that were allocated but never durably recorded.
 *
 * An allocation is recorded as soon as Compute reports its target id (the creation path persists it before waiting for boot). One that exists with no
 * live session record long after that point is a leak: a creation whose record or cleanup both failed. Compute also deletes every machine at its own
 * maxRunDuration, so a leak is bounded by its TTL; this reclaims the slot sooner and, more importantly, makes the leak visible.
 *
 * Safety rules, each tested:
 *  - nothing younger than the recording deadline is touched (a creation in progress, or a record still being written, is not an orphan);
 *  - a machine whose age or identity cannot be read completely is reported and never deleted;
 *  - recorded-ness is checked twice, the second time immediately before deleting;
 *  - an uncertain lookup is never treated as "unrecorded";
 *  - deletion goes through the control's own destroy, which re-verifies the instance id, labels, expiry and boot image, so a newer machine that took a
 *    reused slot name is never deleted;
 *  - a bounded number of deletions per run, and a failed deletion stays in the report rather than being retried blindly.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getGlobalSupabaseAdmin } from '../../security/serviceRoleGuard.js';
import type { GceExecutionHandle } from './gceMachineControl.js';

export interface AllocationControl {
  listAllocations(): Promise<Array<{ name: string; handle: GceExecutionHandle | null; createdAtEpoch: number | null; status: string }>>;
  destroy(handle: GceExecutionHandle): Promise<void>;
}

export type AllocationOutcome =
  | 'deleted' | 'skipped_recent' | 'skipped_unknown_age' | 'skipped_recorded' | 'skipped_lookup_failed' | 'unrecognized' | 'deferred_limit' | `failed:${string}`;

export interface AllocationReport {
  readonly name: string;
  readonly instanceId: string | null;
  readonly ageSeconds: number | null;
  readonly outcome: AllocationOutcome;
}

export interface OrphanReport {
  readonly inspected: number;
  readonly deleted: number;
  readonly failed: number;
  readonly allocations: readonly AllocationReport[];
}

/** The smallest recording deadline allowed: longer than the creation poll (3 minutes) plus the boot wait (90 seconds), with margin. */
export const MIN_RECORDING_DEADLINE_SECONDS = 600;

export function recordingDeadlineFromEnv(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.XROGA_GCE_ORPHAN_DEADLINE_SECONDS;
  const n = raw === undefined || raw.trim() === '' ? 1800 : Number(raw);
  if (!Number.isInteger(n) || n < MIN_RECORDING_DEADLINE_SECONDS || n > 86_400) {
    throw new Error(`XROGA_GCE_ORPHAN_DEADLINE_SECONDS must be a whole number between ${MIN_RECORDING_DEADLINE_SECONDS} and 86400, so a creation still in progress is never swept.`);
  }
  return n;
}

export interface OrphanDeps {
  readonly control: AllocationControl;
  /** True if a live session record references this machine. Must throw, never answer false, when it cannot tell. */
  readonly isRecorded: (handle: GceExecutionHandle) => Promise<boolean>;
  readonly recordingDeadlineSeconds: number;
  readonly nowEpoch?: () => number;
  readonly maxDeletions?: number;
}

export async function reconcileUnrecordedAllocations(deps: OrphanDeps): Promise<OrphanReport> {
  if (!Number.isFinite(deps.recordingDeadlineSeconds) || deps.recordingDeadlineSeconds < MIN_RECORDING_DEADLINE_SECONDS) {
    throw new Error('The recording deadline is too short to be safe.');
  }
  const now = (deps.nowEpoch ?? (() => Math.floor(Date.now() / 1000)))();
  const limit = deps.maxDeletions ?? 3;
  const reports: AllocationReport[] = [];
  let deleted = 0; let failed = 0;
  for (const item of await deps.control.listAllocations()) {
    const age = item.createdAtEpoch === null ? null : Math.max(0, now - item.createdAtEpoch);
    const base = { name: item.name, instanceId: item.handle?.instanceId ?? null, ageSeconds: age };
    if (!item.handle) { reports.push({ ...base, outcome: 'unrecognized' }); continue; }
    if (age === null) { reports.push({ ...base, outcome: 'skipped_unknown_age' }); continue; }
    if (age < deps.recordingDeadlineSeconds) { reports.push({ ...base, outcome: 'skipped_recent' }); continue; }
    try {
      if (await deps.isRecorded(item.handle)) { reports.push({ ...base, outcome: 'skipped_recorded' }); continue; }
    } catch { reports.push({ ...base, outcome: 'skipped_lookup_failed' }); continue; }
    if (deleted + failed >= limit) { reports.push({ ...base, outcome: 'deferred_limit' }); continue; }
    try {
      // a record written between the first check and now means this is not an orphan after all
      if (await deps.isRecorded(item.handle)) { reports.push({ ...base, outcome: 'skipped_recorded' }); continue; }
      await deps.control.destroy(item.handle);
      deleted++; reports.push({ ...base, outcome: 'deleted' });
    } catch (error) {
      failed++; reports.push({ ...base, outcome: `failed:${(error as { code?: string }).code ?? 'UNKNOWN'}` });
    }
  }
  return { inspected: reports.length, deleted, failed, allocations: reports };
}

/** Whether a live session (creating, running or stopped) references this machine. A destroyed or failed record does not make a still-running machine "recorded". */
export function recordedAllocationLookup(client: SupabaseClient = getGlobalSupabaseAdmin('gce_allocation_reconcile')): OrphanDeps['isRecorded'] {
  return async (handle) => {
    const { data, error } = await client.from('project_runtime_sessions').select('session_id')
      .eq('provider_id', 'google-gce').in('status', ['creating', 'running', 'stopped'])
      .filter('state->providerState->gce->>instanceId', 'eq', handle.instanceId).limit(1);
    if (error || !Array.isArray(data)) throw new Error('lookup failed');
    return data.length > 0;
  };
}

/**
 * The maintenance step. Off unless XROGA_GCE_ORPHAN_SWEEP=1 and the Google runtime is selected; returns null when it does not run. It only runs the
 * reconciler above with the production control and lookup, and surfaces anything it deleted or failed to delete in the server log.
 */
export async function sweepUnrecordedGceAllocations(
  env: NodeJS.ProcessEnv = process.env,
  make?: () => Promise<OrphanDeps>,
): Promise<OrphanReport | null> {
  if (env.XROGA_GCE_ORPHAN_SWEEP !== '1') return null;
  const deps = make ? await make() : await productionDeps(env);
  if (!deps) return null;
  const report = await reconcileUnrecordedAllocations(deps);
  if (report.deleted > 0 || report.failed > 0) {
    console.warn(`[gceOrphanSweep] inspected ${report.inspected}, deleted ${report.deleted}, failed ${report.failed}`, JSON.stringify(report.allocations.filter((a) => a.outcome === 'deleted' || a.outcome.startsWith('failed:'))));
  }
  return report;
}

async function productionDeps(env: NodeJS.ProcessEnv): Promise<OrphanDeps | null> {
  const [{ googleProjectRuntimeSelected, googleExecutionConfiguration }, { GceMachineControl }] = await Promise.all([
    import('../../synthesis/projectRuntime/googleFactory.js'), import('./gceMachineControl.js'),
  ]);
  if (!googleProjectRuntimeSelected(env)) return null;
  return { control: new GceMachineControl(googleExecutionConfiguration(env)), isRecorded: recordedAllocationLookup(), recordingDeadlineSeconds: recordingDeadlineFromEnv(env) };
}
