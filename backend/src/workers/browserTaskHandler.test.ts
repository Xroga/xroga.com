import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { createCanonicalExecutionState, ExecutionScheduler, InMemoryExecutionStateStore, type ExecutableTaskNode } from '../ai/executionRuntime.js';
import { harness, type Harness } from '../storage/testing/harness.js';
import { StorageError, type StorageActor } from '../storage/types.js';
import type { BrowserJob } from './browserJob.js';
import { createBrowserTaskHandler, BrowserTaskError, type BrowserHandlerDeps, type BrowserWorkerPort, type BrowserWorkerResult } from './browserTaskHandler.js';
import { PostCompletionAccountingError } from '../ai/postCompletionAccounting.js';
import { AdmissionController } from './admission.js';
import { MemoryLeaseStore, type Lease } from './leaseStore.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const limits = { maxDurationMs: 5_000, maxNavigations: 10, maxRedirects: 3, maxPages: 2, maxResponseBytes: 1_000_000, maxArtifactBytes: 100_000, maxModelCostMicros: 0 };
const scope = { allowedOrigins: ['https://example.com'], startUrl: 'https://example.com/', limits };

const okResult = (over: Partial<BrowserWorkerResult> = {}): BrowserWorkerResult => ({
  finalUrl: 'https://example.com/done', visitedUrls: ['https://example.com/', 'https://example.com/done'], navigations: 2, responseBytes: 5_000,
  summary: 'visited two pages', artifacts: [{ name: 'shot.png', mediaType: 'image/png', bytes: PNG }, { name: 'notes.json', mediaType: 'application/json', bytes: Buffer.from('{"title":"Example"}') }], ...over,
});

const task = (id = 'browse-1'): ExecutableTaskNode => ({
  id, objective: 'collect evidence', operationType: 'browser_automation', requiredCapabilities: ['browser'], selectedRuntime: null, selectedProvider: null,
  selectedModel: null, requiredContextReferences: [], allowedFiles: [], expectedOutputSchema: {}, dependencies: [], riskLevel: 'low', timeoutMs: 20_000,
  retryPolicy: { maximumAttempts: 1, initialBackoffMs: 1, maximumBackoffMs: 2 }, budget: {}, validationMethod: ['browser'], evidenceRequirements: [],
  fallbackRoutes: [], status: 'ready', attempts: 0, evidence: [],
});

interface Rig {
  h: Harness; leases: MemoryLeaseStore; calls: BrowserJob[]; deps: BrowserHandlerDeps; actor: StorageActor; runId: string;
  run(opts?: { signal?: AbortSignal; taskId?: string; projectId?: string; attempts?: number }): Promise<{ task: ExecutableTaskNode; state: ReturnType<typeof createCanonicalExecutionState> }>;
}

function rig(worker: (job: BrowserJob, ctx: { signal: AbortSignal; lease: Lease }) => Promise<BrowserWorkerResult>, over: Partial<BrowserHandlerDeps> = {}, actorOf?: (h: Harness) => StorageActor): Rig {
  const h = harness();
  const actor = actorOf ? actorOf(h) : h.alice;
  const leases = new MemoryLeaseStore();
  const calls: BrowserJob[] = [];
  const port: BrowserWorkerPort = { run: async (job, ctx) => { calls.push(job); return worker(job, ctx); } };
  const deps: BrowserHandlerDeps = {
    actor, drive: h.svc, leases, worker: port, workerId: 'worker-a', leaseTtlMs: 300,
    authorise: async () => true, scopeFor: () => scope, ...over,
  };
  const runId = randomUUID();
  return {
    h, leases, calls, deps, actor, runId,
    async run(opts = {}) {
      const state = createCanonicalExecutionState({ projectId: opts.projectId ?? h.aliceProject, runId, tasks: [task(opts.taskId)] });
      const scheduler = new ExecutionScheduler(new InMemoryExecutionStateStore());
      await scheduler.run(state, { browser_automation: createBrowserTaskHandler(deps) }, opts.signal);
      return { task: state.tasks[0]!, state };
    },
  };
}

