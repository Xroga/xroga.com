import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { parseBrowserJob } from './browserJob.js';
import { createCoordinatorServer, NonceCache, RemoteBrowserWorker, signRequest, verifyRequest } from './browserCoordinator.js';
import type { BrowserModelGateway } from './containerBrowserWorker.js';
import { BrowserTaskError, type BrowserWorkerPort } from './browserTaskHandler.js';

const SECRET = 's'.repeat(40);
const job = parseBrowserJob({
  version: 1, tenantId: 't1', userId: 'u1', projectId: 'p1', runId: 'r1', taskId: 'k1', attempt: 1,
  allowedOrigins: ['https://example.com'], startUrl: 'https://example.com/',
  limits: { maxDurationMs: 60_000, maxNavigations: 5, maxRedirects: 1, maxPages: 1, maxResponseBytes: 1_000_000, maxArtifactBytes: 1_000_000, maxModelCostMicros: 50_000 },
});
const lease = { tenantId: 't1', runId: 'r1', taskId: 'k1', workerId: 'api-1', token: 7, expiresAt: Date.now() + 60_000 };
const plan = { steps: [{ op: 'aiObserve' as const, instruction: 'find it', name: 'targets' }], expect: [] };

// the host-side fake: asks the relayed gateway once, then returns an artifact; or hangs until cancelled; or fails with a chosen code
let mode: 'ok' | 'hang' | 'fail' = 'ok';
let failCode = 'RESULT_OUT_OF_SCOPE';
let cancelled = false;
let seenOnHost: unknown;
const hostWorker: BrowserWorkerPort & { runWithGateway: Function } = {
  run: async () => { throw new Error('use runWithGateway'); },
  runWithGateway: async (j: typeof job, ctx: { signal: AbortSignal; plan: unknown }, gw: BrowserModelGateway) => {
    seenOnHost = { job: j, plan: ctx.plan };
    if (mode === 'hang') return new Promise((_, reject) => ctx.signal.addEventListener('abort', () => { cancelled = true; reject(new BrowserTaskError('CANCELLED', 'stopped')); }));
    if (mode === 'fail') throw new BrowserTaskError(failCode as never, 'host says so');
    const r = await gw.generate({ messages: [] }, { job: j, remainingMicros: 50_000, signal: ctx.signal });
    return { finalUrl: 'https://example.com/', visitedUrls: ['https://example.com/'], navigations: 1, responseBytes: 10, summary: 'ok', extracted: { model: (r.result as any).answer }, artifacts: [{ name: 'a.png', mediaType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }], metrics: { modelUsage: { calls: 1, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costMicros: r.costMicros, refused: 0 } } };
  },
};

let base = ''; let server: ReturnType<typeof createCoordinatorServer>;
before(async () => { server = createCoordinatorServer({ secret: SECRET, worker: hostWorker, maxConcurrent: 1 }); await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r())); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(() => { server.close(); });

