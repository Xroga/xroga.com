import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { APPROVAL_TTL_MS } from '../operations.js';
import { InMemoryPhase2Store } from '../phase2Store.js';
import { BuilderService } from '../service.js';
import { InMemoryBuilderStore } from '../store.js';
import { BuilderError, type ExternalOperation } from '../types.js';
import { FakeVercel } from './fakeVercel.testsupport.js';
import { HostingService, type HttpProbeResult, type PreviewPlan, type PromotionPlan, type RemoteVerification } from './service.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SAAS = 'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh. Different users must not see each other tasks.';
const TEAM = { id: 'team_abcdefgh1234', slug: 'acme', name: 'Acme' };
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const serviceRoleJwt = `${b64({ alg: 'HS256' })}.${b64({ role: 'service_role' })}.sig`;

interface Harness {
  vercel: FakeVercel;
  service: HostingService;
  builder: BuilderService;
  phase2: InMemoryPhase2Store;
  projectId: string;
  clock: { now: Date };
  tokens: Map<string, string | null>;
  state: { env: Record<string, string> | null; remote: RemoteVerification; probes: Record<string, HttpProbeResult>; protectAll: boolean; githubCommit: string | null; remoteCalls: number; probeUrls: string[] };
}

const PASS: RemoteVerification = { status: 'passed', executedChecks: 8, failedChecks: 0, reason: 'All 8 executed check(s) passed.' };
const OK: HttpProbeResult = { status: 200, bytes: 500, protectedBySso: false, errorMarker: null };

