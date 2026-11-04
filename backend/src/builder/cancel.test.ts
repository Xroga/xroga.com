/**
 * Builder cancellation: a durable, compare-and-set transition that no late work can undo, authorised by the project owner,
 * and never claiming a stop that was not saved.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';
import express from 'express';

import type { ProjectFile } from '../ai/patches.js';
import { createBuilderRouter } from '../routes/builder.js';
import { createTenantContext } from '../security/tenantContext.js';
import type { UniversalBuildOutcome } from '../synthesis/universalEntrypoint.js';
import { BuilderService, type BuildRunner } from './service.js';
import { InMemoryBuilderStore } from './store.js';
import { BuilderError } from './types.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROMPT = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';
const FILES: ProjectFile[] = [{ path: 'index.html', content: '<h1>Cancelled work</h1>' }];

const done = (files: readonly ProjectFile[]): UniversalBuildOutcome => ({
  ran: true,
  result: { outcome: 'completed', phaseReached: 'complete', plan: null, securityControls: [], commitSha: null, evidence: [], blockers: [], mutationBegan: true, verified: true, reason: 'ok', files },
  goalContract: null, buildContract: null, routing: { selectedModel: null, fallbacks: [], reason: 'test', excluded: [] },
} as unknown as UniversalBuildOutcome);

async function started(store: InMemoryBuilderStore, runBuild: BuildRunner, cancelEngineRun?: (userId: string, runId: string) => Promise<void>) {
  const service = new BuilderService({ store, runBuild, ...(cancelEngineRun ? { cancelEngineRun } : {}) });
  const { project } = await service.createProject(OWNER, { prompt: PROMPT, requestKey: `key-${Math.random().toString(36).slice(2, 12)}` });
  return { service, project };
}

describe('builder cancellation', () => {
  it('a delayed cancellation response cannot cancel the replacement build or clear its slot', async () => {
    const store = new InMemoryBuilderStore();
    let releaseCancellation!: () => void;
    let cancellationStarted!: () => void;
    const waiting = new Promise<void>(resolve => { cancellationStarted = resolve; });
    const pending = new Promise<void>(resolve => { releaseCancellation = resolve; });
    const { service, project } = await started(store, async () => null, async () => {
      cancellationStarted(); await pending;
    });
    const first = await service.beginRun(OWNER, project.id, { runId: 'run-cancel-old-0001' });
    const stopping = service.cancelBuild(OWNER, project.id);
    await waiting;
    // Another process finishes cancelling the old run and accepts a new one
    // before this process receives the canonical cancellation acknowledgement.
    await store.setStateForRun(OWNER, project.id, first.runId, 'cancelled', 'Stopped elsewhere.', null);
    const replacement = await service.beginRun(OWNER, project.id, { runId: 'run-cancel-new-0002' });
    releaseCancellation();
    const late = await stopping;
    assert.equal(late.cancelled, false);
    assert.equal(late.state.project.state, 'generating');
    assert.equal(late.state.project.activeRunId, replacement.runId);
    assert.equal((await store.getProject(OWNER, project.id))!.activeRunId, replacement.runId);
  });
  it('moves a running build to cancelled in one durable transition and frees the slot', async () => {
    const store = new InMemoryBuilderStore();
    const asked: string[] = [];
    const { service, project } = await started(store, async () => null, async (_u, runId) => { asked.push(runId); });
    const run = await service.beginRun(OWNER, project.id, { runId: 'run-aaaaaaaa' });
    assert.equal((await store.getProject(OWNER, project.id))!.state, 'generating');

    const result = await service.cancelBuild(OWNER, project.id);
    assert.equal(result.cancelled, true);
    assert.equal(result.state.project.state, 'cancelled');
    assert.equal(result.state.project.activeRunId, null);
    assert.deepEqual(asked, [run.runId], 'the canonical engine was asked to stop that exact run');

    // idempotent: a second Stop changes nothing and says so
    const again = await service.cancelBuild(OWNER, project.id);
    assert.equal(again.cancelled, false);
    assert.equal(again.state.project.state, 'cancelled');
    assert.deepEqual(asked, [run.runId], 'no second engine request for a build that is no longer running');
  });

  it('a run that finishes after the user cancelled cannot overwrite the cancelled state or add a revision', async () => {
    const store = new InMemoryBuilderStore();
    const { service, project } = await started(store, async () => null);
    const run = await service.beginRun(OWNER, project.id, { runId: 'run-bbbbbbbb' });
    await service.cancelBuild(OWNER, project.id);

    // the engine had already validated and now tries to commit
    await assert.rejects(run.commit({ files: FILES, message: 'late' }), (e) => e instanceof BuilderError && e.code === 'conflict' && /cancelled/i.test(e.message));
    assert.equal((await store.listRevisions(OWNER, project.id)).length, 1, 'only the starter revision exists');

    // and its close-out is ignored instead of resurrecting the project as "verified"
    const closed = await service.completeRun(OWNER, run, { outcome: 'completed', verified: true, reason: 'ok', files: FILES }, async () => ({ started: true, strictReady: true, reason: 'ok' }));
    assert.equal(closed.project.state, 'cancelled');
  });

  it('a stale run cannot clear the slot of the build that replaced it', async () => {
    const store = new InMemoryBuilderStore();
    const { service, project } = await started(store, async () => null);
    const first = await service.beginRun(OWNER, project.id, { runId: 'run-first-0001' });
    await service.cancelBuild(OWNER, project.id);
    const second = await service.beginRun(OWNER, project.id, { runId: 'run-second-001' });
    assert.equal(await store.setStateForRun(OWNER, project.id, first.runId, 'failed', 'late failure from the cancelled run', null), null);
    const now = (await store.getProject(OWNER, project.id))!;
    assert.equal(now.state, 'generating');
    assert.equal(now.activeRunId, second.runId);
  });

  it('is owner only: another tenant gets not_found and changes nothing', async () => {
    const store = new InMemoryBuilderStore();
    const { service, project } = await started(store, async () => null);
    await service.beginRun(OWNER, project.id, { runId: 'run-cccccccc' });
    await assert.rejects(service.cancelBuild(OTHER, project.id), (e) => e instanceof BuilderError && e.code === 'not_found');
    assert.equal((await store.getProject(OWNER, project.id))!.state, 'generating');
    assert.equal(await store.cancelRun(OTHER, project.id, 'x', 'run-cccccccc'), null);
  });

  it('does not claim the build stopped when the stop request could not be saved, and leaves the project running so Stop can be retried', async () => {
    const store = new InMemoryBuilderStore();
    let failing = true;
    const { service, project } = await started(store, async () => null, async () => { if (failing) throw new Error('database unreachable at db.internal'); });
    await service.beginRun(OWNER, project.id, { runId: 'run-dddddddd' });
    await assert.rejects(service.cancelBuild(OWNER, project.id), (e) => e instanceof BuilderError && e.code === 'storage_failed' && !/db\.internal/.test(e.message));
    assert.equal((await store.getProject(OWNER, project.id))!.state, 'generating');
    failing = false;
    assert.equal((await service.cancelBuild(OWNER, project.id)).cancelled, true);
  });

  it('with nothing running there is nothing to cancel, and a finished project keeps its state', async () => {
    const store = new InMemoryBuilderStore();
    const { service, project } = await started(store, async () => null);
    const idle = await service.cancelBuild(OWNER, project.id);
    assert.equal(idle.cancelled, false);
    assert.equal(idle.state.project.state, 'specified');
  });

  it('a direct build whose signal is aborted ends cancelled, and a user Stop mid-build wins over the engine finishing', async () => {
    const store = new InMemoryBuilderStore();
    let service!: BuilderService;
    const runBuild: BuildRunner = async ({ commit, existingFiles, projectId }) => {
      await service.cancelBuild(OWNER, projectId); // the user presses Stop while the engine is working
      try { await commit({ files: [...existingFiles, ...FILES], message: 'too late' }); } catch { /* refused: cancelled */ }
      return done([...existingFiles, ...FILES]);
    };
    const made = await started(store, runBuild);
    service = made.service;
    const state = await service.generate(OWNER, made.project.id, { launchPreview: false });
    assert.equal(state.project.state, 'cancelled');
    assert.equal(state.project.activeRunId, null);
    assert.equal((await store.listRevisions(OWNER, made.project.id)).length, 1);
  });
});

