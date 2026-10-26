import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProjectFile } from '../ai/patches.js';
import type { UniversalBuildOutcome } from '../synthesis/universalEntrypoint.js';
import { derivePreviewLifecycle, type PreviewFacts } from './previewLifecycle.js';
import { parseReadiness, routesFromFiles, verifyAppReadiness } from './readiness.js';
import { deriveBuildSpec } from './spec.js';
import { BuilderService, type BuildRunner, type PreviewPort } from './service.js';
import { assertSnapshotAcceptable, diffSnapshots, hashSnapshot } from './snapshot.js';
import { STARTER_REGISTRY, materializeStarter, selectStarter } from './starters.js';
import { InMemoryBuilderStore } from './store.js';
import { BuilderError } from './types.js';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';
const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';
const SAAS = 'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh. Different users must not see each other tasks.';

function outcome(over: Partial<UniversalBuildOutcome['result']> & { files: readonly ProjectFile[] }): UniversalBuildOutcome {
  return {
    ran: true,
    result: {
      outcome: 'completed', phaseReached: 'complete', plan: null, securityControls: [], commitSha: null, evidence: [],
      blockers: [], mutationBegan: true, verified: true, reason: 'ok', ...over,
    },
    goalContract: null, buildContract: null,
    routing: { selectedModel: null, fallbacks: [], reason: 'test', excluded: [] },
  } as unknown as UniversalBuildOutcome;
}

/** Fake canonical runner: honours the contract (commit only after validation passes). */
function runner(files: ProjectFile[], over: Partial<UniversalBuildOutcome['result']> = {}): BuildRunner {
  return async ({ commit, existingFiles }) => {
    const merged = [...existingFiles.filter((f) => !files.some((g) => g.path === f.path)), ...files];
    const verified = over.verified ?? true;
    if (verified) await commit({ files: merged, message: 'build' });
    return outcome({ files: merged, ...over });
  };
}

describe('build specification', () => {
  it('derives a static website spec without backend, auth or database', () => {
    const { spec } = deriveBuildSpec(SITE);
    assert.equal(spec.productType, 'website');
    assert.equal(spec.technicalRequirements.requiresAuthentication, false);
    assert.equal(spec.technicalRequirements.requiresDatabase, false);
    assert.ok(spec.acceptanceCriteria.length >= 2);
    assert.ok(spec.pages.some((page) => page.path === '/'));
  });

  it('derives an authenticated, database-backed SaaS spec', () => {
    const { spec } = deriveBuildSpec(SAAS);
    assert.equal(spec.technicalRequirements.requiresAuthentication, true);
    assert.equal(spec.technicalRequirements.requiresDatabase, true);
    assert.equal(spec.technicalRequirements.requiresBackend, true);
    assert.ok(spec.pages.some((page) => page.path === '/login'));
  });

  it('reports unsupported integrations instead of faking them', () => {
    const { spec } = deriveBuildSpec('Build an online store with a cart and Stripe checkout and email notifications for orders.');
    assert.ok(spec.technicalRequirements.requiredIntegrations.includes('payments'));
    assert.ok(spec.unsupported.some((line) => /payment/i.test(line)));
    assert.ok(spec.unsupported.some((line) => /email/i.test(line)));
  });

  it('rejects empty and oversized requests', () => {
    assert.throws(() => deriveBuildSpec('hi'), BuilderError);
    assert.throws(() => deriveBuildSpec('x'.repeat(9_000)), BuilderError);
  });
});

