import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AgentSoftwareExecutorInput, AgentSoftwareExecutorResult } from '../../ai/softwareAgent/AgentSoftwareExecutor.js';
import type { AdmittedRunAttempt } from '../../ai/runStore.js';
import type { CanonicalExecutionState } from '../../ai/executionRuntime.js';
import type { SandboxCaller } from '../../sandbox/google/executionBinding.js';
import { createTenantContext } from '../../security/tenantContext.js';
import type { CanonicalDeliveryClaim } from '../../workers/googleDeliveryStore.js';
import { FakeGitHub, type FakeFile } from '../fakeGitHub.testsupport.js';
import { InMemoryCodeIndexStore } from '../intelligence/codeIndexStore.js';
import { ExistingSourceIntelligence, IndexCoordinator } from '../intelligence/service.js';
import { ExistingSourceService } from '../service.js';
import { InMemorySourceBindingStore } from '../store.js';
import { ExistingSourceError } from '../types.js';
import { canonicalChangeRuntime, canonicalExecutionPort, canonicalRunFor, type CanonicalChangeRun, type CanonicalPortDeps } from './canonical.js';
import { runExistingSourceChangeJob, type ChangeJobDeps } from './canonicalJob.js';
import { LocalProcessPort } from './localProcessPort.testsupport.js';
import { ChangeService, type AgentRunner } from './service.js';
import { InMemoryChangeStore } from './store.js';
import type { ExistingSourceToolHost } from './toolHost.js';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const RUN = '33333333-3333-4333-8333-333333333333';
const WORKER = '44444444-4444-4444-8444-444444444444';

const PROJECT: FakeFile[] = [
  { path: 'package.json', content: '{\n  "name": "math",\n  "version": "1.0.0",\n  "scripts": { "test": "node --test" }\n}\n' },
  { path: 'src/math.js', content: 'function double(n) {\n  return n + n + 1;\n}\nmodule.exports = { double };\n' },
  { path: 'test/math.test.js', content: "const test = require('node:test');\nconst assert = require('node:assert');\nconst { double } = require('../src/math');\ntest('doubles', () => assert.strictEqual(double(2), 4));\n" },
];
const FIX = 'function double(n) {\n  return n + n;\n}\nmodule.exports = { double };\n';

const attempt = (runId = RUN, userId = ALICE): AdmittedRunAttempt => ({ runId, userId, workerId: WORKER, generation: '55555555-5555-4555-8555-555555555555' });
const run = (overrides: Partial<CanonicalChangeRun> = {}): CanonicalChangeRun => ({
  userId: ALICE, runId: RUN, changeId: '66666666-6666-4666-8666-666666666666', bindingId: '77777777-7777-4777-8777-777777777777',
  repository: { owner: 'acme', name: 'math' }, branch: 'main', baseCommitSha: 'a'.repeat(40), ...overrides,
});

function recordingDeps(current: AdmittedRunAttempt = attempt()) {
  const states: CanonicalExecutionState[] = []; const callers: SandboxCaller[] = []; const requests: unknown[] = [];
  const deps: CanonicalPortDeps = {
    currentAttempt: () => current,
    saveState: async (_a, state) => { states.push(structuredClone(state)); },
    sandbox: async (caller, request) => { callers.push(caller); requests.push(request); return { exitCode: 0, stdout: '', stderr: '', timedOut: false, durationMs: 1 } as never; },
  };
  return { deps, states, callers, requests };
}