describe('coordinator authentication', () => {
  it('accepts a valid signature once; refuses tampered body, wrong secret, stale or future time, and nonce reuse', () => {
    const nonces = new NonceCache(); const body = '{"a":1}';
    const h = signRequest(SECRET, 'POST', '/v1/jobs', body);
    assert.equal(verifyRequest(SECRET, nonces, 'POST', '/v1/jobs', body, h), true);
    assert.equal(verifyRequest(SECRET, nonces, 'POST', '/v1/jobs', body, h), false, 'replay');
    assert.equal(verifyRequest(SECRET, new NonceCache(), 'POST', '/v1/jobs', '{"a":2}', signRequest(SECRET, 'POST', '/v1/jobs', body)), false, 'tampered body');
    assert.equal(verifyRequest(SECRET, new NonceCache(), 'POST', '/v1/jobs/x', body, signRequest(SECRET, 'POST', '/v1/jobs', body)), false, 'other path');
    assert.equal(verifyRequest(SECRET, new NonceCache(), 'POST', '/v1/jobs', body, signRequest('w'.repeat(40), 'POST', '/v1/jobs', body)), false, 'wrong secret');
    assert.equal(verifyRequest(SECRET, new NonceCache(), 'POST', '/v1/jobs', body, signRequest(SECRET, 'POST', '/v1/jobs', body, Date.now() - 120_000)), false, 'stale');
    assert.equal(verifyRequest(SECRET, new NonceCache(), 'POST', '/v1/jobs', body, signRequest(SECRET, 'POST', '/v1/jobs', body, Date.now() + 120_000)), false, 'future');
  });
  it('the server answers 401 to an unsigned or replayed request, and the client refuses a non-https remote URL', async () => {
    assert.equal((await fetch(`${base}/v1/jobs`, { method: 'POST', body: '{}' })).status, 401);
    const body = JSON.stringify({ job, plan, lease });
    const h = signRequest(SECRET, 'POST', '/v1/jobs', body);
    mode = 'fail';
    const first = await fetch(`${base}/v1/jobs`, { method: 'POST', headers: h, body }); await first.text();
    assert.equal(first.status, 200);
    assert.equal((await fetch(`${base}/v1/jobs`, { method: 'POST', headers: h, body })).status, 401, 'replayed request');
    assert.throws(() => new RemoteBrowserWorker({ baseUrl: 'http://browser-host.example', secret: SECRET }), /https/);
    assert.throws(() => new RemoteBrowserWorker({ baseUrl: base, secret: 'short' }), /32 bytes/);
  });
  it('the host re-validates the job and plan with the same strict parsers', async () => {
    const body = JSON.stringify({ job: { ...job, allowedOrigins: ['http://10.0.0.5'] }, plan, lease });
    assert.equal((await fetch(`${base}/v1/jobs`, { method: 'POST', headers: signRequest(SECRET, 'POST', '/v1/jobs', body), body })).status, 400);
    const body2 = JSON.stringify({ job, plan: { steps: [{ op: 'goto', url: 'https://evil.example/' }] }, lease });
    assert.equal((await fetch(`${base}/v1/jobs`, { method: 'POST', headers: signRequest(SECRET, 'POST', '/v1/jobs', body2), body: body2 })).status, 400);
  });
});

describe('remote worker round trip', () => {
  it('relays the model request back to the API gateway, returns the result and artifacts', async () => {
    mode = 'ok';
    const asked: unknown[] = [];
    const gateway: BrowserModelGateway = { generate: async (p, ctx) => { asked.push({ p, remaining: ctx.remainingMicros }); return { result: { answer: 42 }, inputTokens: 100, outputTokens: 10, costMicros: 1_234 }; } };
    const remote = new RemoteBrowserWorker({ baseUrl: base, secret: SECRET, gateway });
    const r = await remote.run(job, { signal: new AbortController().signal, lease, plan });
    assert.equal(asked.length, 1); assert.equal((asked[0] as any).remaining, 50_000);
    assert.deepEqual(r.extracted, { model: 42 });
    assert.deepEqual([...r.artifacts[0]!.bytes], [1, 2, 3]);
    assert.equal(r.metrics?.modelUsage?.costMicros, 1_234);
    assert.equal((seenOnHost as any).job.tenantId, 't1');
  });
  it('without an API model route the host gets a refusal, not a model', async () => {
    mode = 'ok';
    const remote = new RemoteBrowserWorker({ baseUrl: base, secret: SECRET });
    await assert.rejects(remote.run(job, { signal: new AbortController().signal, lease, plan }), (e) => e instanceof BrowserTaskError && e.code === 'WORKER_FAILED');
  });
  it('passes through only legitimate worker failure codes; anything else becomes WORKER_FAILED', async () => {
    mode = 'fail'; failCode = 'RESULT_OUT_OF_SCOPE';
    const remote = new RemoteBrowserWorker({ baseUrl: base, secret: SECRET });
    await assert.rejects(remote.run(job, { signal: new AbortController().signal, lease, plan }), (e) => e instanceof BrowserTaskError && e.code === 'RESULT_OUT_OF_SCOPE');
    failCode = 'PERMISSION_REVOKED';
    await assert.rejects(remote.run(job, { signal: new AbortController().signal, lease, plan }), (e) => e instanceof BrowserTaskError && e.code === 'WORKER_FAILED');
  });
  it('cancelling on the API side stops the browser on the host', async () => {
    mode = 'hang'; cancelled = false;
    const remote = new RemoteBrowserWorker({ baseUrl: base, secret: SECRET });
    const ac = new AbortController();
    const p = remote.run(job, { signal: ac.signal, lease, plan });
    await new Promise((r) => setTimeout(r, 150));
    ac.abort();
    await assert.rejects(p, (e) => e instanceof BrowserTaskError);
    for (let i = 0; i < 40 && !cancelled; i++) await new Promise((r) => setTimeout(r, 25));
    assert.equal(cancelled, true);
  });
});
