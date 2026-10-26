import type { ProjectFile } from '../../ai/patches.js';
import { assertNoPrivilegedEnv } from '../data/env.js';
import { markerFor, OperationRunner, type OperationDeps } from '../operations.js';
import { routesFromFiles } from '../readiness.js';
import { BuilderError, type BuilderProject, type BuilderRevision, type ExternalOperation } from '../types.js';
import { VERCEL_PROJECT_NAME, VercelPortError, type VercelDeployment, type VercelPort, type VercelProject, type VercelScope, type VercelViewer } from './port.js';

/**
 * Customer-owned Vercel: an approved PREVIEW of the exact verified revision, remote browser tests
 * against that real deployment, and a SEPARATE explicitly approved promotion to production.
 *
 * Release control by construction (see port.ts): projects are never Git-linked, deployments are
 * explicit, previews are deployed with no target, and production is reached only by promoting a
 * preview that was built from the approved revision and passed remote tests. Nothing here can
 * publish to production as a side effect of preparing, previewing, approving a preview or pushing.
 */

export interface RemoteVerification {
  readonly status: 'passed' | 'failed' | 'partial' | 'pending_runtime' | 'blocked_by_protection';
  readonly executedChecks: number;
  readonly failedChecks: number;
  readonly reason: string;
}

export interface HttpProbeResult {
  readonly status: number | null;
  readonly bytes: number;
  /** True when Vercel Deployment Protection answered instead of the app. */
  readonly protectedBySso: boolean;
  readonly errorMarker: string | null;
}

export interface HostingDeps extends OperationDeps {
  readonly vercel: VercelPort;
  /** The connected user's Vercel token from the existing vault, or null when none or revoked. */
  readonly tokenFor: (userId: string) => Promise<string | null>;
  /** Public Supabase configuration for the app, or null when no customer database is bound. */
  readonly appEnvironment: (userId: string, projectId: string) => Promise<Record<string, string> | null>;
  /** The verified source files for a revision (the same set the export and GitHub use). */
  readonly filesFor: (project: BuilderProject, revision: BuilderRevision) => ProjectFile[];
  /** The GitHub commit that holds this revision, when it has been exported. Provenance only. */
  readonly githubCommitFor: (userId: string, projectId: string, revisionId: string) => Promise<string | null>;
  /** Real-browser tests against a deployed URL. Never run with real user data. */
  readonly remoteQa: (input: { userId: string; projectId: string; revision: BuilderRevision; baseUrl: string }) => Promise<RemoteVerification>;
  readonly probe: (url: string) => Promise<HttpProbeResult>;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly pollIntervalMs?: number;
  readonly maxPolls?: number;
}

export interface PreviewPlan extends Record<string, unknown> {
  readonly provider: 'vercel';
  readonly action: 'deploy_preview';
  readonly viewer: { readonly id: string; readonly username: string };
  readonly scope: VercelScope;
  readonly project: { readonly name: string; readonly mode: 'create' | 'existing' };
  readonly revision: { readonly id: string; readonly number: number; readonly contentSha256: string; readonly fileCount: number };
  readonly githubCommitSha: string | null;
  readonly framework: string | null;
  readonly environmentNames: readonly string[];
  readonly behaviour: readonly string[];
  readonly warnings: readonly string[];
  readonly costNote: string;
}

export interface PromotionPlan extends Record<string, unknown> {
  readonly provider: 'vercel';
  readonly action: 'promote_production';
  readonly viewer: { readonly id: string; readonly username: string };
  readonly scope: VercelScope;
  readonly previewOperationId: string;
  readonly deploymentId: string;
  readonly vercelProjectId: string;
  readonly projectName: string;
  readonly revision: { readonly id: string; readonly number: number; readonly contentSha256: string };
  readonly previewUrl: string;
  readonly productionUrl: string;
  readonly remoteTests: RemoteVerification;
  readonly confirmationPhrase: string;
  readonly warnings: readonly string[];
  readonly costNote: string;
}

const COST_NOTE = 'Deployments run in your Vercel account and are billed (if at all) by Vercel under that account or team. Xroga cannot see your Vercel plan, so it cannot promise this is free.';
const PROJECT_NAME_SLUG = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'xroga-app';
const DEFAULT_POLL_MS = 3_000;
const DEFAULT_MAX_POLLS = 200;

