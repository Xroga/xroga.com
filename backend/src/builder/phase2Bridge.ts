import { getProviderEntitlementStatus } from '../ai/providerBudget.js';
import { runBuildPipeline } from '../ai/pipeline.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';
import { getGitHubToken } from '../services/integrations/githubAuth.js';
import { ghFetch } from '../services/integrations/githubDeploy.js';
import { startOrRefreshLivePreview } from '../synthesis/livePreview/coordinator.js';
import { SupabaseProjectRuntimeStore } from '../synthesis/projectRuntime/index.js';
import { createSoftwareProject } from '../synthesis/softwareProject.js';
import { ExportService } from './export/service.js';
import { GitHubExportService } from './github/service.js';
import { createRestGitHubPort } from './github/restPort.js';
import { SupabasePhase2Store } from './phase2Store.js';
import { openPlaywrightQaDriver } from './qa/playwrightQaDriver.js';
import { QaService, type QaTarget, type RepairRunner } from './qa/qaService.js';
import { BuilderService } from './service.js';
import { hashSnapshot } from './snapshot.js';
import { SupabaseBuilderStore } from './store.js';
import { canonicalBuildRunner, canonicalPreviewPort } from './canonical.js';
import { BuilderError } from './types.js';

/**
 * Production wiring for Phase 2. Everything delegates to existing systems: the live-preview
 * coordinator and project runtime for the application under test, runBuildPipeline (SoftwareAgent
 * on the canonical scheduler, with its budget reservation and events) for repairs, and the existing
 * vault-held GitHub token and authorized transport for GitHub. Nothing here names a hosting provider.
 *
 * Whether a preview can be started at all depends on the configured ProjectRuntimeManager provider.
 * Until a working runtime exists (the Google runtime of the migration PR), QA reports pending_runtime
 * and never a pass.
 */

/** Finds, or restarts, the running application for a revision. Null when there is no runtime to test. */
export function canonicalQaTarget(): QaTarget {
  return {
    async ensure({ userId, project, revision }) {
      const store = new SupabaseProjectRuntimeStore();
      const latest = await store.loadLatestRevision(userId, project.id);
      // A project that was never previewed has no runtime binding to restart from.
      if (!latest) return null;
      const base = latest.project;
      // Run exactly the revision under test, on the runtime contract the project already has.
      const candidate = createSoftwareProject({
        contract: base.contract,
        files: revision.files,
        fileTrail: [],
        lifecycle: base.lifecycle,
        architecture: base.architecture,
        recipe: base.recipe,
        filePlan: base.filePlan,
        verified: false,
        reason: 'Preview prepared for browser QA.',
        blockers: [],
        evidence: [],
      });
      const sameSource = hashSnapshot(base.workspace.files) === revision.contentSha256;
      const started = await startOrRefreshLivePreview({ userId, project: candidate, runId: base.runId, forceRestart: !sameSource });
      await store.saveRevision(userId, started.project);
      if (started.preview.status !== 'ready' || !started.preview.url) return null;
      return { baseUrl: new URL(started.preview.url).origin, environment: { database: false } };
    },
  };
}

/** Pre-check only. The authoritative reservation happens inside the pipeline for every model call. */
export async function budgetAllowsRepair(userId: string): Promise<boolean> {
  try {
    const status = await getProviderEntitlementStatus(userId);
    const active = status.state === 'free_active' || status.state === 'promotional_active' || status.state === 'paid_active';
    return active && (status.availableNowPercent === null || status.availableNowPercent > 0);
  } catch {
    return false;
  }
}

function repairRunnerFor(tenant: TenantContext, builder: BuilderService): RepairRunner {
  return async ({ userId, projectId, runId, prompt, guard, signal }) => {
    const context = requireTenantContext(tenant);
    if (userId !== context.userId) throw new BuilderError('not_found', 'Project not found.');
    const binding = await builder.beginRun(userId, projectId, { runId, origin: 'repair', guard });
    try {
      const result = await runBuildPipeline({ runId, userId, tenantContext: context, prompt, builder: binding, signal });
      return { revision: binding.saved(), noChange: binding.noChange(), reason: result.success ? 'The repair run finished.' : 'The repair run did not produce a validated change.' };
    } catch (error) {
      if ((error as { code?: string }).code === 'BUILDER_ENGINE_DISABLED') throw new BuilderError('unsupported', 'The canonical engineering engine is not enabled for this project, so no repair was attempted.');
      throw error;
    }
  };
}

export interface Phase2Services {
  readonly builder: BuilderService;
  readonly qa: QaService;
  readonly github: GitHubExportService;
  readonly exporter: ExportService;
}

export function phase2ServicesFor(tenant: TenantContext): Phase2Services {
  const context = requireTenantContext(tenant);
  const store = new SupabaseBuilderStore(context);
  const phase2 = new SupabasePhase2Store(context, store);
  const builder = new BuilderService({ store, runBuild: canonicalBuildRunner, preview: canonicalPreviewPort });
  const qa = new QaService({
    builder, store, phase2, target: canonicalQaTarget(), repair: repairRunnerFor(context, builder), budgetAllows: (userId) => budgetAllowsRepair(userId),
    openDriver: (baseUrl) => openPlaywrightQaDriver({ baseUrl }),
  });
  const github = new GitHubExportService({ phase2, builder, github: createRestGitHubPort(ghFetch), tokenFor: (userId) => getGitHubToken(userId) });
  return { builder, qa, github, exporter: new ExportService({ builder, phase2 }) };
}