const failureCode = (t: ExecutableTaskNode) => ((t.output as { failure?: { code: string } } | undefined)?.failure?.code);
const objectCount = (h: Harness) => h.repo.objects.size;

describe('browser task handler on the canonical scheduler', () => {
  it('security denials and uncertain completed accounting cannot retry a browser task',async()=>{
    for(const error of [new BrowserTaskError('PERMISSION_REVOKED','synthetic ownership denial'),new PostCompletionAccountingError()]){
      const r=rig(async()=>{throw error;});
      const node=task();node.retryPolicy.maximumAttempts=3;
      const state=createCanonicalExecutionState({projectId:r.h.aliceProject,runId:r.runId,tasks:[node]});
      await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(state,{browser_automation:createBrowserTaskHandler(r.deps)});
      assert.equal(r.calls.length,1);assert.equal(state.tasks[0].status,'failed');assert.equal(objectCount(r.h),0);
    }
  });
  it('runs through ExecutionScheduler, stores verified private evidence, and releases the lease', async () => {
    const r = rig(async () => okResult());
    const { task: t } = await r.run();
    assert.equal(t.status, 'completed');
    assert.deepEqual(t.evidence.map((e) => e.kind).sort(), ['browser_run', 'drive_artifact', 'drive_artifact']);
    assert.equal(objectCount(r.h), 2);
    for (const e of t.evidence.filter((x) => x.kind === 'drive_artifact')) {
      const id = e.identifier!.slice('drive://'.length);
      const got = await r.h.svc.readObjectBytes(r.h.alice, id);
      assert.ok(got.bytes.length > 0);
      await assert.rejects(r.h.svc.readObjectBytes(r.h.bob, id), 'another tenant must not read it');
    }
    assert.equal(await r.leases.holder({ tenantId: r.actor.tenantId, runId: r.runId, taskId: 'browse-1' }), null, 'lease released');
  });

  it('builds the job from issued authority only; the worker sees the actor, project, run and task, not anything a scope could inject', async () => {
    const r = rig(async () => okResult(), { scopeFor: () => ({ ...scope, tenantId: 'victim-tenant', userId: 'victim', projectId: 'victim-project' } as never) });
    const { task: t } = await r.run();
    assert.equal(t.status, 'completed');
    const job = r.calls[0]!;
    assert.deepEqual([job.tenantId, job.userId, job.projectId, job.runId, job.taskId], [r.actor.tenantId, r.actor.userId, r.h.aliceProject, r.runId, 'browse-1']);
  });

  it('refuses a scope that smuggles a credential field, before any worker runs', async () => {
    const r = rig(async () => okResult(), { scopeFor: () => ({ ...scope, cookie: 'session=abc' } as never) });
    const { task: t } = await r.run();
    assert.equal(t.status, 'failed');
    assert.equal(r.calls.length, 0);
    assert.equal(failureCode(t), 'JOB_INVALID');
  });

  it('a private or out-of-scope start page never reaches a worker', async () => {
    for (const startUrl of ['https://169.254.169.254/', 'https://127.0.0.1/', 'https://evil.net/']) {
      const r = rig(async () => okResult(), { scopeFor: () => ({ ...scope, startUrl }) });
      const { task: t } = await r.run();
      assert.equal(t.status, 'failed', startUrl);
      assert.equal(r.calls.length, 0, startUrl);
    }
  });

  describe('authority', () => {
    it('ownership revoked during lease acquisition denies deterministic dispatch',async()=>{
      let owned=true;const leases=new MemoryLeaseStore();const acquire=leases.acquire.bind(leases);
      leases.acquire=async(...args)=>{const result=await acquire(...args);owned=false;return result;};
      const r=rig(async()=>okResult(),{leases,authorise:async()=>owned});
      const {task:t}=await r.run();
      assert.equal(r.calls.length,0,'The original ownership check cannot survive an asynchronous lease wait');
      assert.equal(failureCode(t),'PERMISSION_REVOKED');assert.equal(objectCount(r.h),0);
    });
    it('another tenant cannot write into a project it does not own, even if the authorise hook is wrong (Drive itself refuses)', async () => {
      const r = rig(async () => okResult(), {}, (h) => h.bob);
      const { task: t } = await r.run({ projectId: r.h.aliceProject });
      assert.equal(t.status, 'failed');
      assert.equal(failureCode(t), 'PERMISSION_REVOKED');
      assert.equal(objectCount(r.h), 0);
    });

    it('a denied authorisation stops before dispatch: no worker, no lease, no writes', async () => {
      const r = rig(async () => okResult(), { authorise: async () => false });
      const { task: t } = await r.run();
      assert.equal(failureCode(t), 'PERMISSION_REVOKED');
      assert.equal(r.calls.length, 0);
      assert.equal(objectCount(r.h), 0);
    });

    it('permission revoked while the job runs: nothing is stored', async () => {
      let revoked = false;
      const r = rig(async () => { revoked = true; return okResult(); }, { authorise: async () => !revoked });
      const { task: t } = await r.run();
      assert.equal(t.status, 'failed');
      assert.equal(failureCode(t), 'PERMISSION_REVOKED');
      assert.equal(objectCount(r.h), 0);
      assert.equal(await r.leases.holder({ tenantId: r.actor.tenantId, runId: r.runId, taskId: 'browse-1' }), null);
    });

    it('permission revoked between two artifact writes: the second is not written', async () => {
      let checks = 0;
      const r = rig(async () => okResult(), { authorise: async () => ++checks <= 3 }); // initial admission, post-lease dispatch, artifact 1, then revoked
      const { task: t } = await r.run();
      assert.equal(failureCode(t), 'PERMISSION_REVOKED');
      assert.equal(objectCount(r.h), 1, 'only the write made while authorised exists');
    });
  });

  describe('leases and fencing', () => {
    it('a worker that lost its lease mid-job cannot store anything and its result is discarded', async () => {
      const r = rig(async (job, ctx) => {
        // takeover: the lease is released and another worker acquires it (higher token)
        await r.leases.release(ctx.lease);
        const other = await r.leases.acquire({ tenantId: job.tenantId, runId: job.runId, taskId: job.taskId }, 'worker-b', 5_000);
        assert.ok(other && other.token > ctx.lease.token);
        await new Promise((resolve) => ctx.signal.addEventListener('abort', resolve, { once: true })); // told to stop by the heartbeat
        return okResult(); // a late, stale answer
      });
      const { task: t } = await r.run();
      assert.equal(t.status, 'failed');
      assert.equal(failureCode(t), 'LEASE_LOST');
      assert.equal(objectCount(r.h), 0, 'stale worker wrote nothing');
      const holder = await r.leases.holder({ tenantId: r.actor.tenantId, runId: r.runId, taskId: 'browse-1' });
      assert.equal(holder?.workerId, 'worker-b', "the new holder's lease was not released by the stale worker");
    });

    it('a late result from a worker that lost its lease is refused even when it has no artifacts to store', async () => {
      const r = rig(async (job, ctx) => {
        await r.leases.release(ctx.lease);
        await r.leases.acquire({ tenantId: job.tenantId, runId: job.runId, taskId: job.taskId }, 'worker-b', 5_000);
        await new Promise((resolve) => ctx.signal.addEventListener('abort', resolve, { once: true }));
        return okResult({ artifacts: [] });
      });
      const { task: t } = await r.run();
      assert.equal(t.status, 'failed');
      assert.equal(failureCode(t), 'LEASE_LOST');
    });

    it('a lease lost between two artifact writes stops the second write', async () => {
      const r = rig(async () => okResult());
      const real = r.h.svc;
      let writes = 0;
      r.deps.drive = {
        listObjects: real.listObjects.bind(real),
        putServerObject: async (...args: Parameters<typeof real.putServerObject>) => {
          const stored = await real.putServerObject(...args);
          if (++writes === 1) {
            // takeover right after the first durable write: the worker is now stale
            const key = { tenantId: r.actor.tenantId, runId: r.runId, taskId: 'browse-1' };
            const mine = await r.leases.holder(key);
            await r.leases.release(mine!);
            await r.leases.acquire(key, 'worker-b', 5_000);
          }
          return stored;
        },
      };
      const { task: t } = await r.run();
      assert.equal(failureCode(t), 'LEASE_LOST');
      assert.equal(writes, 1, 'the stale worker made no second write');
      assert.equal(objectCount(r.h), 1);
    });

    it('two dispatches of the same task: one runs, the other is refused', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => { release = r; });
      const r = rig(async () => { await gate; return okResult(); });
      const first = r.run();
      await new Promise((resolve) => setTimeout(resolve, 30));
      const dup = createBrowserTaskHandler({ ...r.deps, workerId: 'worker-b' });
      const state = createCanonicalExecutionState({ projectId: r.h.aliceProject, runId: r.runId, tasks: [task()] });
      await assert.rejects(dup(state.tasks[0]!, state, new AbortController().signal), (e: Error & { code?: string }) => e.code === 'LEASE_HELD');
      release();
      const { task: t } = await first;
      assert.equal(t.status, 'completed');
      assert.equal(objectCount(r.h), 2);
    });

    it('the heartbeat keeps a long job alive past its first ttl', async () => {
      const r = rig(async () => { await new Promise((resolve) => setTimeout(resolve, 900)); return okResult(); }, { leaseTtlMs: 300 });
      const { task: t } = await r.run();
      assert.equal(t.status, 'completed');
    });
  });

  describe('untrusted results', () => {
    const rejected = async (result: Partial<BrowserWorkerResult>, code: string) => {
      const r = rig(async () => okResult(result));
      const { task: t } = await r.run();
      assert.equal(t.status, 'failed', JSON.stringify(result).slice(0, 80));
      assert.equal(failureCode(t), code, JSON.stringify(result).slice(0, 80));
      assert.equal(objectCount(r.h), 0, 'validation happens before the first write');
    };

    it('pages outside the scope or egress policy', async () => {
      await rejected({ finalUrl: 'https://evil.net/' }, 'RESULT_OUT_OF_SCOPE');
      await rejected({ visitedUrls: ['https://example.com/', 'https://169.254.169.254/latest/meta-data'] }, 'RESULT_OUT_OF_SCOPE');
      await rejected({ visitedUrls: ['https://[::ffff:7f00:1]/'] }, 'RESULT_OUT_OF_SCOPE');
      await rejected({ finalUrl: 'http://example.com/' }, 'RESULT_OUT_OF_SCOPE');
    });
    it('counters over the job limits or not whole numbers', async () => {
      await rejected({ navigations: 11 }, 'RESULT_OVER_LIMIT');
      await rejected({ navigations: -1 }, 'RESULT_OVER_LIMIT');
      await rejected({ navigations: 1.5 }, 'RESULT_OVER_LIMIT');
      await rejected({ responseBytes: 1_000_001 }, 'RESULT_OVER_LIMIT');
      await rejected({ responseBytes: Number.NaN }, 'RESULT_OVER_LIMIT');
      await rejected({ artifacts: [{ name: 'big.json', mediaType: 'application/json', bytes: Buffer.alloc(100_001, 65) }] }, 'RESULT_OVER_LIMIT');
    });
    it('artifacts with bad names, types, sizes or duplicates', async () => {
      const bad = (name: string, mediaType = 'text/plain', bytes: Uint8Array = Buffer.from('x')) => [{ name, mediaType, bytes }];
      for (const name of ['../escape.txt', 'a/b.txt', '.hidden', '', 'x'.repeat(81), 'with space.txt']) await rejected({ artifacts: bad(name) }, 'ARTIFACT_REJECTED');
      await rejected({ artifacts: bad('x.exe', 'application/x-msdownload') }, 'ARTIFACT_REJECTED');
      await rejected({ artifacts: bad('x.svg', 'image/svg+xml') }, 'ARTIFACT_REJECTED');
      await rejected({ artifacts: bad('empty.txt', 'text/plain', new Uint8Array()) }, 'ARTIFACT_REJECTED');
      await rejected({ artifacts: [...bad('same.txt'), ...bad('same.txt')] }, 'ARTIFACT_REJECTED');
    });
    it('credential-like artifacts are never stored, by name or by content, and the good ones in the same job are not stored either', async () => {
      const ghp = 'ghp_' + 'A1b2C3d4'.repeat(5);
      await rejected({ artifacts: [{ name: 'good.txt', mediaType: 'text/plain', bytes: Buffer.from('fine') }, { name: 'dump.txt', mediaType: 'text/plain', bytes: Buffer.from(`token=${ghp}`) }] }, 'CREDENTIAL_LIKE_CONTENT');
      await rejected({ artifacts: [{ name: 'service-account.json', mediaType: 'application/json', bytes: Buffer.from('{}') }] }, 'CREDENTIAL_LIKE_CONTENT');
      await rejected({ artifacts: [{ name: 'k.txt', mediaType: 'text/plain', bytes: Buffer.from('-----BEGIN PRIVATE KEY-----\nabc') }] }, 'CREDENTIAL_LIKE_CONTENT');
    });
    it('too many artifacts', async () => {
      const many = Array.from({ length: 51 }, (_, i) => ({ name: `a${i}.txt`, mediaType: 'text/plain', bytes: Buffer.from('x') }));
      await rejected({ artifacts: many }, 'RESULT_OVER_LIMIT');
    });
    it('a worker error never leaks its message into the task', async () => {
      const secret = 'sk-' + 'Z9y8X7w6'.repeat(4);
      const r = rig(async () => { throw new Error(`browser crashed with ${secret}`); });
      const { task: t } = await r.run();
      assert.equal(failureCode(t), 'WORKER_FAILED');
      assert.ok(!JSON.stringify(t).includes(secret));
    });
  });

  it('the worker\'s free-text summary is stored without any credential it may have copied from a page', async () => {
    const token = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3';
    const r = rig(async () => okResult({ summary: `page said: use ${token} to log in` }));
    const { task: t } = await r.run();
    assert.equal(t.status, 'completed');
    assert.ok(!JSON.stringify(t).includes(token));
    assert.match(String((t.output as { summary: string }).summary), /page said: use \[redacted\] to log in/);
  });

  describe('idempotency and recovery', () => {
    it('a retry reuses artifacts an earlier attempt stored, so a crash between writes leaves no duplicates', async () => {
      const r = rig(async () => okResult());
      let writes = 0;
      const real = r.h.svc;
      const flaky = { listObjects: real.listObjects.bind(real), putServerObject: async (...args: Parameters<typeof real.putServerObject>) => { if (++writes === 2) throw new StorageError('PROVIDER_UNAVAILABLE', 'down', 503); return real.putServerObject(...args); } };
      r.deps.drive = flaky;
      const first = await r.run();
      assert.equal(first.task.status, 'failed');
      assert.equal(failureCode(first.task), 'STORAGE_FAILED');
      assert.equal(objectCount(r.h), 1);
      r.deps.drive = real; // storage recovered; same run and task, a new attempt
      const second = await r.run();
      assert.equal(second.task.status, 'completed');
      assert.equal(objectCount(r.h), 2, 'the first artifact was reused, not stored again');
      assert.ok(second.task.evidence.some((e) => /reused from an earlier attempt/.test(e.summary)));
      const third = await r.run();
      assert.equal(third.task.status, 'completed');
      assert.equal(objectCount(r.h), 2, 'a full replay stores nothing new');
    });

    it('reuse requires identical content: the same name with different bytes is a new object', async () => {
      let version = 1;
      const r = rig(async () => okResult({ artifacts: [{ name: 'notes.json', mediaType: 'application/json', bytes: Buffer.from(`{"version":${version}}`) }] }));
      await r.run();
      version = 2;
      const { task: t } = await r.run();
      assert.equal(t.status, 'completed');
      assert.equal(objectCount(r.h), 2);
      assert.ok(!t.evidence.some((e) => /reused/.test(e.summary)));
    });

    it('the same task in another tenant never reuses or sees this tenant\'s artifacts', async () => {
      const a = rig(async () => okResult());
      await a.run();
      const objectsBefore = objectCount(a.h);
      a.deps.actor = a.h.bob;
      const state = createCanonicalExecutionState({ projectId: a.h.bobProject, runId: a.runId, tasks: [task()] });
      await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(state, { browser_automation: createBrowserTaskHandler(a.deps) });
      assert.equal(state.tasks[0]!.status, 'completed');
      assert.equal(objectCount(a.h), objectsBefore + 2);
      const bobs = await a.h.svc.listObjects(a.h.bob, { projectId: a.h.bobProject });
      const alices = await a.h.svc.listObjects(a.h.alice, { projectId: a.h.aliceProject });
      assert.equal(bobs.length, 2);
      assert.equal(alices.length, 2);
      assert.equal(new Set([...bobs, ...alices].map((o) => o.id)).size, 4);
    });
  });

  describe('admission (bounded concurrency, tenant fairness)', () => {
    const track = () => { const s = { now: 0, peak: 0 }; return { s, enter: () => { s.now++; s.peak = Math.max(s.peak, s.now); }, leave: () => { s.now--; } }; };

    it('the same tenant queues behind its own cap, one job at a time', async () => {
      const t = track();
      const admission = new AdmissionController({ maxConcurrent: 4, maxPerTenant: 1, maxQueuedPerTenant: 5, maxQueuedTotal: 10 });
      const r = rig(async () => { t.enter(); await new Promise((x) => setTimeout(x, 40)); t.leave(); return okResult(); }, { admission });
      const results = await Promise.all(['a', 'b', 'c'].map((id) => r.run({ taskId: id })));
      assert.ok(results.every((x) => x.task.status === 'completed'));
      assert.equal(t.s.peak, 1, 'the tenant never ran two browsers at once');
    });

    it('two tenants run side by side while each respects its own cap', async () => {
      const t = track();
      const admission = new AdmissionController({ maxConcurrent: 2, maxPerTenant: 1, maxQueuedPerTenant: 5, maxQueuedTotal: 10 });
      const slow = async () => { t.enter(); await new Promise((x) => setTimeout(x, 80)); t.leave(); return okResult(); };
      const alice = rig(slow, { admission });
      const bobHandler = createBrowserTaskHandler({ ...alice.deps, actor: alice.h.bob, admission });
      const stateB = createCanonicalExecutionState({ projectId: alice.h.bobProject, runId: randomUUID(), tasks: [task('b-1')] });
      const [a1, b1] = await Promise.all([
        alice.run({ taskId: 'a-1' }),
        new ExecutionScheduler(new InMemoryExecutionStateStore()).run(stateB, { browser_automation: bobHandler }),
      ]);
      assert.equal(a1.task.status, 'completed');
      assert.equal(b1.tasks[0]!.status, 'completed');
      assert.equal(t.s.peak, 2, 'different tenants overlap');
    });

    it('a full queue fails fast with a typed error and never reaches the worker', async () => {
      const admission = new AdmissionController({ maxConcurrent: 1, maxPerTenant: 1, maxQueuedPerTenant: 1, maxQueuedTotal: 1 });
      let release!: () => void;
      const gate = new Promise<void>((x) => { release = x; });
      const r = rig(async () => { await gate; return okResult(); }, { admission });
      const running = r.run({ taskId: 'a' });
      await new Promise((x) => setTimeout(x, 30));
      const queued = r.run({ taskId: 'b' });
      await new Promise((x) => setTimeout(x, 30));
      const refused = await r.run({ taskId: 'c' });
      assert.equal(failureCode(refused.task), 'QUEUE_FULL');
      assert.equal(r.calls.length, 1, 'only the running job reached the worker');
      release();
      await Promise.all([running, queued]);
    });

    it('authority revoked while a job waits in the queue stops it: the worker is never started', async () => {
      const admission = new AdmissionController({ maxConcurrent: 1, maxPerTenant: 1, maxQueuedPerTenant: 5, maxQueuedTotal: 5 });
      let revoked = false;
      let release!: () => void;
      const gate = new Promise<void>((x) => { release = x; });
      const r = rig(async () => { await gate; return okResult(); }, { admission, authorise: async () => !revoked });
      const first = r.run({ taskId: 'first' });
      await new Promise((x) => setTimeout(x, 30));
      const second = r.run({ taskId: 'second' });
      await new Promise((x) => setTimeout(x, 30));
      revoked = true;
      release();
      const [, waited] = await Promise.all([first, second]);
      assert.equal(failureCode(waited.task), 'PERMISSION_REVOKED');
      assert.deepEqual(r.calls.map((j) => j.taskId), ['first'], 'the queued job never started');
    });

    it('a failed or cancelled job gives its slot back', async () => {
      const admission = new AdmissionController({ maxConcurrent: 1, maxPerTenant: 1, maxQueuedPerTenant: 5, maxQueuedTotal: 5 });
      let n = 0;
      const r = rig(async () => { if (++n === 1) throw new Error('boom'); return okResult(); }, { admission });
      const [bad, good] = await Promise.all([r.run({ taskId: 'x' }), r.run({ taskId: 'y' })]);
      assert.equal(bad.task.status, 'failed');
      assert.equal(good.task.status, 'completed');
      assert.deepEqual([admission.stats().running, admission.stats().queued], [0, 0]);
    });
  });

  describe('cancellation and limits', () => {
    it('run cancellation reaches the worker, stores nothing and releases the lease', async () => {
      const ctl = new AbortController();
      let sawAbort = false;
      const r = rig(async (_job, ctx) => {
        setTimeout(() => ctl.abort(), 20);
        await new Promise((resolve) => ctx.signal.addEventListener('abort', resolve, { once: true }));
        sawAbort = true;
        return okResult();
      });
      const started = Date.now();
      const { task: t } = await r.run({ signal: ctl.signal });
      assert.equal(sawAbort, true);
      assert.ok(Date.now() - started < 2_000, 'cancellation must stop the worker promptly, not wait for the job deadline');
      assert.equal(failureCode(t), 'CANCELLED', 'reported as a cancellation, not as a timeout');
      assert.notEqual(t.status, 'completed');
      assert.equal(objectCount(r.h), 0);
      assert.equal(await r.leases.holder({ tenantId: r.actor.tenantId, runId: r.runId, taskId: 'browse-1' }), null);
    });

    it('the job deadline stops a worker that never answers', async () => {
      const r = rig(async (_job, ctx) => { await new Promise((resolve) => ctx.signal.addEventListener('abort', resolve, { once: true })); return okResult(); },
        { scopeFor: () => ({ ...scope, limits: { ...limits, maxDurationMs: 60 } }) });
      const { task: t } = await r.run();
      assert.equal(failureCode(t), 'JOB_TIMEOUT');
      assert.equal(objectCount(r.h), 0);
    });
  });
});