describe('the canonical execution port', () => {
  it('writes the run\'s own state with exactly the working files before any command, and only again when the files change', async () => {
    const r = recordingDeps();
    const port = canonicalExecutionPort(run(), async () => r.deps);
    const files = [{ path: 'a.js', content: '1' }];
    await port.execute({ files, command: 'node', args: ['a.js'], timeoutMs: 1000 } as never);
    await port.execute({ files, command: 'node', args: ['a.js'], timeoutMs: 1000 } as never);
    assert.equal(r.states.length, 1);
    assert.deepEqual(r.states[0]!.currentWorkingSnapshot, files);
    assert.equal(r.states[0]!.runId, RUN);
    assert.equal(r.states[0]!.projectId, 'existing-source:77777777-7777-4777-8777-777777777777');
    assert.deepEqual(r.states[0]!.repository, { owner: 'acme', name: 'math' });
    assert.equal(r.states[0]!.startingCommitSha, 'a'.repeat(40));
    await port.execute({ files: [...files, { path: 'b.js', content: '2' }], command: 'node', args: ['b.js'], timeoutMs: 1000 } as never);
    assert.equal(r.states.length, 2);
    assert.equal(r.callers.length, 3);
  });

  it('runs staged project tests as validation and the agent\'s own commands as software-agent commands', async () => {
    const r = recordingDeps();
    const port = canonicalExecutionPort(run(), async () => r.deps);
    await port.execute({ files: [], command: 'npm', args: ['test'], timeoutMs: 1000, stages: [{ id: 'test', label: 'test', command: 'npm', args: ['test'], networkPolicy: 'none', timeoutMs: 1000 }] } as never);
    await port.execute({ files: [], command: '/bin/sh', args: ['-lc', 'ls'], timeoutMs: 1000 } as never);
    assert.deepEqual(r.callers, ['universal-validation', 'software-agent-command']);
  });

  it('refuses a different run attempt or owner, and never forwards a binding the caller supplied', async () => {
    const wrongRun = recordingDeps(attempt('88888888-8888-4888-8888-888888888888'));
    await assert.rejects(() => canonicalExecutionPort(run(), async () => wrongRun.deps).execute({ files: [], command: 'node', args: [], timeoutMs: 1000 } as never),
      (e) => e instanceof ExistingSourceError && e.code === 'EXECUTION_UNAVAILABLE');
    assert.equal(wrongRun.callers.length, 0);
    const wrongOwner = recordingDeps(attempt(RUN, BOB));
    await assert.rejects(() => canonicalExecutionPort(run(), async () => wrongOwner.deps).execute({ files: [], command: 'node', args: [], timeoutMs: 1000 } as never));
    const ok = recordingDeps();
    await canonicalExecutionPort(run(), async () => ok.deps).execute({ files: [], command: 'node', args: [], timeoutMs: 1000, executionBinding: { forged: true } } as never);
    assert.equal('executionBinding' in (ok.requests[0] as object), false);
  });

  it('records no repository for an archive import', () => {
    const r = canonicalRunFor(ALICE, RUN, 'c', { id: 'b', originKind: 'archive', repositoryFullName: 'imported', baseBranch: 'main', baseCommitSha: 'b'.repeat(40) } as never);
    assert.equal(r.repository, null);
  });
});

function jobSetup(options: { runAgent?: AgentRunner } = {}) {
  const gh = new FakeGitHub();
  gh.addAccount('tok-alice', '501', 'alice'); gh.addAccount('tok-bob', '502', 'bob');
  const repo = gh.addRepo({ fullName: 'acme/math', ownerId: '501', files: PROJECT, access: { '501': { pull: true, push: true } } });
  const tokens = new Map<string, string | null>([[ALICE, 'tok-alice'], [BOB, 'tok-bob']]);
  const source = new ExistingSourceService({ store: new InMemorySourceBindingStore(), tokenFor: async (u) => tokens.get(u) ?? null, portFor: (t) => gh.port(t), treeCache: new Map() } as never);
  const intel = new ExistingSourceIntelligence({ source, store: new InMemoryCodeIndexStore(), coordinator: new IndexCoordinator() });
  const store = new InMemoryChangeStore();
  const fixAgent: AgentRunner = async (input: AgentSoftwareExecutorInput) => {
    await (input.host as ExistingSourceToolHost).writeFile(input.contract, 'src/math.js', FIX, 'modify');
    return { status: 'implemented', evidence: { changedFiles: [], checks: [] }, blockers: [], outputText: 'done', iterations: 1 } as AgentSoftwareExecutorResult;
  };
  const recorded = recordingDeps();
  const local = new LocalProcessPort();
  recorded.deps = { ...recorded.deps, sandbox: async (caller, request) => { recorded.callers.push(caller); return local.execute(request as never); } };
  const deps: ChangeJobDeps = {
    source, intel, store, runAgent: options.runAgent ?? fixAgent, modelRouteFor: async () => ({}) as never, adoptRun: async () => undefined,
    runtimeFor: (r) => canonicalChangeRuntime(r, async () => recorded.deps),
  };
  const planner = new ChangeService({ source, intel, store, execution: local, runAgent: fixAgent, modelRouteFor: async () => ({}) as never });
  const claim = Object.freeze({ deliveryId: '99999999-9999-4999-8999-999999999999', runId: RUN, userId: ALICE, workerId: WORKER, generation: '55555555-5555-4555-8555-555555555555' }) as CanonicalDeliveryClaim;
  return { gh, repo, source, store, planner, deps, recorded, claim, context: createTenantContext({ userId: ALICE, via: 'persisted_owner' }) };
}

