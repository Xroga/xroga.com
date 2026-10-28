import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { createTenantContext } from '../security/tenantContext.js';
import { harness, type Harness } from '../storage/testing/harness.js';
import { executeBrowserRun, prepareBrowserRun } from '../workers/browserCapability.js';
import { MemoryBrowserRunStore } from '../workers/browserRunStore.js';
import { MemoryLeaseStore } from '../workers/leaseStore.js';
import type { BrowserWorkerPort } from '../workers/browserTaskHandler.js';
import { createBrowserRunInternalRouter } from './browserRunInternal.js';
import type { BrowserRunRuntime } from './browserRuns.js';

const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64'));
const request = () => ({
  goal: 'Open page two', startUrl: 'https://quotes.toscrape.com/', allowedOrigins: ['https://quotes.toscrape.com'],
  plan: { steps: [{ op: 'click', selector: 'li.next > a' }, { op: 'extractText', selector: 'h1 a', name: 'title' }, { op: 'screenshot', name: 'page.png' }],
    expect: [{ kind: 'extracted', name: 'title', equals: 'Quotes to Scrape' }, { kind: 'artifact', name: 'page.png' }] },
});

describe('internal browser execution and recovery', () => {
  let h: Harness; let server: ReturnType<ReturnType<typeof express>['listen']>; let base = '';
  const runs = new MemoryBrowserRunStore(); const dispatched: string[] = [];
  let executed = 0; let failDispatch = false;
  const env: Record<string, string | undefined> = {};
  let runtime: BrowserRunRuntime | null = null;
  const worker: BrowserWorkerPort = { run: async () => { executed += 1; return { finalUrl: 'https://quotes.toscrape.com/page/2/', visitedUrls: ['https://quotes.toscrape.com/'], navigations: 1, responseBytes: 10, summary: 'ok', extracted: { title: 'Quotes to Scrape' }, artifacts: [{ name: 'page.png', mediaType: 'image/png', bytes: PNG }], metrics: { consequentialActions: 0 } }; } };

  before(async () => {
    h = harness();
    runtime = {
      worker, leases: new MemoryLeaseStore(), drive: h.svc, runs, workerId: 'w', storeFor: (u) => runs.stateStore(u),
      authoriseProject: async () => true,
      dispatcher: { dispatch: async (id) => { if (failDispatch) throw new Error('queue down'); dispatched.push(id); } },
    };
    const app = express();
    app.use('/internal/browser', express.json({ limit: '4kb' }), createBrowserRunInternalRouter({
      runtime: () => runtime, env: env as NodeJS.ProcessEnv,
      verify: async (authorization, config) => authorization === 'Bearer tasks-token' ? config.serviceAccountEmail === 'tasks@p.iam.gserviceaccount.com' && config.audience === 'https://api/execute'
        : authorization === 'Bearer scheduler-token' ? config.serviceAccountEmail === 'scheduler@p.iam.gserviceaccount.com' && config.audience === 'https://api/recover' : false,
    }));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal/browser`;
  });
  after(() => { server.close(); });

  const enable = () => Object.assign(env, { XROGA_BROWSER_INTERNAL_MODE: 'cloud', XROGA_BROWSER_EXECUTE_AUDIENCE: 'https://api/execute', XROGA_BROWSER_EXECUTE_SERVICE_ACCOUNT: 'tasks@p.iam.gserviceaccount.com', XROGA_BROWSER_RECOVER_AUDIENCE: 'https://api/recover', XROGA_BROWSER_RECOVER_SERVICE_ACCOUNT: 'scheduler@p.iam.gserviceaccount.com' });
  const post = (path: string, token?: string, body?: unknown) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body ?? {}) });
  const prepare = () => prepareBrowserRun(createTenantContext({ userId: h.alice.userId, via: 'local_jwt' }), request(), runtime!);

  it('is off until enabled, and refuses missing, wrong and cross-endpoint tokens before touching a run', async () => {
    const { runId } = await prepare();
    assert.equal((await post('/execute', 'tasks-token', { runId })).status, 503);
    enable();
    assert.equal((await post('/execute', undefined, { runId })).status, 401);
    assert.equal((await post('/execute', 'wrong', { runId })).status, 401);
    assert.equal((await post('/execute', 'scheduler-token', { runId })).status, 401, 'the scheduler identity cannot execute a run');
    assert.equal((await post('/recover', 'tasks-token')).status, 401, 'the queue identity cannot trigger a sweep');
    assert.equal(executed, 0);
  });

  it('executes the named run for the queue, once, and reports a repeat as already finished', async () => {
    enable();
    const { runId } = await prepare();
    const first = await post('/execute', 'tasks-token', { runId });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { outcome: 'finished' });
    assert.equal((await runs.load(h.alice.userId, runId))!.status, 'completed');
    assert.deepEqual(await (await post('/execute', 'tasks-token', { runId })).json(), { outcome: 'already_finished' });
    assert.equal((await post('/execute', 'tasks-token', { runId: '00000000-0000-4000-8000-000000000000' })).status, 200, 'an unknown run needs no retry');
    assert.equal((await post('/execute', 'tasks-token', { runId: 'nope' })).status, 400);
    assert.equal((await post('/execute', 'tasks-token', { runId, extra: 1 })).status, 400);
  });

  it('the recovery sweep re-dispatches stale unfinished runs and returns counts only', async () => {
    enable();
    let clock = Date.now();
    const stale = new MemoryBrowserRunStore(() => clock);
    runtime = { ...runtime!, runs: stale, storeFor: (u) => stale.stateStore(u) };
    const { runId } = await prepareBrowserRun(createTenantContext({ userId: h.alice.userId, via: 'local_jwt' }), request(), runtime);
    clock += 10 * 60_000;
    dispatched.length = 0;
    const r = await post('/recover', 'scheduler-token');
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { candidates: 1, dispatched: 1, failed: 0 });
    assert.deepEqual(dispatched, [runId]);
    failDispatch = true;
    const failing = await post('/recover', 'scheduler-token');
    const body = await failing.json() as { dispatched: number; failed: number };
    assert.equal(failing.status, 200);
    assert.ok(body.failed === 0 || body.dispatched === 0, 'a dispatch failure is counted, not thrown');
    failDispatch = false;
    assert.equal(await executeBrowserRun(runId, runtime), 'finished');
  });

  it('answers 503 when browser automation is not configured, without revealing why', async () => {
    enable();
    const saved = runtime; runtime = null;
    const r = await post('/recover', 'scheduler-token');
    assert.equal(r.status, 503);
    runtime = saved;
  });
});