const frameworkOf = (files: readonly ProjectFile[]): string | null => {
  const manifest = files.find((file) => file.path === 'package.json');
  if (!manifest) return null;
  try {
    const parsed = JSON.parse(manifest.content) as { dependencies?: Record<string, string> };
    return parsed.dependencies?.next ? 'nextjs' : null;
  } catch {
    return null;
  }
};

export class HostingService {
  private readonly ops: OperationRunner;

  constructor(private readonly deps: HostingDeps) {
    this.ops = new OperationRunner(deps);
  }

  private async connection(userId: string): Promise<{ token: string; viewer: VercelViewer } | null> {
    const token = await this.deps.tokenFor(userId);
    if (!token) return null;
    try {
      return { token, viewer: await this.deps.vercel.viewer(token) };
    } catch (error) {
      if (error instanceof VercelPortError && error.code === 'unauthorized') return null;
      throw error;
    }
  }

  async targets(userId: string): Promise<{ connected: boolean; viewer: { id: string; username: string } | null; scopes: VercelScope[]; notes: string[] }> {
    const connection = await this.connection(userId);
    if (!connection) return { connected: false, viewer: null, scopes: [], notes: ['Vercel is not connected, or the connection was revoked. Connect Vercel in Xroga to host your app.'] };
    return { connected: true, viewer: connection.viewer, scopes: await this.deps.vercel.scopes(connection.token, connection.viewer), notes: [] };
  }

  private async head(userId: string, projectId: string, revisionId?: string): Promise<{ project: BuilderProject; revision: BuilderRevision }> {
    const project = await this.deps.builder.requireProject(userId, projectId);
    const revision = revisionId ? await this.deps.builder.revisionFiles(userId, projectId, revisionId) : (await this.deps.builder.headFiles(userId, project)).revision;
    if (!revision) throw new BuilderError('not_found', 'The project has no source revision to deploy.');
    return { project, revision };
  }

  async preparePreview(userId: string, projectId: string, input: { operationKey: string; scopeId: string | null; projectName?: string; existingProject?: boolean; revisionId?: string }) {
    const { project, revision } = await this.head(userId, projectId, input.revisionId);
    const files = this.deps.filesFor(project, revision); // proves the source is exportable and secret-free
    const connection = await this.connection(userId);
    if (!connection) throw new BuilderError('conflict', 'Vercel is not connected. Connect your Vercel account first.');
    // The scope must be an account or team the connected user can act for, as Vercel reports it.
    const scope = (await this.deps.vercel.scopes(connection.token, connection.viewer)).find((candidate) => candidate.id === input.scopeId);
    if (!scope) throw new BuilderError('invalid_input', 'That Vercel account or team is not available to your connected account.');
    const name = input.projectName ?? `${PROJECT_NAME_SLUG(project.title)}-${markerFor(projectId, input.operationKey).slice(-6)}`;
    if (!VERCEL_PROJECT_NAME.test(name)) throw new BuilderError('invalid_input', 'That Vercel project name is not valid.');
    const mode = input.existingProject ? 'existing' : 'create';
    const existing = await this.deps.vercel.getProject(connection.token, scope, name);
    if (mode === 'create' && existing) throw new BuilderError('conflict', `A Vercel project named "${name}" already exists in that account. Choose another name, or select it as an existing project.`);
    if (mode === 'existing') {
      if (!existing) throw new BuilderError('not_found', `There is no Vercel project named "${name}" in that account.`);
      if (existing.gitLinked) throw new BuilderError('conflict', `"${name}" is linked to a Git repository. Vercel would publish pushes to it straight to production and Xroga cannot turn that off, so Xroga will not deploy to it. Use a project that is not linked to Git, or let Xroga create one.`);
    }
    const environment = await this.deps.appEnvironment(userId, projectId);
    if (environment) assertNoPrivilegedEnv(environment);
    const githubCommitSha = await this.deps.githubCommitFor(userId, projectId, revision.id);
    const plan: PreviewPlan = {
      provider: 'vercel', action: 'deploy_preview', viewer: connection.viewer, scope, project: { name, mode }, revision: { id: revision.id, number: revision.revisionNumber, contentSha256: revision.contentSha256, fileCount: files.length },
      githubCommitSha, framework: frameworkOf(files), environmentNames: Object.keys(environment ?? {}).sort(),
      behaviour: [
        'Deploys this exact version as a PREVIEW. It is not published to production.',
        'The project is not linked to Git, so pushing code to GitHub can never publish it.',
        'Only your database\'s public address and public key are sent, and only to previews. No secret key is ever sent.',
      ],
      warnings: [...(environment ? [] : ['No customer database is selected, so the preview has no database configuration.']), 'Vercel may protect previews with sign-in. If so, the remote browser tests cannot run and production stays blocked until they pass.'],
      costNote: COST_NOTE,
    };
    return { ...(await this.ops.prepare(userId, projectId, { provider: 'vercel', action: 'deploy_preview', operationKey: input.operationKey, revisionId: revision.id, plan })), plan };
  }