describe('a change running as a canonical Job', () => {
  it('verifies the change with the project\'s own tests through the canonical seam, using the run\'s own state', async () => {
    const t = jobSetup();
    const binding = (await t.source.link(ALICE, { repositoryId: t.repo })).binding;
    const task = await t.planner.create(ALICE, binding.id, 'Fix double so double(2) is 4');
    await t.planner.attachRun(ALICE, task.id, RUN);
    const outcome = await runExistingSourceChangeJob({ context: t.context, claim: t.claim, changeId: task.id, signal: new AbortController().signal, deps: t.deps });
    assert.equal(outcome.status, 'verified');
    assert.equal(outcome.success, true);
    assert.ok(t.recorded.callers.length > 0);
    assert.ok(t.recorded.callers.every((c) => c === 'universal-validation' || c === 'software-agent-command'));
    const last = t.recorded.states.at(-1)!;
    assert.equal(last.runId, RUN);
    assert.equal(last.currentWorkingSnapshot.find((f) => f.path === 'src/math.js')?.content, FIX);
    assert.equal((await t.store.get(ALICE, task.id))?.canonicalRunId, RUN);
  });

  it('refuses a change that was not queued for this run, and another owner\'s change', async () => {
    const t = jobSetup();
    const binding = (await t.source.link(ALICE, { repositoryId: t.repo })).binding;
    const task = await t.planner.create(ALICE, binding.id, 'Fix double so double(2) is 4');
    await t.planner.attachRun(ALICE, task.id, '12121212-1212-4212-8212-121212121212');
    await assert.rejects(() => runExistingSourceChangeJob({ context: t.context, claim: t.claim, changeId: task.id, signal: new AbortController().signal, deps: t.deps }),
      (e) => e instanceof ExistingSourceError && e.code === 'CHANGE_CONFLICT');
    const bob = createTenantContext({ userId: BOB, via: 'persisted_owner' });
    const bobClaim = Object.freeze({ ...t.claim, userId: BOB }) as CanonicalDeliveryClaim;
    await assert.rejects(() => runExistingSourceChangeJob({ context: bob, claim: bobClaim, changeId: task.id, signal: new AbortController().signal, deps: t.deps }),
      (e) => e instanceof ExistingSourceError && e.code === 'CHANGE_NOT_FOUND');
    assert.equal(t.recorded.callers.length, 0);
  });

  it('stops and records a cancellation when the run is cancelled', async () => {
    const controller = new AbortController();
    const t = jobSetup({ runAgent: async () => { controller.abort(); await new Promise((r) => setTimeout(r, 20)); return { status: 'cancelled', evidence: { changedFiles: [], checks: [] }, blockers: [], outputText: '', iterations: 0 } as AgentSoftwareExecutorResult; } });
    const binding = (await t.source.link(ALICE, { repositoryId: t.repo })).binding;
    const task = await t.planner.create(ALICE, binding.id, 'Fix double so double(2) is 4');
    await t.planner.attachRun(ALICE, task.id, RUN);
    const outcome = await runExistingSourceChangeJob({ context: t.context, claim: t.claim, changeId: task.id, signal: controller.signal, deps: t.deps });
    assert.equal(outcome.status, 'cancelled');
    assert.equal(outcome.success, false);
    assert.equal(t.recorded.callers.length, 0);
  });
});

