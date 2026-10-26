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
import { getSupabaseOAuthAccessToken } from '../services/integrations/supabaseAuth.js';
import { getVercelToken } from '../services/integrations/vercelAuth.js';
import { createRestSupabasePort } from './data/restPort.js';
import { SupabaseDataService } from './data/service.js';
import { HostingService, type HttpProbeResult, type RemoteVerification } from './hosting/service.js';
import { createRestVercelPort } from './hosting/restPort.js';
import { deliveryByRevision } from './delivery.js';
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

/**
 * Browser QA drives a real Chromium against GENERATED code. In production that must not happen inside the customer-facing API
 * container: generated pages are untrusted. So outside development and tests the in-process browser is off unless an operator
 * deliberately enables it for a deployment that is isolated for that purpose (a dedicated worker), and QA is then honestly
 * reported as not run. XROGA_BUILDER_INPROCESS_QA=1 is that deliberate switch.
 */
export function inProcessQaAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' || env.XROGA_BUILDER_INPROCESS_QA === '1';
}

export function openQaDriver(baseUrl: string, env: NodeJS.ProcessEnv = process.env, open: typeof openPlaywrightQaDriver = openPlaywrightQaDriver) {
  if (!inProcessQaAllowed(env)) {
    return Promise.reject(Object.assign(new Error('Browser tests are not enabled in this environment: they need an isolated browser host, so nothing was tested.'), { code: 'BROWSER_UNAVAILABLE' }));
  }
  return open({ baseUrl });
}

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

/** Starts (or restarts) the isolated preview from the project's latest SAVED version, then checks that its pages respond. */
export interface PreviewControl {
  restart(userId: string, projectId: string): Promise<{ readonly started: boolean; readonly ready: boolean; readonly reason: string; readonly revisionNumber: number }>;
}

export interface Phase2Services {
  readonly builder: BuilderService;
  readonly preview: PreviewControl;
  readonly qa: QaService;
  readonly github: GitHubExportService;
  readonly exporter: ExportService;
  readonly data: SupabaseDataService;
  readonly hosting: HostingService;
  /** What reached each provider for each revision, from verified receipts only. */
  provenance(userId: string, projectId: string): Promise<ReturnType<typeof deliveryByRevision>>;
}

/** Real HTTP check of a deployed URL. Never follows credentials anywhere; reads at most a few KB. */
export async function httpProbe(url: string): Promise<HttpProbeResult> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return { status: null, bytes: 0, protectedBySso: false, errorMarker: 'Only https deployments are probed.' };
    const response = await fetch(parsed, { redirect: 'follow', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'xroga-delivery-check' } });
    const text = (await response.text().catch(() => '')).slice(0, 4000);
    const protectedBySso = response.status === 401 && /vercel[^]{0,400}(authentication|sso|sign)/i.test(text);
    const marker = ['Application error', 'Internal Server Error', 'Unhandled Runtime Error', 'Failed to compile'].find((candidate) => text.includes(candidate)) ?? null;
    return { status: response.status, bytes: text.length, protectedBySso, errorMarker: marker };
  } catch {
    return { status: null, bytes: 0, protectedBySso: false, errorMarker: null };
  }
}

export function phase2ServicesFor(tenant: TenantContext): Phase2Services {
  const context = requireTenantContext(tenant);
  const store = new SupabaseBuilderStore(context);
  const phase2 = new SupabasePhase2Store(context, store);
  const builder = new BuilderService({ store, runBuild: canonicalBuildRunner, preview: canonicalPreviewPort });
  const qa = new QaService({
    builder, store, phase2, target: canonicalQaTarget(), repair: repairRunnerFor(context, builder), budgetAllows: (userId) => budgetAllowsRepair(userId),
    openDriver: (baseUrl) => openQaDriver(baseUrl),
  });
  const preview: PreviewControl = {
    async restart(userId, projectId) {
      const project = await builder.requireProject(userId, projectId);
      const { revision } = await builder.headFiles(userId, project);
      if (!revision) throw new BuilderError('not_found', 'The project has no saved version to preview.');
      // Recreated from the durable source of the head revision, so an expired or destroyed sandbox is recoverable.
      const target = await canonicalQaTarget().ensure({ userId, project, revision });
      if (!target) {
        await store.markPreviewReadiness(userId, projectId, { revisionId: revision.id, ready: false });
        return { started: false, ready: false, reason: 'The isolated runtime could not start this version. Nothing is reported as running.', revisionNumber: revision.revisionNumber };
      }
      const verdict = await canonicalPreviewPort.verify({ userId, projectId, revision });
      await store.markPreviewReadiness(userId, projectId, verdict.strictReady === null ? null : { revisionId: revision.id, ready: verdict.strictReady });
      return { started: true, ready: verdict.strictReady === true, reason: verdict.reason, revisionNumber: revision.revisionNumber };
    },
  };
  const github = new GitHubExportService({ phase2, builder, github: createRestGitHubPort(ghFetch), tokenFor: (userId) => getGitHubToken(userId) });
  const data = new SupabaseDataService({ phase2, builder, supabase: createRestSupabasePort(), tokenFor: (userId) => getSupabaseOAuthAccessToken(userId) });
  const hosting = new HostingService({
    phase2, builder, vercel: createRestVercelPort(), tokenFor: (userId) => getVercelToken(userId),
    appEnvironment: (userId, projectId) => data.appEnvironment(userId, projectId),
    databaseStatus: (userId, projectId) => data.databaseStatus(userId, projectId),
    filesFor: (project, revision) => github.filesFor(project, revision),
    githubCommitFor: async (userId, projectId, revisionId) => (await github.binding(userId, projectId))?.commits.find((commit) => commit.revisionId === revisionId)?.commitSha ?? null,
    remoteQa: async ({ userId, projectId, revision, baseUrl }): Promise<RemoteVerification> => {
      try {
        const report = await qa.runRemote(userId, projectId, { revisionId: revision.id, baseUrl });
        return { status: report.status, executedChecks: report.executedChecks, failedChecks: report.failedChecks, reason: report.reason };
      } catch {
        return { status: 'pending_runtime', executedChecks: 0, failedChecks: 0, reason: 'The remote browser tests could not be run from this environment.' };
      }
    },
    probe: httpProbe,
  });
  const provenance = async (userId: string, projectId: string) => {
    await builder.requireProject(userId, projectId);
    const [github1, supabase, vercel, revisions] = await Promise.all([github.operations(userId, projectId), data.operations(userId, projectId), hosting.operations(userId, projectId), builder.history(userId, projectId)]);
    return deliveryByRevision([...github1, ...supabase, ...vercel], revisions);
  };
  return { builder, preview, qa, github, exporter: new ExportService({ builder, phase2 }), data, hosting, provenance };
}