  approve(userId: string, projectId: string, operationId: string, digest: string) {
    return this.ops.approve(userId, projectId, operationId, { digest });
  }

  cancel(userId: string, projectId: string, operationId: string) {
    return this.ops.cancel(userId, projectId, operationId);
  }

  operations(userId: string, projectId: string) {
    return this.ops.list(userId, projectId, 'vercel');
  }

  /** The latest verified preview and production state, for display and provenance. */
  async state(userId: string, projectId: string) {
    const operations = await this.ops.succeeded(userId, projectId, 'vercel');
    const previews = operations.filter((operation) => operation.action === 'deploy_preview');
    const productions = operations.filter((operation) => operation.action === 'promote_production');
    return { latestPreview: previews[previews.length - 1] ?? null, latestProduction: productions[productions.length - 1] ?? null };
  }

  private async poll(token: string, scope: VercelScope, deploymentId: string): Promise<{ deployment: VercelDeployment; timedOut: boolean }> {
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const interval = this.deps.pollIntervalMs ?? DEFAULT_POLL_MS;
    const limit = this.deps.maxPolls ?? DEFAULT_MAX_POLLS;
    let deployment = await this.deps.vercel.getDeployment(token, scope, deploymentId);
    for (let attempt = 0; attempt < limit && !['READY', 'ERROR', 'CANCELED', 'DELETED'].includes(deployment.readyState); attempt++) {
      await sleep(interval);
      deployment = await this.deps.vercel.getDeployment(token, scope, deploymentId);
    }
    return { deployment, timedOut: !['READY', 'ERROR', 'CANCELED', 'DELETED'].includes(deployment.readyState) };
  }