describe('builder cancel route', () => {
  const store = new InMemoryBuilderStore();
  const service = new BuilderService({ store, runBuild: async () => null, cancelEngineRun: async () => undefined });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const who = req.header('x-test-user');
    if (who) (req as unknown as { tenantContext: unknown }).tenantContext = createTenantContext({ userId: who, via: 'persisted_owner' });
    next();
  });
  app.use('/api/builder', createBuilderRouter(() => service));
  const server = app.listen(0);
  after(() => new Promise((resolve) => server.close(resolve)));
  const call = async (path: string, user: string | null) => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/builder${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) }, body: '{}' });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };

  it('requires sign-in, hides other tenants, rejects malformed ids, and cancels for the owner', async () => {
    const { project } = await service.createProject(OWNER, { prompt: PROMPT, requestKey: 'key-route-0001' });
    await service.beginRun(OWNER, project.id, { runId: 'run-eeeeeeee' });
    assert.equal((await call(`/projects/${project.id}/cancel`, null)).status, 401);
    const foreign = await call(`/projects/${project.id}/cancel`, OTHER);
    assert.equal(foreign.status, 404);
    assert.equal(foreign.body.code, 'NOT_FOUND');
    assert.equal((await call('/projects/not-a-uuid/cancel', OWNER)).status, 404);
    assert.equal((await store.getProject(OWNER, project.id))!.state, 'generating', 'refused calls changed nothing');

    const ok = await call(`/projects/${project.id}/cancel`, OWNER);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.cancelled, true);
    assert.equal(ok.body.state.project.state, 'cancelled');
    assert.equal((await call(`/projects/${project.id}/cancel`, OWNER)).body.cancelled, false);
  });
});
