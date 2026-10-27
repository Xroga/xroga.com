import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ProjectFile } from '../ai/patches.js';
import type { UniversalBuildOutcome } from '../synthesis/universalEntrypoint.js';
import { BuilderService, type BuildRunner, type PreviewPort } from './service.js';
import { InMemoryBuilderStore } from './store.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';

const outcome = (files: readonly ProjectFile[]) => ({
  ran: true,
  result: { outcome: 'completed', phaseReached: 'complete', plan: null, securityControls: [], files, commitSha: null, evidence: [], blockers: [], mutationBegan: true, verified: true, reason: 'ok' },
  goalContract: null, buildContract: null, routing: { selectedModel: null, fallbacks: [], reason: 't', excluded: [] },
}) as unknown as UniversalBuildOutcome;

const runner: BuildRunner = async ({ existingFiles, commit }) => {
  const next = [...existingFiles, { path: `n-${existingFiles.length}.txt`, content: 'x' }];
  await commit({ files: next, message: 'm' });
  return outcome(next);
};

function previewPort(ready: boolean): PreviewPort {
  let sha: string | null = null;
  return {
    launch: async ({ revision }) => { sha = revision.contentSha256; return { started: true, strictReady: ready, reason: ready ? 'All routes responded.' : '1 route failed.' }; },
    verify: async () => ({ started: true, strictReady: ready, reason: 'x' }),
    facts: async () => ({ requested: true, coordinatorStatus: 'ready', runtimeRunning: true, processRunning: true, strictReady: null, grantExpiresAt: null, grantRevokedAt: null, workspaceSha256: sha }),
  };
}

describe('audit: the preview state reflects what was observed for the head revision, not the project\'s overall state', () => {
  it('a healthy preview is READY even while the project awaits browser tests or its tests failed', async () => {
    const store = new InMemoryBuilderStore();
    const service = new BuilderService({ store, runBuild: runner, preview: previewPort(true) });
    const { project } = await service.createProject(OWNER, { prompt: SITE, requestKey: 'audit-preview-0001' });
    const state = await service.generate(OWNER, project.id, {});
    assert.equal(state.project.state, 'partial', 'not browser-verified yet');
    assert.equal(state.preview.lifecycle, 'ready', 'but the pages respond, so the preview is ready');
    await store.setStateIfIdle(OWNER, project.id, 'partial', 'Browser QA failed: 1 check failed.');
    assert.equal((await service.getState(OWNER, project.id)).preview.lifecycle, 'ready', 'failing tests are not a failing preview');
  });

  it('a preview whose readiness check failed is DEGRADED, and a newer revision does not inherit an older result', async () => {
    const store = new InMemoryBuilderStore();
    const service = new BuilderService({ store, runBuild: runner, preview: previewPort(false) });
    const { project } = await service.createProject(OWNER, { prompt: SITE, requestKey: 'audit-preview-0002' });
    const state = await service.generate(OWNER, project.id, {});
    assert.equal(state.preview.lifecycle, 'degraded');

    const good = new BuilderService({ store: new InMemoryBuilderStore(), runBuild: runner, preview: previewPort(true) });
    const created = await good.createProject(OWNER, { prompt: SITE, requestKey: 'audit-preview-0003' });
    await good.generate(OWNER, created.project.id, {});
    // A later revision saved without a new check has no recorded result: its readiness is unknown, not "ready".
    const run = await good.beginRun(OWNER, created.project.id, { runId: 'audit-newer-run-0001' });
    await run.commit({ files: [...run.files, { path: 'later.txt', content: 'later' }], message: 'later' });
    await (good as unknown as { deps: { store: InMemoryBuilderStore } }).deps.store.setStateIfIdle(OWNER, created.project.id, 'partial', 'x').catch(() => undefined);
    const after = await good.getState(OWNER, created.project.id);
    assert.notEqual(after.preview.lifecycle, 'ready');
  });
});