  async executePreview(userId: string, projectId: string, operationId: string): Promise<ExternalOperation> {
    const { operation, replay } = await this.ops.claim(userId, projectId, operationId, { provider: 'vercel', action: 'deploy_preview' });
    if (replay) return operation;
    const plan = operation.plan as PreviewPlan;
    const fail = (status: 'failed' | 'ambiguous', message: string, receipt?: Record<string, unknown>) => this.ops.fail(userId, projectId, operationId, status, message, receipt);
    let connection: { token: string; viewer: VercelViewer } | null;
    try {
      connection = await this.connection(userId);
    } catch {
      return fail('failed', 'Vercel could not be reached. Nothing was changed.');
    }
    if (!connection) return fail('failed', 'Vercel is no longer connected. Nothing was changed.');
    const { token, viewer } = connection;
    if (viewer.id !== plan.viewer.id) return fail('failed', 'The connected Vercel account changed since this was approved. Nothing was changed.');
    let partial: Record<string, unknown> = {};
    try {
      const scope = (await this.deps.vercel.scopes(token, viewer)).find((candidate) => candidate.id === plan.scope.id && candidate.slug === plan.scope.slug);
      if (!scope) return await fail('failed', 'That Vercel account or team is no longer available to your connected account. Nothing was changed.');
      const { project, revision } = await this.head(userId, projectId, plan.revision.id);
      if (revision.contentSha256 !== plan.revision.contentSha256) return await fail('failed', 'The revision no longer matches the approved plan. Nothing was changed.');
      const files = this.deps.filesFor(project, revision);

      let vercelProject: VercelProject | null = await this.deps.vercel.getProject(token, scope, plan.project.name);
      if (plan.project.mode === 'create') {
        if (vercelProject) return await fail('failed', `A Vercel project named "${plan.project.name}" already exists and was not created by this deployment. Nothing was changed.`);
        try {
          vercelProject = await this.deps.vercel.createProject(token, scope, { name: plan.project.name, framework: plan.framework });
        } catch (error) {
          if (error instanceof VercelPortError && error.ambiguous) {
            // We checked moments ago that it did not exist, so a project that exists now was created by this request.
            vercelProject = await this.deps.vercel.getProject(token, scope, plan.project.name).catch(() => null);
            if (!vercelProject) return await fail('ambiguous', 'Vercel did not confirm whether the project was created. Check your Vercel account, then retry.');
          } else throw error;
        }
      }
      if (!vercelProject) return await fail('failed', 'The Vercel project could not be found. Nothing was changed.');
      if (vercelProject.gitLinked) return await fail('failed', 'The Vercel project is linked to Git, so Xroga cannot guarantee a push will not publish it. Nothing was deployed.', { project: { id: vercelProject.id, name: vercelProject.name } });
      partial = { project: { id: vercelProject.id, name: vercelProject.name, gitLinked: false } };

      const environment = await this.deps.appEnvironment(userId, projectId);
      if (environment) {
        assertNoPrivilegedEnv(environment);
        await this.deps.vercel.setEnv(token, scope, vercelProject.id, Object.entries(environment).map(([key, value]) => ({ key, value, target: ['preview'] as const, type: 'encrypted' as const })));
      }

      const meta = { xrogaProject: projectId, xrogaRevision: revision.id, xrogaContentSha256: revision.contentSha256, ...(plan.githubCommitSha ? { githubCommitSha: plan.githubCommitSha } : {}) };
      let deployment = await this.deps.vercel.createPreviewDeployment(token, scope, { projectName: plan.project.name, files, framework: plan.framework, meta });
      partial = { ...partial, deployment: { id: deployment.id, url: `https://${deployment.url}` } };
      const waited = await this.poll(token, scope, deployment.id);
      deployment = waited.deployment;
      if (waited.timedOut) return await fail('failed', 'The deployment was still building when Xroga stopped waiting. It was not verified. Check Vercel, then retry.', { ...partial, lastState: deployment.readyState });
      if (deployment.readyState !== 'READY') {
        const tail = await this.deps.vercel.buildLogTail(token, scope, deployment.id).catch(() => '');
        return await fail('failed', `The deployment ${deployment.readyState === 'ERROR' ? 'failed to build' : 'did not finish'}.${tail ? ` Last build output: ${tail.slice(-400)}` : ''}`, { ...partial, state: deployment.readyState });
      }
      if (deployment.target === 'production') return await fail('failed', 'Vercel reports this deployment as PRODUCTION, which a preview must never be. It was not verified.', partial);
      if (deployment.meta.xrogaRevision !== revision.id || deployment.meta.xrogaContentSha256 !== revision.contentSha256) {
        return await fail('failed', 'The deployment does not carry the approved revision identity, so it cannot be treated as that revision.', partial);
      }

      const url = `https://${deployment.url}`;
      const probe = await this.deps.probe(url);
      let remote: RemoteVerification;
      if (probe.protectedBySso) {
        remote = { status: 'blocked_by_protection', executedChecks: 0, failedChecks: 0, reason: 'Vercel Deployment Protection answered with a sign-in page, so the browser tests could not reach the app. Nothing was tested.' };
      } else if (probe.status === null || probe.status >= 500) {
        remote = { status: 'failed', executedChecks: 0, failedChecks: 1, reason: `The deployment answered ${probe.status === null ? 'nothing' : `HTTP ${probe.status}`}.` };
      } else {
        remote = await this.deps.remoteQa({ userId, projectId, revision, baseUrl: url });
      }
      return await this.ops.succeed(userId, projectId, operationId, {
        scope: { kind: scope.kind, id: scope.id, slug: scope.slug }, project: { id: vercelProject.id, name: vercelProject.name, gitLinked: false },
        deployment: { id: deployment.id, url, target: deployment.target ?? 'preview', readyState: deployment.readyState },
        source: { revisionId: revision.id, revisionNumber: revision.revisionNumber, contentSha256: revision.contentSha256, githubCommitSha: plan.githubCommitSha },
        environmentNames: plan.environmentNames, http: { status: probe.status, protectedBySso: probe.protectedBySso }, remote, verifiedAt: this.ops.now().toISOString(),
      });
    } catch (error) {
      if (error instanceof BuilderError) throw error;
      if (error instanceof VercelPortError) return fail(error.ambiguous ? 'ambiguous' : 'failed', error.message, partial);
      return fail('failed', 'The Vercel preview stopped unexpectedly. Nothing further was changed.', partial);
    }
  }

