import { getSupabaseAdmin } from '../config/supabase.js';

/**
 * Orphaned-run reconciliation.
 *
 * Two production facts made this necessary. A run sat at `running` for over
 * fourteen hours after its builder attempt went silent, and a user's build was
 * killed mid-flight by an ordinary API deploy — in both cases the row stayed
 * `running` forever and the user was left watching nothing.
 *
 * The fix needs no schema change, because of how run state already works: the
 * live run map is *in process memory*. If this process has just started, it owns
 * no runs, so every row still marked `running` belongs to a worker that no longer
 * exists. That is a complete and sound definition of "orphaned" — no lease column,
 * no heartbeat table, no migration, and nothing to keep in sync.
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
const ORPHAN_GRACE_MS = 5 * 60_000;

export type ReconcileReason = 'worker_restarted' | 'deploy_interrupted' | 'worker_lost';

const REASON_TEXT: Record<ReconcileReason, string> = {
  worker_restarted:
    'The build stopped because the service restarted. No files were pushed and no deployment was created. Please run it again.',
  deploy_interrupted:
    'The build stopped because the service was updating. No files were pushed and no deployment was created. Please run it again.',
  worker_lost:
    'The build stopped unexpectedly and could not be recovered. No files were pushed and no deployment was created. Please run it again.',
};

export function reconcileOutput(reason: ReconcileReason): Record<string, unknown> {
  return {
    type: 'error',
    code: 'BUILD_INTERRUPTED',
    reason,
    error: REASON_TEXT[reason],
  };
}

/** Statuses that mean "a worker should be actively holding this run". */
export const ACTIVE_RUN_STATUSES = ['running'] as const;

/**
 * Marks runs abandoned by a previous process as failed.
 *
 * `graceMs` keeps a rolling deploy from reaping runs owned by the outgoing
 * machine while it is still finishing them. Returns the number reconciled so the
 * caller can log something factual rather than "done".
 */
export async function reconcileOrphanedRuns(opts: { graceMs?: number } = {}): Promise<number> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 0;
  const graceMs = opts.graceMs ?? ORPHAN_GRACE_MS;
  const cutoff = new Date(Date.now() - graceMs).toISOString();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('swarm_runs')
    .update({
      status: 'error',
      output: reconcileOutput('worker_restarted'),
      completed_at: new Date().toISOString(),
    })
    .in('status', ACTIVE_RUN_STATUSES as unknown as string[])
    .lt('created_at', cutoff)
    .select('id');

  if (error) {
    // Reconciliation is best-effort: never let it stop the API from booting.
    console.warn('[runReconciler] could not reconcile orphaned runs:', error.message);
    return 0;
  }
  const count = data?.length ?? 0;
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
  opts: { timeoutMs?: number } = {},
): Promise<number> {
  if (!runIds.length || !process.env.SUPABASE_SERVICE_ROLE_KEY) return 0;
  const timeoutMs = opts.timeoutMs ?? 3_000;
  const supabase = getSupabaseAdmin();

  const update = supabase
    .from('swarm_runs')
    .update({
      status: 'error',
      output: reconcileOutput(reason),
      completed_at: new Date().toISOString(),
    })
    .in('id', [...runIds])
    .in('status', ACTIVE_RUN_STATUSES as unknown as string[])
    .select('id');

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  const result = await Promise.race([update, timeout]);
  if (!result || 'error' in result === false) return 0;
  const { data, error } = result as { data: { id: string }[] | null; error: { message: string } | null };
  if (error) {
    console.warn('[runReconciler] could not fail in-flight runs on shutdown:', error.message);
    return 0;
  }
  return data?.length ?? 0;
}
