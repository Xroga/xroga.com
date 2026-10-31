import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';
import { requestRunCancellation } from '../ai/runStore.js';
import { canonicalBuildRunner, canonicalPreviewPort } from './canonical.js';
import { phase2ServicesFor } from './phase2Bridge.js';
import { BuilderService, type BuilderRunBinding } from './service.js';
import { SupabaseBuilderStore } from './store.js';
import { BuilderError } from './types.js';

/**
 * Bridges the canonical chat route (/api/swarm/execute) to an AI Product Builder project.
 * The project id is trusted only after the verified owner has been matched against durable
 * storage; the builder id in the request body never establishes ownership by itself.
 */
export function builderServiceFor(tenant: TenantContext): BuilderService {
  const context = requireTenantContext(tenant);
  return new BuilderService({ store: new SupabaseBuilderStore(context), runBuild: canonicalBuildRunner, preview: canonicalPreviewPort, cancelEngineRun: async (userId, runId) => { await requestRunCancellation(runId, userId); } });
}

export async function builderProjectExists(tenant: TenantContext, projectId: string): Promise<boolean> {
  const context = requireTenantContext(tenant);
  try {
    return Boolean(await builderServiceFor(context).requireProject(context.userId, projectId));
  } catch (error) {
    if (error instanceof BuilderError && error.code === 'not_found') return false;
    throw error;
  }
}

export function openBuilderRun(tenant: TenantContext, projectId: string, runId: string): Promise<BuilderRunBinding> {
  const context = requireTenantContext(tenant);
  return builderServiceFor(context).beginRun(context.userId, projectId, { runId });
}

export interface BuilderRunResult {
  readonly ok: boolean;
  readonly cancelled?: boolean;
  /** The canonical engine is not enabled: reported as blocked, not failed. */
  readonly blocked?: boolean;
  readonly reason?: string;
}

/**
 * Closes a chat-driven builder run. Never throws: a failed close must not mask the build result.
 * A saved revision exists only when the canonical validation accepted the result at commit time,
 * so "verified" here is derived from that, and then confirmed against the running preview.
 */
const closedRuns = new WeakSet<BuilderRunBinding>();
const closingRuns = new WeakMap<BuilderRunBinding, Promise<void>>();

export async function closeBuilderRun(tenant: TenantContext, run: BuilderRunBinding, result: BuilderRunResult): Promise<void> {
  const context = requireTenantContext(tenant);
  // Only a durable close is final. Concurrent callers await the same write, and
  // a failed write remains retryable without replaying generation or provider work.
  if (closedRuns.has(run)) return;
  const pending = closingRuns.get(run);
  if (pending) return pending.catch(() => undefined);
  const closing = persistBuilderClose(context, run, result);
  closingRuns.set(run, closing);
  try {
    await closing;
    closedRuns.add(run);
  } catch {
    // Preserve the canonical result. A later close may retry the owner/run-fenced write.
  } finally {
    closingRuns.delete(run);
  }
}

async function persistBuilderClose(context: TenantContext, run: BuilderRunBinding, result: BuilderRunResult): Promise<void> {
  const store = new SupabaseBuilderStore(context);
  // Every write below is guarded by the run slot: a run the user already cancelled, or a newer build, keeps its own state.
  if (result.cancelled) {
    await store.setStateForRun(context.userId, run.projectId, run.runId, 'cancelled', 'The build was cancelled.', null);
    return;
  }
  const saved = run.saved();
  if (!saved && !run.noChange()) {
    await store.setStateForRun(context.userId, run.projectId, run.runId, result.blocked ? 'blocked' : 'failed', (result.reason ?? 'The build did not produce a saved revision.').slice(0, 300), null);
    return;
  }
  await builderServiceFor(context).completeRun(
    context.userId,
    run,
    { outcome: result.ok ? 'completed' : 'failed', verified: result.ok, reason: result.reason ?? 'Canonical validation accepted the build.', files: [] },
    (revision) => canonicalPreviewPort.verify({ userId: context.userId, projectId: run.projectId, revision }),
  );
  // Rerun the browser tests against the new revision. Best effort and detached: a failure here
  // never changes the build result, and the outcome is recorded against the revision it tested.
  if (result.ok) {
    void phase2ServicesFor(context).qa.runQa(context.userId, run.projectId).catch(() => undefined);
  }
}