  /** Production is blocked until a preview of the same revision passed real remote browser tests. */
  async preparePromotion(userId: string, projectId: string, input: { operationKey: string; previewOperationId: string }) {
    const preview = await this.ops.require(userId, projectId, input.previewOperationId);
    if (preview.provider !== 'vercel' || preview.action !== 'deploy_preview' || preview.status !== 'succeeded' || !preview.receipt) {
      throw new BuilderError('conflict', 'Production needs a successful, verified preview first.');
    }
    const receipt = preview.receipt as { project: { id: string; name: string }; deployment: { id: string; url: string; target: string }; source: { revisionId: string; revisionNumber: number; contentSha256: string }; remote: RemoteVerification };
    if (receipt.remote.status !== 'passed') {
      throw new BuilderError('conflict', `Production is blocked: the remote browser tests on this preview have not passed (${receipt.remote.status.replace(/_/g, ' ')}). ${receipt.remote.reason}`);
    }
    if (receipt.deployment.target === 'production') throw new BuilderError('conflict', 'This deployment is already in production.');
    const { project, revision } = await this.head(userId, projectId, receipt.source.revisionId);
    void project;
    if (revision.contentSha256 !== receipt.source.contentSha256) throw new BuilderError('conflict', 'The revision changed since this preview was built.');
    const connection = await this.connection(userId);
    if (!connection) throw new BuilderError('conflict', 'Vercel is not connected. Reconnect it first.');
    const previewPlan = preview.plan as PreviewPlan;
    const plan: PromotionPlan = {
      provider: 'vercel', action: 'promote_production', viewer: connection.viewer, scope: previewPlan.scope, previewOperationId: preview.id, deploymentId: receipt.deployment.id, vercelProjectId: receipt.project.id,
      projectName: receipt.project.name, revision: { id: revision.id, number: revision.revisionNumber, contentSha256: revision.contentSha256 }, previewUrl: receipt.deployment.url,
      productionUrl: `https://${receipt.project.name}.vercel.app`, remoteTests: receipt.remote, confirmationPhrase: `publish ${receipt.project.name}`,
      warnings: [
        'This makes your app PUBLIC on the internet at its Vercel production address.',
        'It uses the same public database address as the preview. Real visitors will create real records in your own database.',
        'Xroga does not set up custom domains or email. Only the Vercel-provided address is used.',
      ],
      costNote: COST_NOTE,
    };
    return { ...(await this.ops.prepare(userId, projectId, { provider: 'vercel', action: 'promote_production', operationKey: input.operationKey, revisionId: revision.id, plan })), plan };
  }

  /** Production approval is its own act: it must quote the digest AND type the confirmation phrase. */
  async approvePromotion(userId: string, projectId: string, operationId: string, input: { digest: string; confirmation: string }): Promise<ExternalOperation> {
    const operation = await this.ops.require(userId, projectId, operationId);
    if (operation.provider !== 'vercel' || operation.action !== 'promote_production') throw new BuilderError('not_found', 'Operation not found.');
    const plan = operation.plan as PromotionPlan;
    if (input.confirmation.trim() !== plan.confirmationPhrase) throw new BuilderError('conflict', `To publish, type exactly: ${plan.confirmationPhrase}`);
    return this.ops.approve(userId, projectId, operationId, { digest: input.digest });
  }

