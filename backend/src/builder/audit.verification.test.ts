import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveQaPlan } from './qa/plan.js';
import { runQa } from './qa/runner.js';
import type { BuildRunner } from './service.js';
import { makeServices } from './servicesFixture.testsupport.js';
import { deriveBuildSpec } from './spec.js';

/** Regression tests for the final Batch 2 audit: verification is earned, and late results never overwrite a newer build. */
const ALICE = '11111111-1111-4111-8111-111111111111';
const SAAS = 'Build a task-management application with user accounts, dashboard, task creation, editing, completion, deletion, and saved data that remains after a refresh. Different users must not see each other tasks.';
const SITE = 'Build a premium modern website for a home renovation company with Home, Services, About, Projects and Contact pages.';

const okRunner = (): BuildRunner => async ({ existingFiles, commit }) => {
  const next = [...existingFiles, { path: `f-${existingFiles.length}.txt`, content: 'x' }];
  await commit({ files: next, message: 'm' });
  return {
    ran: true,
    result: { outcome: 'completed', phaseReached: 'complete', plan: null, securityControls: [], files: next, commitSha: null, evidence: [], blockers: [], mutationBegan: true, verified: true, reason: 'ok' },
    goalContract: null, buildContract: null, routing: { selectedModel: null, fallbacks: [], reason: 't', excluded: [] },
  } as never;
};

describe('audit: verification is earned by a passed browser test, and results never overwrite a newer build', () => {
  it('a static site becomes VERIFIED only when browser QA passes on the head revision', async () => {
    const f = makeServices([{ id: ALICE }], { runBuild: okRunner() });
    const { project } = await f.builder.createProject(ALICE, { prompt: SITE, requestKey: 'audit-verify-0001' });
    f.runtime.available = true;
    await f.builder.generate(ALICE, project.id, { launchPreview: false });
    assert.notEqual((await f.builder.getState(ALICE, project.id)).project.state, 'verified');
    const qa = await f.services.qa.runQa(ALICE, project.id);
    assert.equal(qa.report.status, 'passed');
    const state = await f.builder.getState(ALICE, project.id);
    assert.equal(state.project.state, 'verified');
    assert.equal(state.head?.verificationStatus, 'verified');
  });

  it('a QA result that finishes while a newer build holds the slot cannot overwrite that build or release its slot', async () => {
    const f = makeServices([{ id: ALICE }], { runBuild: okRunner() });
    const { project } = await f.builder.createProject(ALICE, { prompt: SAAS, requestKey: 'audit-slot-000001' });
    f.runtime.available = true;
    const run = await f.builder.beginRun(ALICE, project.id, { runId: 'audit-run-slot-0001' });
    assert.equal((await f.builder.getState(ALICE, project.id)).project.state, 'generating');
    await f.services.qa.runQa(ALICE, project.id);
    const after = (await f.builder.getState(ALICE, project.id)).project;
    assert.equal(after.state, 'generating');
    assert.equal(after.activeRunId, run.runId);
  });

  it('a cancelled QA run is never reported as passed, and every planned check is accounted for', async () => {
    const { spec } = deriveBuildSpec(SITE);
    const files = [{ path: 'index.html', content: '<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><h1>Hi</h1></body></html>' }];
    const controller = new AbortController();
    const page = {
      goto: async () => ({ status: 200 }), click: async () => {}, fill: async () => {}, reload: async () => {}, bodyText: async () => 'Hi', isVisible: async () => true, currentPath: () => '/',
      hasHorizontalOverflow: async () => false, hasViewportMeta: async () => true, formIsInvalid: async () => true, submitForm: async () => {}, screenshot: async () => Buffer.from('x'),
      drainDiagnostics: () => ({ consoleErrors: [], pageErrors: [], failedRequests: [] }), close: async () => {},
    };
    const driver = { name: 'fake', browserVersion: async () => '1', open: async () => { controller.abort(); return page; }, close: async () => {} };
    const plan = deriveQaPlan(spec, files);
    const report = await runQa({ plan, driver, signal: controller.signal });
    assert.ok(report.executedChecks < plan.checks.length);
    assert.notEqual(report.status, 'passed');
    assert.equal(report.checks.length, plan.checks.length);
    assert.ok(report.checks.some((check) => check.pendingReason?.includes('cancelled')));
  });

  it('a remote read-only run neither relabels the revision nor replaces the latest local result', async () => {
    const f = makeServices([{ id: ALICE }], { runBuild: okRunner() });
    const { project } = await f.builder.createProject(ALICE, { prompt: SAAS, requestKey: 'audit-remote-00001' });
    f.runtime.available = true;
    const local = await f.services.qa.runQa(ALICE, project.id);
    const head = (await f.builder.history(ALICE, project.id))[0];
    assert.equal(head.verificationStatus, 'partial');
    await f.services.qa.runRemote(ALICE, project.id, { revisionId: head.id, baseUrl: 'http://127.0.0.1:9' });
    assert.equal((await f.builder.history(ALICE, project.id))[0].verificationStatus, 'partial');
    assert.equal((await f.services.qa.latest(ALICE, project.id))?.verificationId, local.summary.verificationId);
  });
});