async function harness(): Promise<Harness> {
  const vercel = new FakeVercel();
  vercel.addAccount('tok-owner', { id: 'user_owner', username: 'alice' }, [TEAM]);
  vercel.addAccount('tok-other', { id: 'user_other', username: 'bob' });
  const store = new InMemoryBuilderStore();
  const phase2 = new InMemoryPhase2Store(store);
  const builder = new BuilderService({ store, runBuild: async () => null });
  const clock = { now: new Date('2026-10-26T12:00:00Z') };
  const tokens = new Map<string, string | null>([[OWNER, 'tok-owner'], [OTHER, 'tok-other']]);
  const state: Harness['state'] = {
    env: { NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghij1234567890.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_ok' }, remote: PASS, probes: {}, protectAll: false, githubCommit: 'c'.repeat(40), remoteCalls: 0, probeUrls: [],
  };
  const service = new HostingService({
    phase2, builder, vercel, now: () => clock.now, sleep: async () => {}, pollIntervalMs: 1, maxPolls: 10,
    tokenFor: async (userId) => tokens.get(userId) ?? null,
    appEnvironment: async () => state.env,
    filesFor: (_project, revision) => [...revision.files],
    githubCommitFor: async () => state.githubCommit,
    remoteQa: async () => { state.remoteCalls++; return state.remote; },
    probe: async (url) => { state.probeUrls.push(url); return state.protectAll ? { status: 401, bytes: 200, protectedBySso: true, errorMarker: null } : (state.probes[url] ?? OK); },
  });
  const created = await builder.createProject(OWNER, { prompt: SAAS, requestKey: `host-${Math.random().toString(36).slice(2, 12)}` });
  return { vercel, service, builder, phase2, projectId: created.project.id, clock, tokens, state };
}

const prep = (h: Harness, over: Partial<Parameters<HostingService['preparePreview']>[2]> = {}) =>
  h.service.preparePreview(OWNER, h.projectId, { operationKey: 'prev-key-000001', scopeId: null, projectName: 'acme-tasks', ...over });

async function preview(h: Harness, over: Partial<Parameters<HostingService['preparePreview']>[2]> = {}): Promise<ExternalOperation> {
  const prepared = await prep(h, over);
  await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
  return h.service.executePreview(OWNER, h.projectId, prepared.operation.id);
}

const receiptOf = (operation: ExternalOperation) => operation.receipt as { project: { id: string; gitLinked: boolean }; deployment: { id: string; url: string; target: string }; remote: RemoteVerification; source: { githubCommitSha: string | null; revisionId: string }; environmentNames: string[] };

describe('Vercel preview: preparation', () => {
  let h: Harness;
  beforeEach(async () => { h = await harness(); });

  it('lists only the accounts and teams Vercel says the user can act for', async () => {
    const targets = await h.service.targets(OWNER);
    assert.deepEqual(targets.scopes.map((scope) => scope.slug), ['alice', 'acme']);
    h.tokens.set(OWNER, null);
    assert.equal((await h.service.targets(OWNER)).connected, false);
  });

  it('prepares an exact, preview-only plan and creates nothing yet', async () => {
    const prepared = await prep(h);
    const plan = prepared.plan;
    assert.equal(prepared.operation.status, 'prepared');
    assert.equal(plan.project.mode, 'create');
    assert.equal(plan.scope.kind, 'personal');
    assert.deepEqual(plan.environmentNames, ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL']);
    assert.match(plan.behaviour.join(' '), /PREVIEW\. It is not published to production/);
    assert.match(plan.behaviour.join(' '), /not linked to Git/);
    assert.match(plan.behaviour.join(' '), /No secret key is ever sent/);
    assert.match(plan.costNote, /cannot see your Vercel plan/);
    assert.equal(plan.githubCommitSha, 'c'.repeat(40));
    assert.equal(h.vercel.projects.size, 0);
    assert.ok(!h.vercel.calls.some((call) => call.startsWith('createProject') || call === 'createPreviewDeployment'));
  });

  it('refuses a team or account the connection cannot use (wrong Vercel team) and invalid names', async () => {
    await assert.rejects(prep(h, { scopeId: 'team_notmineabcdef' }), (error) => error instanceof BuilderError && /not available to your connected account/.test(error.message));
    for (const projectName of ['Bad Name', '../x', '-x', 'a'.repeat(120)]) {
      await assert.rejects(prep(h, { projectName }), (error) => error instanceof BuilderError && error.code === 'invalid_input', projectName);
    }
    assert.equal(h.vercel.projects.size, 0);
  });

  it('refuses a project that is linked to Git, because pushes would publish it to production', async () => {
    h.vercel.projects.set('personal/linked-app', { id: 'prj_linked123456', name: 'linked-app', accountId: 'personal', gitLinked: true, framework: 'nextjs' });
    await assert.rejects(prep(h, { projectName: 'linked-app', existingProject: true }), (error) => error instanceof BuilderError && /linked to a Git repository/.test(error.message) && /cannot turn that off/.test(error.message));
    h.vercel.projects.set('personal/plain-app', { id: 'prj_plain1234567', name: 'plain-app', accountId: 'personal', gitLinked: false, framework: null });
    assert.equal((await prep(h, { projectName: 'plain-app', existingProject: true, operationKey: 'prev-key-000002' })).plan.project.mode, 'existing');
    await assert.rejects(prep(h, { projectName: 'missing-app', existingProject: true, operationKey: 'prev-key-000003' }), (error) => error instanceof BuilderError && error.code === 'not_found');
    await assert.rejects(prep(h, { projectName: 'plain-app', operationKey: 'prev-key-000004' }), (error) => error instanceof BuilderError && /already exists/.test(error.message));
  });

  it('refuses to even prepare when the environment would carry a privileged credential', async () => {
    h.state.env = { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: serviceRoleJwt };
    await assert.rejects(prep(h), (error) => error instanceof BuilderError && /privileged credential/.test(error.message));
    h.state.env = { SUPABASE_SERVICE_ROLE_KEY: 'x' };
    await assert.rejects(prep(h, { operationKey: 'prev-key-000005' }), BuilderError);
  });

  it('is idempotent on the operation key and refuses the same key for a different plan', async () => {
    const first = await prep(h);
    assert.equal((await prep(h)).operation.id, first.operation.id);
    await assert.rejects(prep(h, { projectName: 'another-name' }), (error) => error instanceof BuilderError && error.code === 'conflict');
  });
});

describe('Vercel preview: execution', () => {
  let h: Harness;
  beforeEach(async () => { h = await harness(); });

  it('creates an unlinked project, sets preview-only public configuration, deploys the exact revision as a preview and verifies it', async () => {
    const done = await preview(h);
    assert.equal(done.status, 'succeeded');
    const receipt = receiptOf(done);
    assert.equal(receipt.project.gitLinked, false);
    assert.equal(h.vercel.projects.get('personal/acme-tasks')?.gitLinked, false, 'the project Xroga created is not Git-linked');
    // Environment: public pair only, preview target only, never production or development.
    assert.equal(h.vercel.env.length, 1);
    assert.deepEqual(h.vercel.env[0].vars.map((entry) => entry.key).sort(), ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_URL']);
    assert.ok(h.vercel.env[0].vars.every((entry) => entry.target.length === 1 && entry.target[0] === 'preview'));
    assert.ok(!JSON.stringify(h.vercel.env).match(/service_role|sb_secret_/));
    // The deployment is a preview that carries the revision identity.
    const deployment = h.vercel.deployments.get(receipt.deployment.id)!;
    assert.equal(deployment.target, null);
    assert.equal(deployment.readyState, 'READY');
    assert.equal(deployment.meta.xrogaRevision, receipt.source.revisionId);
    assert.equal(deployment.meta.githubCommitSha, 'c'.repeat(40));
    assert.equal(receipt.deployment.target, 'preview');
    assert.equal(receipt.remote.status, 'passed');
    assert.equal(h.state.remoteCalls, 1);
  });

  it('will not run without approval, with a wrong digest, or after the approval expired; a replay makes no provider call', async () => {
    const prepared = await prep(h);
    await assert.rejects(h.service.executePreview(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /explicit approval/.test(error.message));
    await assert.rejects(h.service.approve(OWNER, h.projectId, prepared.operation.id, 'f'.repeat(64)), (error) => error instanceof BuilderError && error.code === 'conflict');
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
    h.clock.now = new Date(h.clock.now.getTime() + APPROVAL_TTL_MS + 1000);
    await assert.rejects(h.service.executePreview(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /expired/.test(error.message));
    assert.equal(h.vercel.projects.size, 0);
    h.clock.now = new Date('2026-10-26T12:00:00Z');
    const done = await preview(h, { operationKey: 'prev-key-000010', projectName: 'second-app' });
    const before = h.vercel.calls.length;
    assert.equal((await h.service.executePreview(OWNER, h.projectId, done.id)).status, 'succeeded');
    assert.equal(h.vercel.calls.length, before);
  });

  it('a build error fails the operation with the build output, and nothing is called verified', async () => {
    h.vercel.failures = { deployment: 'error' };
    const prepared = await prep(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
    await assert.rejects(h.service.executePreview(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /failed to build/.test(error.message) && /left-pad/.test(error.message));
    const failed = await h.phase2.getOperation(OWNER, h.projectId, prepared.operation.id);
    assert.equal(failed?.status, 'failed');
    assert.ok((failed?.receipt as { deployment: { id: string } }).deployment.id, 'the deployment that exists is not hidden');
    assert.equal(h.state.remoteCalls, 0);
  });

  it('a deployment that never finishes is not verified', async () => {
    h.vercel.failures = { deployment: 'never_ready' };
    const prepared = await prep(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
    await assert.rejects(h.service.executePreview(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /still building/.test(error.message));
    assert.equal(h.state.remoteCalls, 0);
  });

  it('refuses a "preview" that Vercel reports as production, or that lost its revision identity', async () => {
    for (const mode of ['target_production', 'wrong_meta'] as const) {
      const fresh = await harness();
      fresh.vercel.failures = { deployment: mode };
      const prepared = await prep(fresh);
      await fresh.service.approve(OWNER, fresh.projectId, prepared.operation.id, prepared.operation.planDigest);
      await assert.rejects(fresh.service.executePreview(OWNER, fresh.projectId, prepared.operation.id), BuilderError, mode);
      assert.equal(fresh.state.remoteCalls, 0, mode);
    }
  });

  it('never deploys into a project that turns out to be Git-linked', async () => {
    h.vercel.failures = { createProject: 'creates_git_linked' };
    const prepared = await prep(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
    await assert.rejects(h.service.executePreview(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /linked to Git/.test(error.message));
    assert.ok(!h.vercel.calls.includes('createPreviewDeployment'));
    assert.equal(h.vercel.env.length, 0);
  });

  it('reconciles a lost project-creation response, and a retry after a lost request creates exactly one project', async () => {
    h.vercel.failures = { createProject: 'timeout_after_create' };
    const done = await preview(h);
    assert.equal(done.status, 'succeeded');
    assert.equal(h.vercel.projects.size, 1);
    const other = await harness();
    other.vercel.failures = { createProject: 'timeout_before_create' };
    const prepared = await prep(other);
    await other.service.approve(OWNER, other.projectId, prepared.operation.id, prepared.operation.planDigest);
    await assert.rejects(other.service.executePreview(OWNER, other.projectId, prepared.operation.id), BuilderError);
    assert.equal((await other.phase2.getOperation(OWNER, other.projectId, prepared.operation.id))?.status, 'ambiguous');
    other.vercel.failures = {};
    await other.service.approve(OWNER, other.projectId, prepared.operation.id, prepared.operation.planDigest);
    assert.equal((await other.service.executePreview(OWNER, other.projectId, prepared.operation.id)).status, 'succeeded');
    assert.equal(other.vercel.projects.size, 1);
  });

  it('does not adopt a project that appeared under that name after approval', async () => {
    const prepared = await prep(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
    h.vercel.projects.set('personal/acme-tasks', { id: 'prj_other123456', name: 'acme-tasks', accountId: 'personal', gitLinked: false, framework: null });
    await assert.rejects(h.service.executePreview(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /was not created by this deployment/.test(error.message));
    assert.ok(!h.vercel.calls.includes('createPreviewDeployment'));
  });

  it('fails safely when the connected account changed or the connection was revoked', async () => {
    const prepared = await prep(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
    h.tokens.set(OWNER, 'tok-other');
    await assert.rejects(h.service.executePreview(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /account changed/.test(error.message));
    const second = await prep(h, { operationKey: 'prev-key-000020', projectName: 'second-app' });
    await h.service.approve(OWNER, h.projectId, second.operation.id, second.operation.planDigest);
    h.tokens.set(OWNER, null);
    await assert.rejects(h.service.executePreview(OWNER, h.projectId, second.operation.id), (error) => error instanceof BuilderError && /no longer connected/.test(error.message));
    assert.equal(h.vercel.projects.size, 0);
  });

  it('reports remote tests as blocked, not passed, when Vercel protection answers instead of the app', async () => {
    const prepared = await prep(h);
    await h.service.approve(OWNER, h.projectId, prepared.operation.id, prepared.operation.planDigest);
    h.state.protectAll = true;
    const done = await h.service.executePreview(OWNER, h.projectId, prepared.operation.id);
    assert.equal(receiptOf(done).remote.status, 'blocked_by_protection');
    assert.equal(h.state.remoteCalls, 0, 'no browser was started against a sign-in page');
  });

  it('keeps tenants apart', async () => {
    const prepared = await prep(h);
    await assert.rejects(h.service.preparePreview(OTHER, h.projectId, { operationKey: 'foreign-key-001', scopeId: null }), (error) => error instanceof BuilderError && error.code === 'not_found');
    await assert.rejects(h.service.approve(OTHER, h.projectId, prepared.operation.id, prepared.operation.planDigest), BuilderError);
    await assert.rejects(h.service.executePreview(OTHER, h.projectId, prepared.operation.id), BuilderError);
    await assert.rejects(h.service.state(OTHER, h.projectId), BuilderError);
    assert.equal(h.vercel.projects.size, 0);
  });
});

describe('Vercel production promotion', () => {
  let h: Harness;
  let previewOp: ExternalOperation;
  beforeEach(async () => {
    h = await harness();
    previewOp = await preview(h);
  });

  const promote = async (over: { confirmation?: string; operationKey?: string } = {}) => {
    const prepared = await h.service.preparePromotion(OWNER, h.projectId, { operationKey: over.operationKey ?? 'prod-key-000001', previewOperationId: previewOp.id });
    const phrase = (prepared.plan as PromotionPlan).confirmationPhrase;
    return { prepared, approve: () => h.service.approvePromotion(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest, confirmation: over.confirmation ?? phrase }) };
  };

  it('is blocked until remote browser tests actually passed on the preview', async () => {
    for (const status of ['blocked_by_protection', 'failed', 'partial', 'pending_runtime'] as const) {
      const fresh = await harness();
      fresh.state.remote = { status, executedChecks: 0, failedChecks: status === 'failed' ? 2 : 0, reason: `state ${status}` };
      const op = await (async () => {
        const prepared = await prep(fresh);
        await fresh.service.approve(OWNER, fresh.projectId, prepared.operation.id, prepared.operation.planDigest);
        return fresh.service.executePreview(OWNER, fresh.projectId, prepared.operation.id);
      })();
      await assert.rejects(fresh.service.preparePromotion(OWNER, fresh.projectId, { operationKey: 'prod-key-000002', previewOperationId: op.id }), (error) => error instanceof BuilderError && /Production is blocked/.test(error.message), status);
    }
  });

  it('needs a successful preview, and refuses another tenant\'s preview', async () => {
    const prepared = await prep(h, { operationKey: 'prev-key-000030', projectName: 'never-run' });
    await assert.rejects(h.service.preparePromotion(OWNER, h.projectId, { operationKey: 'prod-key-000003', previewOperationId: prepared.operation.id }), (error) => error instanceof BuilderError && /successful, verified preview/.test(error.message));
    await assert.rejects(h.service.preparePromotion(OTHER, h.projectId, { operationKey: 'prod-key-000004', previewOperationId: previewOp.id }), (error) => error instanceof BuilderError && error.code === 'not_found');
  });

  it('shows what publishing means, and requires a typed confirmation on top of the digest', async () => {
    const { prepared } = await promote();
    const plan = prepared.plan as PromotionPlan;
    assert.equal(plan.confirmationPhrase, 'publish acme-tasks');
    assert.match(plan.warnings.join(' '), /PUBLIC on the internet/);
    assert.match(plan.warnings.join(' '), /real records in your own database/);
    assert.equal(plan.remoteTests.status, 'passed');
    assert.equal(plan.productionUrl, 'https://acme-tasks.vercel.app');
    await assert.rejects(h.service.approvePromotion(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest, confirmation: 'yes' }), (error) => error instanceof BuilderError && /type exactly: publish acme-tasks/.test(error.message));
    await assert.rejects(h.service.approvePromotion(OWNER, h.projectId, prepared.operation.id, { digest: 'f'.repeat(64), confirmation: plan.confirmationPhrase }), (error) => error instanceof BuilderError && error.code === 'conflict');
    assert.equal(h.vercel.promoted.length, 0);
  });

  it('nothing before the production approval can publish: preparing, approving the preview, or executing unapproved', async () => {
    assert.equal(h.vercel.promoted.length, 0, 'a verified preview is not production');
    const { prepared } = await promote();
    await assert.rejects(h.service.executePromotion(OWNER, h.projectId, prepared.operation.id), (error) => error instanceof BuilderError && /explicit approval/.test(error.message));
    // The preview operation id cannot be used to publish.
    await assert.rejects(h.service.executePromotion(OWNER, h.projectId, previewOp.id), (error) => error instanceof BuilderError && error.code === 'not_found');
    await assert.rejects(h.service.approvePromotion(OWNER, h.projectId, previewOp.id, { digest: previewOp.planDigest, confirmation: 'publish acme-tasks' }), (error) => error instanceof BuilderError && error.code === 'not_found');
    assert.equal(h.vercel.promoted.length, 0);
  });

  it('promotes the verified deployment once, verifies production with read-only requests, and records the receipt', async () => {
    const { approve } = await promote();
    const approved = await approve();
    const done = await h.service.executePromotion(OWNER, h.projectId, approved.id);
    assert.equal(done.status, 'succeeded');
    assert.deepEqual(h.vercel.promoted, [{ projectId: receiptOf(previewOp).project.id, deploymentId: receiptOf(previewOp).deployment.id }]);
    const receipt = done.receipt as { production: { url: string }; verifiedRoutes: Array<{ ok: boolean }>; note: string };
    assert.equal(receipt.production.url, 'https://acme-tasks.vercel.app');
    assert.ok(receipt.verifiedRoutes.length > 0 && receipt.verifiedRoutes.every((route) => route.ok));
    assert.match(receipt.note, /No form was submitted/);
    assert.equal(h.state.remoteCalls, 1, 'the browser tests ran on the preview only, never against the live site');
    assert.ok(h.state.probeUrls.some((url) => url.startsWith('https://acme-tasks.vercel.app')));
    const before = h.vercel.calls.length;
    assert.equal((await h.service.executePromotion(OWNER, h.projectId, done.id)).status, 'succeeded');
    assert.equal(h.vercel.calls.length, before, 'a replay publishes nothing again');
    assert.equal((await h.service.state(OWNER, h.projectId)).latestProduction?.id, done.id);
  });

  it('will not publish if the preview deployment is no longer ready, lost its identity, or the revision changed', async () => {
    const { approve } = await promote();
    const approved = await approve();
    Object.assign(h.vercel.deployments.get(receiptOf(previewOp).deployment.id)!, { meta: {} });
    await assert.rejects(h.service.executePromotion(OWNER, h.projectId, approved.id), (error) => error instanceof BuilderError && /approved revision identity/.test(error.message));
    assert.equal(h.vercel.promoted.length, 0);
  });

  it('reports a promoted deployment whose pages do not respond as NOT verified', async () => {
    h.state.probes['https://acme-tasks.vercel.app'] = { status: 500, bytes: 10, protectedBySso: false, errorMarker: null };
    const { approve } = await promote();
    const approved = await approve();
    await assert.rejects(h.service.executePromotion(OWNER, h.projectId, approved.id), (error) => error instanceof BuilderError && /not marked verified/.test(error.message));
    const failed = await h.phase2.getOperation(OWNER, h.projectId, approved.id);
    assert.equal((failed?.receipt as { promoted: boolean }).promoted, true, 'the fact that it was promoted is not hidden');
  });

  it('a lost promotion response ends ambiguous and a retry is safe', async () => {
    h.vercel.failures = { promote: 'timeout' };
    const { approve, prepared } = await promote();
    const approved = await approve();
    await assert.rejects(h.service.executePromotion(OWNER, h.projectId, approved.id), BuilderError);
    assert.equal((await h.phase2.getOperation(OWNER, h.projectId, prepared.operation.id))?.status, 'ambiguous');
    h.vercel.failures = {};
    await h.service.approvePromotion(OWNER, h.projectId, prepared.operation.id, { digest: prepared.operation.planDigest, confirmation: 'publish acme-tasks' });
    assert.equal((await h.service.executePromotion(OWNER, h.projectId, prepared.operation.id)).status, 'succeeded');
  });

  it('refuses after the account changed or the connection was revoked, and between tenants', async () => {
    const { approve } = await promote();
    const approved = await approve();
    h.tokens.set(OWNER, 'tok-other');
    await assert.rejects(h.service.executePromotion(OWNER, h.projectId, approved.id), (error) => error instanceof BuilderError && /account changed/.test(error.message));
    await assert.rejects(h.service.executePromotion(OTHER, h.projectId, approved.id), BuilderError);
    assert.equal(h.vercel.promoted.length, 0);
  });

  it('a stale approval cannot publish', async () => {
    const { approve } = await promote();
    const approved = await approve();
    h.clock.now = new Date(h.clock.now.getTime() + APPROVAL_TTL_MS + 1000);
    await assert.rejects(h.service.executePromotion(OWNER, h.projectId, approved.id), (error) => error instanceof BuilderError && /expired/.test(error.message));
    assert.equal(h.vercel.promoted.length, 0);
    void (null as unknown as PreviewPlan);
  });
});