describe('starter selection', () => {
  it('selects the lightweight static starter for a website and records provenance', () => {
    const { spec } = deriveBuildSpec(SITE);
    const selection = selectStarter(spec);
    assert.equal(selection.starter.id, 'xroga-static-site');
    const seed = materializeStarter(selection, { prompt: SITE, title: spec.title });
    assert.ok(seed.files.some((f) => f.path === 'index.html'));
    assert.match(seed.provenance.seedSha256, /^[a-f0-9]{64}$/);
    assert.equal(seed.provenance.seedSha256, hashSnapshot(seed.files));
    assert.equal(seed.provenance.upstream, null);
  });

  it('selects the Next.js starter when auth and a database are required', () => {
    const { spec } = deriveBuildSpec(SAAS);
    const selection = selectStarter(spec);
    assert.equal(selection.starter.id, 'xroga-nextjs-app');
    const seed = materializeStarter(selection, { prompt: SAAS, title: spec.title });
    assert.ok(seed.files.some((f) => f.path === 'package.json'));
  });

  it('never selects or materialises a starter that is not admitted', () => {
    const pending = STARTER_REGISTRY.find((entry) => entry.status === 'admitted_pending_vendoring');
    assert.ok(pending);
    assert.equal(pending.upstream?.revision.length, 40);
    const { spec } = deriveBuildSpec(SAAS);
    assert.notEqual(selectStarter(spec).starter.id, pending.id);
    assert.throws(() => materializeStarter({ starter: pending, reason: 'x' }, { prompt: SAAS, title: 't' }), /not admitted/);
  });

  it('refuses unsupported product types instead of producing a website', () => {
    const { spec } = deriveBuildSpec('Build a native iOS and Android mobile app for tracking workouts.');
    assert.throws(() => selectStarter(spec), (error) => error instanceof BuilderError && error.code === 'unsupported');
  });
});

describe('source snapshots', () => {
  it('hashes independent of file order', () => {
    const a = [{ path: 'a.txt', content: '1' }, { path: 'b.txt', content: '2' }];
    assert.equal(hashSnapshot(a), hashSnapshot([...a].reverse()));
    assert.notEqual(hashSnapshot(a), hashSnapshot([{ path: 'a.txt', content: '1' }, { path: 'b.txt', content: '3' }]));
  });

  it('rejects traversal, git internals, duplicate paths, credential files and credential content', () => {
    for (const path of ['../x', '/abs', 'a/../b', '.git/config', 'a\\b', 'a//b']) {
      assert.throws(() => assertSnapshotAcceptable([{ path, content: 'x' }]), BuilderError, path);
    }
    assert.throws(() => assertSnapshotAcceptable([{ path: 'a', content: '1' }, { path: 'a', content: '2' }]), /Duplicate/);
    assert.throws(() => assertSnapshotAcceptable([{ path: '.env', content: 'A=b' }]), /credential/);
    assert.throws(() => assertSnapshotAcceptable([{ path: 'src/k.ts', content: `const t='${'ghp_'}${'a'.repeat(36)}'` }]), /credential/);
    assert.throws(() => assertSnapshotAcceptable([]), BuilderError);
    assert.doesNotThrow(() => assertSnapshotAcceptable([{ path: '.env.example', content: 'SUPABASE_URL=' }]));
  });

  it('summarises created, modified and deleted paths', () => {
    const diff = diffSnapshots([{ path: 'a', content: '1' }, { path: 'b', content: '1' }], [{ path: 'a', content: '2' }, { path: 'c', content: '1' }]);
    assert.deepEqual(diff, { created: ['c'], modified: ['a'], deleted: ['b'] });
  });
});

