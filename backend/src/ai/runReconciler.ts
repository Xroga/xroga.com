import type { SupabaseClient } from '@supabase/supabase-js';
import { getGlobalSupabaseAdmin } from '../security/serviceRoleGuard.js';

/**
 * Orphaned-run reconciliation.
 *
 * Two production facts made this necessary. A run sat at `running` for over
 * fourteen hours after its builder attempt went silent, and a user's build was
 * killed mid-flight by an ordinary API deploy — in both cases the row stayed
 * `running` forever and the user was left watching nothing.
 *
 * Production can briefly have more than one API process during a rolling deploy.
 * Therefore `running` and age alone are not proof of an orphan: the outgoing
 * process may still own a long build. Each active worker now holds an opaque lease
 * and renews a bounded heartbeat. Reconciliation touches only stale leases (plus
 * legacy rows that predate the lease migration).
 *
 * Two moments matter:
 *
 *   shutdown  SIGTERM from a deploy — fail what is in flight *before* dying, so
 *             the user gets a truthful ending instead of silence
 *   startup   anything still `running` from a previous process — fail it, with a
 *             grace window so a rolling deploy cannot reap the machine that is
 *             still serving
 *
 * Every path here writes a typed, honest reason and never claims work happened.
 */

/** Runs older than this with no owning process are certainly abandoned. */
export const ORPHAN_GRACE_MS = 5 * 60_000;

/**
 * A request that was durably admitted but has not been claimed by any worker is waiting for capacity, not abandoned by one. Its heartbeat is set
 * when it is admitted (or explicitly resumed) and nothing renews it until a worker claims it, so the five-minute worker rule would end a request
 * that is merely queued behind the launch capacity limit. It gets its own bounded wait instead.
 */
export const QUEUED_RUN_TTL_MS = 60 * 60_000;

export type ReconcileReason = 'worker_restarted' | 'deploy_interrupted' | 'worker_lost' | 'never_started';

const REASON_TEXT: Record<ReconcileReason, string> = {
  worker_restarted:
    'The build was interrupted because its worker stopped. Xroga did not record a completed publication or deployment for the interrupted operation. Check any connected provider first. Retry to continue this exact build from its latest durable checkpoint.',
  deploy_interrupted:
    'The build was interrupted while Xroga was updating. Xroga did not record a completed publication or deployment for the interrupted operation. Check any connected provider first. Retry to continue this exact build from its latest durable checkpoint.',
  worker_lost:
    'The build worker stopped unexpectedly. Xroga preserved the durable run evidence that was available. Retry to continue this exact build safely.',
  never_started:
    'This request waited too long for capacity and was stopped before any worker began it. Nothing was run and Xroga recorded no publication or deployment. Retry to start it again.',
};

export function reconcileOutput(reason: ReconcileReason): Record<string, unknown> {
  return {
    type: 'error',
    code: 'BUILD_INTERRUPTED',
    reason,
    resumable: true,
    resumeMode: 'same_run',
    error: REASON_TEXT[reason],
  };
}

/** Statuses that mean "a worker should be actively holding this run". */
export const ACTIVE_RUN_STATUSES = ['running'] as const;

export function orphanLeaseFilter(
  cutoff:
    string,
): string {
  return (
    `heartbeat_at.lt.${cutoff},` +
    `and(heartbeat_at.is.null,created_at.lt.${cutoff})`
  );
}

/**
 * Marks runs abandoned by a previous process as failed.
 *
 * `graceMs` keeps a rolling deploy from reaping runs owned by the outgoing
 * machine while it is still finishing them. Returns the number reconciled so the
 * caller can log something factual rather than "done".
 */