  async executePromotion(userId: string, projectId: string, operationId: string): Promise<ExternalOperation> {
    const { operation, replay } = await this.ops.claim(userId, projectId, operationId, { provider: 'vercel', action: 'promote_production' });
    if (replay) return operation;
    const plan = operation.plan as PromotionPlan;
    const fail = (status: 'failed' | 'ambiguous', message: string, receipt?: Record<string, unknown>) => this.ops.fail(userId, projectId, operationId, status, message, receipt);
    let connection: { token: string; viewer: VercelViewer } | null;
    try {
      connection = await this.connection(userId);
    } catch {
      return fail('failed', 'Vercel could not be reached. Nothing was published.');
    }
    if (!connection) return fail('failed', 'Vercel is no longer connected. Nothing was published.');
    if (connection.viewer.id !== plan.viewer.id) return fail('failed', 'The connected Vercel account changed since this was approved. Nothing was published.');
    try {
      const scope = (await this.deps.vercel.scopes(connection.token, connection.viewer)).find((candidate) => candidate.id === plan.scope.id && candidate.slug === plan.scope.slug);
      if (!scope) return await fail('failed', 'That Vercel account or team is no longer available. Nothing was published.');
      // The preview must still be the exact verified build of the approved revision.
      const preview = await this.ops.require(userId, projectId, plan.previewOperationId);
      if (preview.status !== 'succeeded') return await fail('failed', 'The verified preview is no longer valid. Nothing was published.');
      const deployment = await this.deps.vercel.getDeployment(connection.token, scope, plan.deploymentId);
      if (deployment.readyState !== 'READY' || deployment.projectId !== plan.vercelProjectId) return await fail('failed', 'The preview deployment is no longer ready for this project. Nothing was published.');
      if (deployment.meta.xrogaRevision !== plan.revision.id || deployment.meta.xrogaContentSha256 !== plan.revision.contentSha256) return await fail('failed', 'The deployment does not carry the approved revision identity. Nothing was published.');
      const { revision } = await this.head(userId, projectId, plan.revision.id);
      if (revision.contentSha256 !== plan.revision.contentSha256) return await fail('failed', 'The revision changed since approval. Nothing was published.');

      try {
        await this.deps.vercel.promote(connection.token, scope, plan.vercelProjectId, plan.deploymentId);
      } catch (error) {
        if (error instanceof VercelPortError && error.ambiguous) return await fail('ambiguous', 'Vercel did not confirm the promotion. Check your Vercel project, then retry: promoting the same deployment again is safe.');
        throw error;
      }
      // Verify production with read-only requests: no form is ever submitted to the live site.
      const routes = routesFromFiles(revision.files);
      const results = [] as Array<{ route: string; status: number | null; ok: boolean }>;
      for (const route of routes) {
        const probe = await this.deps.probe(`${plan.productionUrl}${route === '/' ? '' : route}`);
        results.push({ route, status: probe.status, ok: probe.status !== null && probe.status >= 200 && probe.status < 400 && !probe.protectedBySso && !probe.errorMarker });
      }
      const failing = results.filter((result) => !result.ok);
      if (failing.length > 0) {
        return await fail('failed', `Production was promoted but ${failing.length} page(s) did not respond correctly (${failing.map((entry) => `${entry.route}: ${entry.status ?? 'no response'}`).join(', ')}). It is not marked verified.`, { promoted: true, deploymentId: plan.deploymentId, productionUrl: plan.productionUrl, routes: results });
      }
      return await this.ops.succeed(userId, projectId, operationId, {
        production: { url: plan.productionUrl, deploymentId: plan.deploymentId, projectId: plan.vercelProjectId, projectName: plan.projectName },
        source: { revisionId: plan.revision.id, revisionNumber: plan.revision.number, contentSha256: plan.revision.contentSha256 },
        verifiedRoutes: results, verifiedAt: this.ops.now().toISOString(),
        note: 'Verified with read-only requests. No form was submitted to the live site.',
      });
    } catch (error) {
      if (error instanceof BuilderError) throw error;
      if (error instanceof VercelPortError) return fail(error.ambiguous ? 'ambiguous' : 'failed', error.message);
      return fail('failed', 'The promotion stopped unexpectedly. Check your Vercel project.');
    }
  }
}