describe('browser verification of a visual change', () => {
  const PAGE: FakeFile[] = [...PROJECT, { path: 'public/nav.css', content: '.nav { display: none; }\n' }, { path: 'public/index.html', content: '<nav class="nav">Home</nav>\n' }];
  const cssAgent: AgentRunner = async (input: AgentSoftwareExecutorInput) => {
    await (input.host as ExistingSourceToolHost).writeFile(input.contract, 'public/nav.css', '.nav { display: flex; }\n', 'modify');
    return { status: 'implemented', evidence: { changedFiles: [], checks: [] }, blockers: [], outputText: 'done', iterations: 1 } as AgentSoftwareExecutorResult;
  };
  type Preview = import('../../ai/softwareAgent/contracts.js').SoftwarePreviewEvidence;
  const evidence = (over: Partial<Preview>): Preview => ({ status: 'passed', attempted: true, url: 'http://127.0.0.1:3000/', criteriaNotChecked: [], screenshots: ['a.png'], ...over });

  async function harness(previewVerifierFor: ConstructorParameters<typeof ChangeService>[0]['previewVerifierFor'], maxAttempts = 1, runAgent: AgentRunner = cssAgent, instruction = 'Fix the mobile navigation in nav.css') {
    const gh = new FakeGitHub();
    gh.addAccount('tok-alice', '501', 'alice');
    const repo = gh.addRepo({ fullName: 'acme/page', ownerId: '501', files: PAGE, access: { '501': { pull: true, push: true } } });
    const source = new ExistingSourceService({ store: new InMemorySourceBindingStore(), tokenFor: async () => 'tok-alice', portFor: (t) => gh.port(t), treeCache: new Map() } as never);
    const intel = new ExistingSourceIntelligence({ source, store: new InMemoryCodeIndexStore(), coordinator: new IndexCoordinator() });
    const changes = new ChangeService({ source, intel, store: new InMemoryChangeStore(), execution: new LocalProcessPort(), runAgent, modelRouteFor: async () => ({}) as never, previewVerifierFor, maxAttempts });
    const binding = (await source.link(ALICE, { repositoryId: repo })).binding;
    const task = await changes.create(ALICE, binding.id, instruction);
    return changes.run(ALICE, task.id);
  }

  it('is verified only when the tests passed and the browser observed the page', async () => {
    const seen: unknown[] = [];
    const done = await harness(() => async (_files, context) => { seen.push(context); return evidence({}); });
    assert.equal(done.status, 'verified', done.statusReason + ' ' + JSON.stringify(done.revisions.at(-1)?.tests));
    assert.equal(done.revisions.at(-1)!.preview?.status, 'passed');
    assert.deepEqual(seen, [{ buildPassed: true, testsPassed: null }]);
  });

  it('is unverified, never verified, when no browser verification is connected or it did not run', async () => {
    const none = await harness(undefined);
    assert.equal(none.status, 'unverified');
    assert.match(none.statusReason, /no browser check ran/i);
    assert.equal(none.revisions.at(-1)!.preview?.status, 'not_checked');
    const unavailable = await harness(() => async () => evidence({ status: 'not_checked', attempted: false, url: null, notCheckedReason: 'browser_unavailable', blocker: 'No browser image.' }));
    assert.equal(unavailable.status, 'unverified');
    const broken = await harness(() => async () => { throw new Error('boom'); });
    assert.equal(broken.status, 'unverified');
  });

  it('fails the change when the browser saw a broken page, handing the agent the evidence to repair from', async () => {
    const done = await harness(() => async () => evidence({ status: 'failed', evidenceForRepair: 'The navigation link is not visible at 375px.' }), 2);
    assert.equal(done.status, 'failed');
    assert.equal(done.attempts, 2);
    assert.equal(done.revisions.at(-1)!.preview?.status, 'failed');
  });

  it('does not require a browser for a project a browser cannot serve', async () => {
    const both: AgentRunner = async (input: AgentSoftwareExecutorInput) => {
      const host = input.host as ExistingSourceToolHost;
      await host.writeFile(input.contract, 'public/nav.css', '.nav { display: flex; }\n', 'modify');
      await host.writeFile(input.contract, 'src/math.js', FIX, 'modify');
      return { status: 'implemented', evidence: { changedFiles: [], checks: [] }, blockers: [], outputText: 'done', iterations: 1 } as AgentSoftwareExecutorResult;
    };
    const done = await harness(() => async () => evidence({ status: 'not_checked', attempted: false, url: null, notCheckedReason: 'not_a_web_project', blocker: 'A library.' }), 1, both, 'Fix the mobile navigation in nav.css and fix double in src/math.js');
    assert.equal(done.status, 'verified', done.statusReason);
    const withBrowserMissing = await harness(undefined, 1, both, 'Fix the mobile navigation in nav.css and fix double in src/math.js');
    assert.equal(withBrowserMissing.status, 'unverified');
    assert.match(withBrowserMissing.statusReason, /Tests passed, but the change affects what a browser shows/);
  });

  it('runs the real verifier through the canonical seam as browser verification, after syncing the run\'s state', async () => {
    const r = recordingDeps();
    const files = [{ path: 'index.html', content: '<p>hi</p>' }];
    const runtime = canonicalChangeRuntime(run(), async () => r.deps, async () => (() => async (input: { files: readonly { path: string; content: string }[]; buildPassed: boolean; testsPassed: boolean | null }) => ({
      status: 'passed', attempted: true, url: 'http://127.0.0.1:3000/', criteriaNotChecked: [], screenshots: [], notCheckedReason: null, blocker: null, evidenceForRepair: undefined, verdict: { rungReached: 'rendered' }, seen: input.buildPassed,
    })) as never);
    const out = await runtime.previewVerifier(['nav is visible'])(files, { buildPassed: true, testsPassed: null });
    assert.equal(out.status, 'passed');
    assert.equal(out.rungReached, 'rendered');
    const adapter = canonicalChangeRuntime(run(), async () => r.deps, async () => ((options: { execute: (request: never) => Promise<unknown> }) => async () => {
      await options.execute({ files, sourceFiles: files, command: 'node', args: ['collect.js'], timeoutMs: 1000, networkPolicy: 'none', environment: {} } as never);
      return { status: 'not_checked', attempted: false, url: null, criteriaNotChecked: [], screenshots: [] };
    }) as never);
    await adapter.previewVerifier([])(files, { buildPassed: true, testsPassed: null });
    assert.deepEqual(r.callers, ['browser-verification']);
    assert.deepEqual(r.states.at(-1)!.currentWorkingSnapshot, files);
  });
});
