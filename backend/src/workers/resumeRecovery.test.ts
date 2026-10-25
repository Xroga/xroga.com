import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { createCanonicalExecutionState, ExecutionScheduler, InMemoryExecutionStateStore, type ExecutableTaskNode } from '../ai/executionRuntime.js';
import { harness } from '../storage/testing/harness.js';
import { StorageError } from '../storage/types.js';
import { createBrowserTaskHandler, type BrowserHandlerDeps, type BrowserWorkerResult } from './browserTaskHandler.js';
import { MemoryLeaseStore } from './leaseStore.js';
import { recoverRunWithLeases } from './resumeRecovery.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const limits = { maxDurationMs: 5_000, maxNavigations: 10, maxRedirects: 3, maxPages: 2, maxResponseBytes: 1_000_000, maxArtifactBytes: 100_000, maxModelCostMicros: 0 };
const scope = { allowedOrigins: ['https://example.com'], startUrl: 'https://example.com/', limits };
const result = (): BrowserWorkerResult => ({
  finalUrl: 'https://example.com/done', visitedUrls: ['https://example.com/'], navigations: 1, responseBytes: 100, summary: 'ok',
  artifacts: [{ name: 'shot.png', mediaType: 'image/png', bytes: PNG }, { name: 'notes.json', mediaType: 'application/json', bytes: Buffer.from('{"a":1}') }],
});
const node = (over: Partial<ExecutableTaskNode> = {}): ExecutableTaskNode => ({
  id: 'browse-1', objective: 'collect', operationType: 'browser_automation', requiredCapabilities: [], selectedRuntime: null, selectedProvider: null, selectedModel: null,
  requiredContextReferences: [], allowedFiles: [], expectedOutputSchema: {}, dependencies: [], riskLevel: 'low', timeoutMs: 20_000,
  retryPolicy: { maximumAttempts: 3, initialBackoffMs: 1, maximumBackoffMs: 2 }, budget: {}, validationMethod: [], evidenceRequirements: [], fallbackRoutes: [],
  status: 'ready', attempts: 0, evidence: [], ...over,
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('restart recovery with leases', () => {
  const rig = () => {
    const h = harness();
    const leases = new MemoryLeaseStore();
    let workerCalls = 0;
    const deps: BrowserHandlerDeps = {
      actor: h.alice, drive: h.svc, leases, workerId: 'worker-b', leaseTtlMs: 300,
      worker: { run: async () => { workerCalls++; return result(); } }, authorise: async () => true, scopeFor: () => scope,
    };
    return { h, leases, deps, calls: () => workerCalls };
  };
  const crashedState = (projectId: string, runId: string, over: Partial<ExecutableTaskNode> = {}) => {
    const state = createCanonicalExecutionState({ projectId, runId, tasks: [node({ status: 'running', attempts: 1, startedAt: new Date().toISOString(), ...over })] });
    return state;
  };

  it('a crashed worker\'s task is resumed after its lease expires, with a higher fencing token, and finishes without duplicating evidence', async () => {
    const r = rig();
    const runId = randomUUID();
    // worker-a stored its first artifact, then the process died: the lease is never renewed or released and the state still says "running"
    const flakyDrive = { listObjects: r.h.svc.listObjects.bind(r.h.svc), putServerObject: async (...a: Parameters<typeof r.h.svc.putServerObject>) => { if (r.h.repo.objects.size >= 1) throw new StorageError('PROVIDER_UNAVAILABLE', 'process died', 503); return r.h.svc.putServerObject(...a); } };
    const first = createCanonicalExecutionState({ projectId: r.h.aliceProject, runId, tasks: [node({ retryPolicy: { maximumAttempts: 1, initialBackoffMs: 1, maximumBackoffMs: 2 } })] });
    const crashedLease = (await r.leases.acquire({ tenantId: r.h.alice.tenantId, runId, taskId: 'browse-1' }, 'worker-a', 60))!;
    await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(first, { browser_automation: createBrowserTaskHandler({ ...r.deps, workerId: 'worker-a', drive: flakyDrive, leases: new MemoryLeaseStore() }) });
    assert.equal(r.h.repo.objects.size, 1, 'one artifact was durably stored before the crash');

    const persisted = crashedState(r.h.aliceProject, runId);
    await sleep(100); // worker-a's lease expires; nobody renews it
    assert.equal(await r.leases.holder({ tenantId: r.h.alice.tenantId, runId, taskId: 'browse-1' }), null);

    const recovery = await recoverRunWithLeases(persisted, r.leases, r.h.alice.tenantId);
    assert.deepEqual(recovery.resumedTaskIds, ['browse-1']);
    assert.deepEqual(recovery.heldByLiveWorker, []);
    assert.equal(recovery.state.tasks[0]!.status, 'ready');
    assert.equal(recovery.state.tasks[0]!.attempts, 0, 'the canonical rule refunds the interrupted attempt: a restart does not spend the retry budget');

    const done = await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(recovery.state, { browser_automation: createBrowserTaskHandler(r.deps) });
    assert.equal(done.tasks[0]!.status, 'completed');
    assert.equal(r.h.repo.objects.size, 2, 'the stored artifact was reused; only the missing one was added');
    const run = done.tasks[0]!.evidence.find((e) => e.kind === 'browser_run')!;
    assert.match(run.summary, new RegExp(`lease token ${crashedLease.token + 1}`), 'the new worker holds a strictly higher fencing token');
  });

  it('a task still held by a live worker is NOT resumed: it stays running and no second worker starts', async () => {
    const r = rig();
    const runId = randomUUID();
    await r.leases.acquire({ tenantId: r.h.alice.tenantId, runId, taskId: 'browse-1' }, 'worker-a', 60_000);
    const recovery = await recoverRunWithLeases(crashedState(r.h.aliceProject, runId), r.leases, r.h.alice.tenantId);
    assert.deepEqual(recovery.heldByLiveWorker, ['browse-1']);
    assert.deepEqual(recovery.resumedTaskIds, []);
    assert.equal(recovery.state.tasks[0]!.status, 'running');
    assert.equal(recovery.state.tasks[0]!.attempts, 1);
    const after = await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(recovery.state, { browser_automation: createBrowserTaskHandler(r.deps) });
    assert.equal(r.calls(), 0, 'the handler was never invoked');
    assert.equal(after.tasks[0]!.status, 'running');
  });

  it('if a worker takes the task between the check and the resume, the lease still refuses the second copy', async () => {
    const r = rig();
    const runId = randomUUID();
    const recovery = await recoverRunWithLeases(crashedState(r.h.aliceProject, runId), r.leases, r.h.alice.tenantId); // nobody holds it: resumable
    assert.equal(recovery.state.tasks[0]!.status, 'ready');
    await r.leases.acquire({ tenantId: r.h.alice.tenantId, runId, taskId: 'browse-1' }, 'worker-a', 60_000); // a worker grabs it in the gap
    const after = await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(recovery.state, { browser_automation: createBrowserTaskHandler({ ...r.deps, workerId: 'worker-b' }) });
    assert.equal(r.calls(), 0);
    assert.notEqual(after.tasks[0]!.status, 'completed');
  });

  it('another tenant\'s lease on the same run and task ids does not count as "held"', async () => {
    const r = rig();
    const runId = randomUUID();
    await r.leases.acquire({ tenantId: r.h.bob.tenantId, runId, taskId: 'browse-1' }, 'worker-x', 60_000);
    const recovery = await recoverRunWithLeases(crashedState(r.h.aliceProject, runId), r.leases, r.h.alice.tenantId);
    assert.deepEqual(recovery.heldByLiveWorker, []);
    assert.deepEqual(recovery.resumedTaskIds, ['browse-1']);
  });

  it('keeps the canonical safety rule: an interrupted publish is blocked, never replayed, whatever the leases say', async () => {
    const r = rig();
    const runId = randomUUID();
    const publish = node({ id: 'publish-1', operationType: 'github_publishing', status: 'running', attempts: 1, startedAt: new Date().toISOString() });
    const state = createCanonicalExecutionState({ projectId: r.h.aliceProject, runId, tasks: [publish] });
    const recovery = await recoverRunWithLeases(state, r.leases, r.h.alice.tenantId);
    assert.deepEqual(recovery.blockedUncertainTaskIds, ['publish-1']);
    assert.equal(recovery.state.tasks[0]!.status, 'blocked');
  });

  it('does not mutate its input', async () => {
    const r = rig();
    const runId = randomUUID();
    const input = crashedState(r.h.aliceProject, runId);
    const before = JSON.stringify(input);
    await recoverRunWithLeases(input, r.leases, r.h.alice.tenantId);
    assert.equal(JSON.stringify(input), before);
  });
});