describe('durable project store', () => {
  const files = [{ path: 'index.html', content: '<h1>x</h1>' }];

  it('creates one project per (owner, request key)', async () => {
    const service = new BuilderService({ store: new InMemoryBuilderStore(), runBuild: runner([]) });
    const first = await service.createProject(OWNER_A, { prompt: SITE, requestKey: 'req-key-0001' });
    const retry = await service.createProject(OWNER_A, { prompt: SITE, requestKey: 'req-key-0001' });
    assert.equal(first.created, true);
    assert.equal(retry.created, false);
    assert.equal(retry.project.id, first.project.id);
    assert.equal(retry.project.currentRevisionNumber, 1, 'retry must not duplicate the starter revision');
    const other = await service.createProject(OWNER_B, { prompt: SITE, requestKey: 'req-key-0001' });
    assert.notEqual(other.project.id, first.project.id, 'the same key for another owner is a different project');
  });

  it('recovers a project whose starter revision was never saved', async () => {
    const store = new InMemoryBuilderStore();
    const service = new BuilderService({ store, runBuild: runner([]) });
    const { spec } = deriveBuildSpec(SITE);
    const seed = materializeStarter(selectStarter(spec), { prompt: SITE, title: spec.title });
    await store.createProject(OWNER_A, { requestKey: 'req-key-crash', title: spec.title, spec, starter: seed.provenance });
    const recovered = await service.createProject(OWNER_A, { prompt: SITE, requestKey: 'req-key-crash' });
    assert.equal(recovered.created, false);
    assert.equal(recovered.project.currentRevisionNumber, 1);
    assert.equal(recovered.project.state, 'specified');
  });

  it('denies every cross-tenant read, write and revision access', async () => {
    const store = new InMemoryBuilderStore();
    const service = new BuilderService({ store, runBuild: runner([]) });
    const { project } = await service.createProject(OWNER_A, { prompt: SITE, requestKey: 'req-key-0002' });
    await assert.rejects(service.getState(OWNER_B, project.id), (e) => e instanceof BuilderError && e.code === 'not_found');
    await assert.rejects(service.history(OWNER_B, project.id), BuilderError);
    await assert.rejects(service.generate(OWNER_B, project.id, {}), BuilderError);
    assert.equal(await store.getProject(OWNER_B, project.id), null);
    assert.equal(await store.appendRevision(OWNER_B, project.id, { runId: 'r', origin: 'generation', files, expectedParentId: project.currentRevisionId }), null);
    assert.equal(await store.setState(OWNER_B, project.id, 'failed', 'x'), null);
    assert.equal((await store.listProjects(OWNER_B)).length, 0);
    const head = project.currentRevisionId as string;
    await assert.rejects(service.revisionFiles(OWNER_B, project.id, head), BuilderError);
  });

  it('replays an identical (run, content) append and flags a stale parent as a conflict', async () => {
    const store = new InMemoryBuilderStore();
    const service = new BuilderService({ store, runBuild: runner([]) });
    const { project } = await service.createProject(OWNER_A, { prompt: SITE, requestKey: 'req-key-0003' });
    const base = project.currentRevisionId;
    const a = await store.appendRevision(OWNER_A, project.id, { runId: 'run-1', origin: 'generation', files, expectedParentId: base });
    const replay = await store.appendRevision(OWNER_A, project.id, { runId: 'run-1', origin: 'generation', files, expectedParentId: base });
    assert.equal(a?.kind, 'created');
    assert.equal(replay?.kind, 'replayed');
    const stale = await store.appendRevision(OWNER_A, project.id, { runId: 'run-2', origin: 'followup', files: [{ path: 'a', content: 'b' }], expectedParentId: base });
    assert.equal(stale?.kind, 'conflict');
    assert.equal((await store.listRevisions(OWNER_A, project.id)).length, 2);
  });
});

