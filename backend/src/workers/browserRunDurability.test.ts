/**
 * Browser runs survive the request and the process that accepted them (the Cloud Run durability gap): the run is a stored record, any
 * instance can execute it, cancel it or recover it, and two instances can never run it twice. The browser host is a fake port; Drive is
 * the in-memory harness; the lease store is the reference store every durable store must match.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createTenantContext } from '../security/tenantContext.js';
import { harness } from '../storage/testing/harness.js';
import { BrowserRunError, executeBrowserRun, prepareBrowserRun, BROWSER_MAX_ACTIVE_PER_TENANT, type BrowserCapabilityDeps } from './browserCapability.js';
import { MemoryBrowserRunStore } from './browserRunStore.js';
import { MemoryLeaseStore } from './leaseStore.js';
import type { BrowserWorkerPort, BrowserWorkerResult } from './browserTaskHandler.js';

const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'));
const request = () => ({
  goal: 'Open page two of the quotes site and confirm the title', startUrl: 'https://quotes.toscrape.com/', allowedOrigins: ['https://quotes.toscrape.com'],
  plan: { steps: [{ op: 'click', selector: 'li.next > a' }, { op: 'extractText', selector: 'h1 a', name: 'title' }, { op: 'screenshot', name: 'page.png' }],
    expect: [{ kind: 'extracted', name: 'title', equals: 'Quotes to Scrape' }, { kind: 'artifact', name: 'page.png' }, { kind: 'finalUrlPrefix', prefix: 'https://quotes.toscrape.com/page/2' }] },
});

function setup() {
  const h = harness();
  const runs = new MemoryBrowserRunStore();
  const leases = new MemoryLeaseStore();
  const calls = { started: 0, aborted: 0 };
  let mode: 'ok' | 'hang' = 'ok';
  const worker: BrowserWorkerPort = {
    run: async (_job, ctx): Promise<BrowserWorkerResult> => {
      calls.started += 1;
      if (mode === 'hang') return new Promise((_, reject) => ctx.signal.addEventListener('abort', () => { calls.aborted += 1; reject(new Error('stopped')); }));
      return { finalUrl: 'https://quotes.toscrape.com/page/2/', visitedUrls: ['https://quotes.toscrape.com/', 'https://quotes.toscrape.com/page/2/'], navigations: 2, responseBytes: 1_000, summary: 'done', extracted: { title: 'Quotes to Scrape' }, artifacts: [{ name: 'page.png', mediaType: 'image/png', bytes: PNG }], metrics: { consequentialActions: 0 } };
    },
  };
  // two instances of the API: same database and lease store, different worker ids
  const instance = (workerId: string): BrowserCapabilityDeps & { runs: MemoryBrowserRunStore } => ({
    worker, leases, drive: h.svc, runs, workerId, storeFor: (u) => runs.stateStore(u),
    authoriseProject: async (actor, projectId) => h.svc.listObjects(actor, { projectId, limit: 1 }).then(() => true, () => false),
  });
  const ctx = (u: string) => createTenantContext({ userId: u, via: 'local_jwt' });
  return { h, runs, calls, instance, ctx, setMode: (m: 'ok' | 'hang') => { mode = m; } };
}
const status = async (runs: MemoryBrowserRunStore, userId: string, runId: string) => (await runs.load(userId, runId))!;

describe('durable browser runs', () => {
  it('a run accepted by one instance is executed by another, because it is a stored record and not a promise in the request process', async () => {
    const t = setup();
    const { runId } = await prepareBrowserRun(t.ctx(t.h.alice.userId), request(), t.instance('instance-a'));
    assert.equal((await status(t.runs, t.h.alice.userId, runId)).status, 'queued');
    assert.equal(t.calls.started, 0, 'nothing runs inside the accepting request');
    assert.equal(await executeBrowserRun(runId, t.instance('instance-b')), 'finished');
    const done = await status(t.runs, t.h.alice.userId, runId);
    assert.equal(done.status, 'completed');
    assert.equal(done.state.tasks[0]!.output && (done.state.tasks[0]!.output as { outcomeVerified?: boolean }).outcomeVerified, true);
    assert.equal(await executeBrowserRun(runId, t.instance('instance-c')), 'already_finished', 'a finished run is reported, never rerun');
    assert.equal(t.calls.started, 1);
  });

  it('two instances executing the same run at once run the browser exactly once', async () => {
    const t = setup();
    const { runId } = await prepareBrowserRun(t.ctx(t.h.alice.userId), request(), t.instance('a'));
    const outcomes = await Promise.all([executeBrowserRun(runId, t.instance('a')), executeBrowserRun(runId, t.instance('b'))]);
    assert.equal(outcomes.filter((o) => o === 'finished').length, 1, 'exactly one executor ran the run');
    assert.ok(outcomes.every((o) => ['finished', 'held_by_live_worker', 'already_finished'].includes(o)));
    assert.equal(t.calls.started, 1, 'the second executor must not start a second browser');
    assert.equal((await status(t.runs, t.h.alice.userId, runId)).status, 'completed');
  });

  it('a cancel set on one instance stops the browser running on another', async () => {
    const t = setup();
    t.setMode('hang');
    const { runId } = await prepareBrowserRun(t.ctx(t.h.alice.userId), request(), t.instance('a'));
    const running = executeBrowserRun(runId, t.instance('instance-a'), { cancelPollMs: 10 });
    for (let i = 0; i < 100 && t.calls.started === 0; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(t.calls.started, 1);
    assert.equal(await t.runs.requestCancel(t.h.alice.userId, runId), 'requested', 'cancel arrives through the shared record, not an in-memory map');
    await running;
    assert.equal(t.calls.aborted, 1, 'the browser was stopped');
    const done = await status(t.runs, t.h.alice.userId, runId);
    assert.notEqual(done.status, 'completed');
    assert.ok(['cancelled', 'failed', 'blocked'].includes(done.status));
    assert.equal(done.cancelRequested, true);
  });

  it('cancelling a run that never started finishes it as cancelled and never launches the browser', async () => {
    const t = setup();
    const { runId } = await prepareBrowserRun(t.ctx(t.h.alice.userId), request(), t.instance('a'));
    assert.equal(await t.runs.requestCancel(t.h.alice.userId, runId), 'requested');
    assert.equal(await executeBrowserRun(runId, t.instance('b')), 'finished');
    assert.equal((await status(t.runs, t.h.alice.userId, runId)).status, 'cancelled');
    assert.equal(t.calls.started, 0);
    assert.equal(await t.runs.requestCancel(t.h.alice.userId, runId), 'already_finished');
  });

  it('only the owner can cancel or read a run', async () => {
    const t = setup();
    const { runId } = await prepareBrowserRun(t.ctx(t.h.alice.userId), request(), t.instance('a'));
    assert.equal(await t.runs.requestCancel(t.h.bob.userId, runId), 'not_found');
    assert.equal(await t.runs.load(t.h.bob.userId, runId), null);
    assert.equal(await t.runs.isCancelRequested(runId), false, 'a refused cancel leaves no flag behind');
    await assert.rejects(t.runs.stateStore(t.h.bob.userId).save({ ...(await status(t.runs, t.h.alice.userId, runId)).state }), /no longer authoritative/);
  });

  it('a run left running by a dead instance is recovered, and is not recovered while a live worker holds it', async () => {
    const t = setup();
    const { runId } = await prepareBrowserRun(t.ctx(t.h.alice.userId), request(), t.instance('a'));
    // the instance died mid-task: state says running, nobody holds a lease
    const record = await status(t.runs, t.h.alice.userId, runId);
    record.state.tasks[0]!.status = 'running'; record.state.tasks[0]!.attempts = 1;
    await t.runs.stateStore(t.h.alice.userId).save(record.state);

    // a live worker still holds the task: recovery must leave it alone
    const held = await t.instance('live').leases.acquire({ tenantId: t.h.alice.tenantId, runId, taskId: record.state.tasks[0]!.id }, 'live', 60_000);
    assert.ok(held);
    assert.equal(await executeBrowserRun(runId, t.instance('b')), 'held_by_live_worker');
    assert.equal(t.calls.started, 0);
    await t.instance('live').leases.release(held!);

    assert.equal(await executeBrowserRun(runId, t.instance('b')), 'finished');
    assert.equal((await status(t.runs, t.h.alice.userId, runId)).status, 'completed');
  });

  it('the active-run ceiling is counted from the shared record, so scaling out does not multiply it', async () => {
    const t = setup();
    for (let i = 0; i < BROWSER_MAX_ACTIVE_PER_TENANT; i++) await prepareBrowserRun(t.ctx(t.h.alice.userId), request(), t.instance(`instance-${i}`));
    await assert.rejects(prepareBrowserRun(t.ctx(t.h.alice.userId), request(), t.instance('one-more')), (e) => e instanceof BrowserRunError && e.status === 429 && e.code === 'RUN_LIMIT');
    // another tenant is not affected by Alice's runs
    await prepareBrowserRun(t.ctx(t.h.bob.userId), request(), t.instance('x'));
    assert.equal(await t.runs.countActive(t.h.alice.tenantId), BROWSER_MAX_ACTIVE_PER_TENANT);
  });

  it('lists only stale unfinished runs for recovery', async () => {
    let now = 1_000_000;
    const t = setup();
    const runs = new MemoryBrowserRunStore(() => now);
    const deps = { ...t.instance('a'), runs, storeFor: (u: string) => runs.stateStore(u) };
    const { runId } = await prepareBrowserRun(t.ctx(t.h.alice.userId), request(), deps);
    assert.deepEqual((await runs.listRecoverable(120_000, 10)).map((r) => r.runId), [], 'fresh runs are left to their dispatcher');
    now += 121_000;
    assert.deepEqual((await runs.listRecoverable(120_000, 10)).map((r) => r.runId), [runId]);
    await executeBrowserRun(runId, deps);
    assert.deepEqual((await runs.listRecoverable(0, 10)).map((r) => r.runId), [], 'finished runs are never recovered');
  });
});