export async function reconcileOrphanedRuns(opts: { graceMs?: number; queuedTtlMs?: number; client?: SupabaseClient } = {}): Promise<number> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 0;
  const graceMs = Number.isFinite(opts.graceMs) ? Math.max(ORPHAN_GRACE_MS, opts.graceMs!) : ORPHAN_GRACE_MS;
  const cutoff = new Date(Date.now() - graceMs).toISOString();

  const supabase = opts.client ?? getGlobalSupabaseAdmin('stale_run_reconcile');
  // 1. Admitted but never claimed (a heartbeat from admission, no worker, no lease generation) and past its own bounded queue wait.
  const queuedTtl = Number.isFinite(opts.queuedTtlMs) ? Math.max(graceMs, opts.queuedTtlMs!) : Math.max(graceMs, QUEUED_RUN_TTL_MS);
  const queuedCutoff = new Date(Date.now() - queuedTtl).toISOString();
  const never = await supabase
    .from('swarm_runs')
    .update({ status: 'error', output: reconcileOutput('never_started'), completed_at: new Date().toISOString(), worker_id: null, lease_generation: null, heartbeat_at: null })
    .in('status', ACTIVE_RUN_STATUSES as unknown as string[])
    .is('worker_id', null).is('lease_generation', null).lt('heartbeat_at', queuedCutoff)
    .select('id');
  if (never.error) {
    console.warn('[runReconciler] could not reconcile never-started runs:', never.error.message);
  } else if ((never.data?.length ?? 0) > 0) {
    console.warn(`[runReconciler] ended ${never.data!.length} queued run(s) that no worker began within the queue wait`);
  }

  // 2. Runs a worker held (or legacy rows with no heartbeat at all). A run that is still waiting in the queue is excluded here.
  const { data, error } = await supabase
    .from('swarm_runs')
    .update({
      status: 'error',
      output: reconcileOutput('worker_restarted'),
      completed_at: new Date().toISOString(),
      worker_id: null,
      lease_generation: null,
      heartbeat_at: null,
    })
    .in('status', ACTIVE_RUN_STATUSES as unknown as string[])
    .or(
      orphanLeaseFilter(
        cutoff,
      ),
    )
    .or('worker_id.not.is.null,lease_generation.not.is.null,heartbeat_at.is.null')
    .select('id');

  const neverCount = never.error ? 0 : never.data?.length ?? 0;
  if (error) {
    // Reconciliation is best-effort: never let it stop the API from booting.
    console.warn('[runReconciler] could not reconcile orphaned runs:', error.message);
    return neverCount;
  }
  const count = (data?.length ?? 0) + neverCount;
  if (count > 0) {
    console.warn(`[runReconciler] reconciled ${count} orphaned run(s) left active by a previous process`);
  }
  return count;
}

/**
 * Fails the runs this process is holding, before it exits.
 *
 * Called from the SIGTERM handler. Bounded by `timeoutMs` because a deploy will
 * kill the process regardless — a slow database must not turn a clean shutdown
 * into a hard one, which would put us right back to orphaned rows.
 */
export async function failInFlightRuns(
  runIds: readonly string[],
  reason: ReconcileReason,
  opts: {
    timeoutMs?: number;
    workerId?: string;
  } = {},
): Promise<number> {
  if (!runIds.length || !process.env.SUPABASE_SERVICE_ROLE_KEY) return 0;
  if (!opts.workerId?.trim()) throw new Error('Worker lease identity required for shutdown reconciliation');
  const timeoutMs = opts.timeoutMs ?? 3_000;
  const supabase = getGlobalSupabaseAdmin('leased_worker_shutdown');

  let update = supabase
    .from('swarm_runs')
    .update({
      status: 'error',
      output: reconcileOutput(reason),
      completed_at: new Date().toISOString(),
      worker_id: null,
      lease_generation: null,
      heartbeat_at: null,
    })
    .in('id', [...runIds])
    .eq('worker_id', opts.workerId)
    .in('status', ACTIVE_RUN_STATUSES as unknown as string[]);

  const request =
    update.select(
      'id',
    );

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const result = await Promise.race([request, timeout]);
  if (!result || 'error' in result === false) return 0;
  const { data, error } = result as { data: { id: string }[] | null; error: { message: string } | null };
  if (error) {
    console.warn('[runReconciler] could not fail in-flight runs on shutdown:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}
