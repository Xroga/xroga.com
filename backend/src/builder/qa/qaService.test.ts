import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InMemoryPhase2Store } from '../phase2Store.js';
import { BuilderService } from '../service.js';
import { InMemoryBuilderStore } from '../store.js';
import { BuilderError } from '../types.js';
import { QaService, type RepairRunner } from './qaService.js';
import type { QaDriver, QaPage } from './types.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';

const page = (over: Partial<QaPage> = {}): QaPage => ({
  goto: async () => ({ status: 200 }), click: async () => {}, fill: async () => {}, reload: async () => {}, bodyText: async () => 'Welcome', isVisible: async () => true,
  currentPath: () => '/', hasHorizontalOverflow: async () => false, hasViewportMeta: async () => true, formIsInvalid: async () => true, submitForm: async () => {},
  screenshot: async () => Buffer.from('x'), drainDiagnostics: () => ({ consoleErrors: [], pageErrors: [], failedRequests: [] }), close: async () => {}, ...over,
});
const driverOf = (make: () => QaPage, delayMs = 0): QaDriver => ({
  name: 'fake', browserVersion: async () => 'fake-1', close: async () => {},
  open: async () => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return make();
  },
});

async function setup(options: { openDriver: () => Promise<QaDriver>; repair?: RepairRunner }) {
  const store = new InMemoryBuilderStore();
  const phase2 = new InMemoryPhase2Store(store);
  const builder = new BuilderService({ store, runBuild: async () => null });
  const { project } = await builder.createProject(OWNER, { prompt: SITE, requestKey: `qs-${Math.random().toString(36).slice(2, 12)}` });
  const qa = new QaService({
    builder, store, phase2, target: { ensure: async () => ({ baseUrl: 'http://127.0.0.1:9', environment: { database: false } }) },
    openDriver: options.openDriver, repair: options.repair ?? (async () => ({ revision: null, reason: 'unused', noChange: true })), budgetAllows: async () => true,
  });
  return { qa, store, phase2, project };
}

describe('QA service environment handling', () => {
  it('reports not run, never a pass or a server error, when the environment has no browser', async () => {
    const { qa, project, store } = await setup({ openDriver: async () => { throw Object.assign(new Error('No Playwright browser is available in this environment.'), { code: 'BROWSER_UNAVAILABLE' }); } });
    const result = await qa.runQa(OWNER, project.id);
    assert.equal(result.report.status, 'pending_runtime');
    assert.equal(result.report.executedChecks, 0);
    assert.match(result.report.reason, /No Playwright browser/);
    assert.notEqual((await store.getProject(OWNER, project.id))?.state, 'verified');
  });

  it('still surfaces unexpected driver errors instead of hiding them', async () => {
    const { qa, project } = await setup({ openDriver: async () => { throw new Error('disk full'); } });
    await assert.rejects(qa.runQa(OWNER, project.id), /disk full/);
  });

  it('stops the repair loop at once when the engineering engine is unavailable, and says so', async () => {
    let calls = 0;
    const { qa, project, store } = await setup({
      openDriver: async () => driverOf(() => page({ isVisible: async () => false })),
      repair: async () => {
        calls++;
        throw new BuilderError('unsupported', 'The canonical engineering engine is not enabled for this project, so no repair was attempted.');
      },
    });
    const result = await qa.verifyAndRepair(OWNER, project.id, { maxAttempts: 3 });
    assert.equal(result.status, 'engine_unavailable');
    assert.equal(calls, 1, 'no further attempts are made against an unavailable engine');
    assert.match(result.reason, /not enabled/);
    assert.equal((await store.getProject(OWNER, project.id))?.state, 'partial');
  });

  it('allows one QA run per project at a time and releases the lock afterwards', async () => {
    const { qa, project } = await setup({ openDriver: async () => driverOf(() => page(), 60) });
    const first = qa.runQa(OWNER, project.id);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await assert.rejects(qa.runQa(OWNER, project.id), (error) => error instanceof BuilderError && error.code === 'conflict');
    await assert.rejects(qa.verifyAndRepair(OWNER, project.id), (error) => error instanceof BuilderError && error.code === 'conflict');
    assert.equal((await first).report.status, 'passed');
    assert.equal((await qa.runQa(OWNER, project.id)).report.status, 'passed');
  });
});