describe('build generation', () => {
  async function setup(run: BuildRunner, preview?: PreviewPort) {
    const store = new InMemoryBuilderStore();
    const service = new BuilderService({ store, runBuild: run, preview });
    const { project } = await service.createProject(OWNER_A, { prompt: SITE, requestKey: 'req-key-gen-1' });
    return { store, service, project };
  }
  const readyPreview = (ready: boolean | null, started = true): PreviewPort => ({
    launch: async () => ({ started, strictReady: ready, reason: ready ? 'All 1 route(s) responded successfully.' : 'not ready' }),
    verify: async () => ({ started: true, strictReady: ready, reason: ready ? 'ok' : 'not ready' }),
    facts: async () => ({ requested: true, coordinatorStatus: 'ready', runtimeRunning: true, processRunning: true, strictReady: ready, grantExpiresAt: null, grantRevokedAt: null, workspaceSha256: null }),
  });

  it('saves a durable verified revision and reports VERIFIED only after strict readiness', async () => {
    const { service, project, store } = await setup(runner([{ path: 'index.html', content: '<h1>built</h1>' }]), readyPreview(true));
    const state = await service.generate(OWNER_A, project.id, { prompt: 'improve it' });
    assert.equal(state.project.state, 'verified');
    assert.equal(state.project.currentRevisionNumber, 2);
    const revisions = await store.listRevisions(OWNER_A, project.id);
    assert.equal(revisions[0].verificationStatus, 'verified');
    assert.equal(revisions[0].origin, 'generation');
    assert.ok(revisions[0].changeSummary.modified.includes('index.html') || revisions[0].changeSummary.created.includes('index.html'));
  });

  it('is PARTIAL, not verified, when the preview is not strictly ready', async () => {
    const { service, project } = await setup(runner([{ path: 'index.html', content: '<h1>b</h1>' }]), readyPreview(false));
    const state = await service.generate(OWNER_A, project.id, {});
    assert.equal(state.project.state, 'partial');
    assert.match(state.project.stateReason, /not verified/);
  });

  it('is PARTIAL and says so when no preview runtime is available', async () => {
    const { service, project } = await setup(runner([{ path: 'index.html', content: '<h1>b</h1>' }]));
    const state = await service.generate(OWNER_A, project.id, {});
    assert.equal(state.project.state, 'partial');
  });

  it('is BLOCKED when the canonical engine is not enabled and saves nothing', async () => {
    const { service, project } = await setup(async () => null);
    const state = await service.generate(OWNER_A, project.id, {});
    assert.equal(state.project.state, 'blocked');
    assert.equal(state.project.currentRevisionNumber, 1);
  });

  it('keeps unverified work product marked failed and never reports verified', async () => {
    const { service, project, store } = await setup(runner([{ path: 'index.html', content: '<h1>broken</h1>' }], { verified: false, outcome: 'failed', reason: 'validation failed' }), readyPreview(true));
    const state = await service.generate(OWNER_A, project.id, {});
    assert.equal(state.project.state, 'partial');
    assert.match(state.project.stateReason, /validation failed/);
    const revisions = await store.listRevisions(OWNER_A, project.id);
    assert.equal(revisions[0].verificationStatus, 'failed');
    assert.equal(state.project.currentRevisionNumber, 2, 'source survives even when the build did not verify');
  });

  it('a thrown runner error fails the run truthfully', async () => {
    const { service, project } = await setup(async () => { throw new Error('boom secret-detail'); });
    const state = await service.generate(OWNER_A, project.id, {});
    assert.equal(state.project.state, 'failed');
    assert.doesNotMatch(state.project.stateReason, /secret-detail/);
  });

  it('refuses a second concurrent build and never overwrites a newer head', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slow: BuildRunner = async (input) => { await gate; return runner([{ path: 'a.txt', content: '1' }])(input); };
    const { service, project } = await setup(slow, readyPreview(true));
    const first = service.generate(OWNER_A, project.id, {});
    await new Promise((resolve) => setTimeout(resolve, 5));
    await assert.rejects(service.generate(OWNER_A, project.id, {}), (e) => e instanceof BuilderError && e.code === 'conflict');
    release();
    assert.equal((await first).project.state, 'verified');
  });

  it('follow-up changes extend the same project and keep earlier revisions readable', async () => {
    const { service, project } = await setup(runner([{ path: 'index.html', content: '<h1>v2</h1>' }]), readyPreview(true));
    await service.generate(OWNER_A, project.id, {});
    const second = await service.generate(OWNER_A, project.id, { prompt: 'add a search field and dark mode' });
    assert.equal(second.project.id, project.id);
    assert.equal(second.project.currentRevisionNumber, 3);
    const history = await service.history(OWNER_A, project.id);
    assert.deepEqual(history.map((r) => r.revisionNumber), [3, 2, 1]);
    assert.equal(history[0].origin, 'followup');
    const first = await service.revisionFiles(OWNER_A, project.id, history[2].id);
    assert.ok(first.files.length > 0);
  });
});

