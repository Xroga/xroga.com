import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';
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
  return new BuilderService({ store: new SupabaseBuilderStore(context), runBuild: canonicalBuildRunner, preview: canonicalPreviewPort });
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
export async function closeBuilderRun(tenant: TenantContext, run: BuilderRunBinding, result: BuilderRunResult): Promise<void> {
  const context = requireTenantContext(tenant);
  const store = new SupabaseBuilderStore(context);
  try {
    if (result.cancelled) {
      await store.setState(context.userId, run.projectId, 'cancelled', 'The build was cancelled.', null);
      return;
    }
    const saved = run.saved();
    if (!saved) {
      await store.setState(context.userId, run.projectId, result.blocked ? 'blocked' : 'failed', (result.reason ?? 'The build did not produce a saved revision.').slice(0, 300), null);
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
  } catch {
    // The project keeps its last recorded state; nothing is reported as verified.
  }
}