describe('readiness verification', () => {
  const ok = (path: string, text = '<html>ok</html>') => ({ path, status: 200, bytes: text.length, text });

  it('derives only concrete routes from the project', () => {
    const files = ['app/page.tsx', 'app/login/page.tsx', 'app/(auth)/signup/page.tsx', 'app/tasks/[id]/page.tsx', 'app/api/x/route.ts', 'node_modules/a/page.tsx'].map((path) => ({ path, content: '' }));
    assert.deepEqual(routesFromFiles(files), ['/', '/login', '/signup']);
    assert.deepEqual(routesFromFiles([{ path: 'index.html', content: '' }, { path: 'about.html', content: '' }]), ['/', '/about.html']);
  });

  it('requires 2xx, a body and no error marker on every route', () => {
    const line = (rows: unknown[]) => `noise\nXROGA_READINESS ${JSON.stringify(rows)}\n`;
    assert.ok(parseReadiness(line([ok('/')]), ['/']).every((r) => r.ok));
    assert.equal(parseReadiness(line([{ path: '/', status: 404, bytes: 9, text: 'x' }]), ['/'])[0].ok, false);
    assert.equal(parseReadiness(line([{ path: '/', status: 200, bytes: 0, text: '' }]), ['/'])[0].ok, false);
    assert.match(parseReadiness(line([ok('/', 'Unhandled Runtime Error here')]), ['/'])[0].problem ?? '', /error/);
    assert.equal(parseReadiness('garbage', ['/'])[0].ok, false);
  });

  it('is not ready when any route fails, a probe times out, or exec throws', async () => {
    const files = [{ path: 'app/page.tsx', content: '' }, { path: 'app/a/page.tsx', content: '' }];
    const rows = [ok('/'), { path: '/a', status: 500, bytes: 3, text: 'bad' }];
    const bad = await verifyAppReadiness({ files, exec: async () => ({ exitCode: 0, stdout: `XROGA_READINESS ${JSON.stringify(rows)}`, stderr: '', timedOut: false }) });
    assert.equal(bad.ready, false);
    assert.match(bad.reason, /\/a/);
    assert.equal((await verifyAppReadiness({ files, exec: async () => ({ exitCode: null, stdout: '', stderr: '', timedOut: true }) })).ready, false);
    assert.equal((await verifyAppReadiness({ files, exec: async () => { throw new Error('x'); } })).ready, false);
    const good = await verifyAppReadiness({ files, exec: async () => ({ exitCode: 0, stdout: `XROGA_READINESS ${JSON.stringify([ok('/'), ok('/a')])}`, stderr: '', timedOut: false }) });
    assert.equal(good.ready, true);
  });
});

describe('preview lifecycle', () => {
  const base: PreviewFacts = { requested: true, coordinatorStatus: 'ready', runtimeRunning: true, processRunning: true, strictReady: true, grantExpiresAt: null, grantRevokedAt: null, stale: false };
  const now = new Date('2026-10-26T12:00:00Z');
  const state = (over: Partial<PreviewFacts>) => derivePreviewLifecycle({ ...base, ...over }, now).lifecycle;

  it('maps current evidence onto all seven states', () => {
    assert.equal(state({ requested: false, coordinatorStatus: null }), 'not_started');
    assert.equal(state({ coordinatorStatus: 'not_applicable' }), 'not_started');
    assert.equal(state({ coordinatorStatus: 'starting' }), 'starting');
    assert.equal(state({}), 'ready');
    assert.equal(state({ processRunning: false }), 'degraded');
    assert.equal(state({ strictReady: false }), 'degraded');
    assert.equal(state({ stale: true }), 'degraded');
    assert.equal(state({ runtimeRunning: false }), 'stopped');
    assert.equal(state({ grantRevokedAt: '2026-10-26T11:00:00Z' }), 'stopped');
    assert.equal(state({ grantExpiresAt: '2026-10-26T11:59:59Z' }), 'expired');
    assert.equal(state({ coordinatorStatus: 'failed' }), 'failed');
  });

  it('does not claim ready before strict readiness has run, or after expiry', () => {
    assert.equal(state({ strictReady: null }), 'starting');
    assert.equal(state({ grantExpiresAt: '2026-10-26T13:00:00Z' }), 'ready');
    assert.equal(state({ grantExpiresAt: '2026-10-26T11:00:00Z', strictReady: true }), 'expired');
  });
});
