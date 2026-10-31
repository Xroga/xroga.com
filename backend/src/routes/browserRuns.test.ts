/**
 * /api/browser/runs over real HTTP: issued TenantContext only, canonical scheduler and store, Drive evidence, owner-scoped reads,
 * outcome (postconditions) decides completion, cancellation. The browser host is a fake BrowserWorkerPort here; the real host is
 * exercised by the container and Compute Engine runs.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { createTenantContext, requireTenantContext,type TenantContext } from '../security/tenantContext.js';
import { harness, type Harness } from '../storage/testing/harness.js';
import { MemoryLeaseStore } from '../workers/leaseStore.js';
import { executeBrowserRun } from '../workers/browserCapability.js';
import { InProcessDispatcher } from '../workers/browserRunDispatch.js';
import { MemoryBrowserRunStore } from '../workers/browserRunStore.js';
import type { BrowserWorkerPort, BrowserWorkerResult } from '../workers/browserTaskHandler.js';
import { createBrowserRunsRouter, type BrowserRunRuntime } from './browserRuns.js';

let h: Harness; let base = ''; let server: ReturnType<ReturnType<typeof express>['listen']>;
let configured = true;
let behaviour: 'ok' | 'wrongValue' | 'hang' = 'ok';
let hangAborted = false;let workerAuthority:TenantContext|undefined;
const runs = new MemoryBrowserRunStore();

const worker: BrowserWorkerPort = {
  run: async (job, ctx): Promise<BrowserWorkerResult> => {
    workerAuthority=requireTenantContext(ctx.modelAuthority?.context);assert.equal(workerAuthority.userId,job.userId);assert.equal(workerAuthority.tenantId,job.tenantId);assert.equal(workerAuthority.provenance,'persisted_owner');await ctx.modelAuthority!.revalidate();
    if (behaviour === 'hang') return new Promise((_, reject) => ctx.signal.addEventListener('abort', () => { hangAborted = true; reject(new Error('stopped')); }));
    return { finalUrl: 'https://quotes.toscrape.com/page/2/', visitedUrls: ['https://quotes.toscrape.com/', 'https://quotes.toscrape.com/page/2/'], navigations: 2, responseBytes: 1_000, summary: 'done',
      extracted: { title: behaviour === 'wrongValue' ? 'Login' : 'Quotes to Scrape' }, artifacts: [{ name: 'page.png', mediaType: 'image/png', bytes: new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')) }], metrics: { consequentialActions: 0 } };
  },
};

before(async () => {
  h = harness();
  const deps = {
    worker, leases: new MemoryLeaseStore(), drive: h.svc, storeFor: (userId: string) => runs.stateStore(userId), workerId: 'test', runs,
    authoriseProject: async (actor: { userId: string; tenantId: string }, projectId: string) => h.svc.listObjects(actor, { projectId, limit: 1 }).then(() => true, () => false),
  } as Omit<BrowserRunRuntime, 'dispatcher'>;
  const runtime: BrowserRunRuntime = { ...deps, dispatcher: new InProcessDispatcher((runId) => executeBrowserRun(runId, deps), (_id, e) => { throw e; }) };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // what authMiddleware does: an ISSUED context; x-test-forge simulates a caller without one
    const as = req.header('x-test-user');
    if (as) (req as unknown as { tenantContext: TenantContext }).tenantContext = req.header('x-test-forge') ? ({ userId: as, tenantId: as } as TenantContext) : createTenantContext({ userId: as, via: 'local_jwt' });
    next();
  });
  app.use('/api/browser/runs', createBrowserRunsRouter(() => (configured ? runtime : null)));
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/browser/runs`;
});
after(() => { server.close(); });

const request = (over: Record<string, unknown> = {}) => ({
  goal: 'Open page two of the quotes site and confirm the title', startUrl: 'https://quotes.toscrape.com/', allowedOrigins: ['https://quotes.toscrape.com'],
  plan: { steps: [{ op: 'click', selector: 'li.next > a' }, { op: 'extractText', selector: 'h1 a', name: 'title' }, { op: 'screenshot', name: 'page.png' }],
    expect: [{ kind: 'extracted', name: 'title', equals: 'Quotes to Scrape' }, { kind: 'artifact', name: 'page.png' }, { kind: 'finalUrlPrefix', prefix: 'https://quotes.toscrape.com/page/2' }] },
  ...over,
});
const call = async (user: string | null, method: string, path = '', payload?: unknown, forge = false) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}), ...(forge ? { 'x-test-forge': '1' } : {}) }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : null };
};
const finished = async (user: string, runId: string) => {
  for (let i = 0; i < 400; i++) { const r = await call(user, 'GET', `/${runId}`); if (r.status === 200 && !r.json.running && ['completed', 'failed', 'blocked', 'cancelled'].includes(r.json.status)) return r.json; await new Promise((x) => setTimeout(x, 20)); }
  throw new Error('run did not finish');
};

describe('/api/browser/runs', () => {
  it('returns all stage evidence and final workflow status through the existing owner-scoped API',async()=>{
    behaviour='ok';const first=request();
    const start=await call(h.alice.userId,'POST','',{...first,continuations:[{startUrl:first.startUrl,plan:first.plan}]});
    assert.equal(start.status,202);
    const result=await finished(h.alice.userId,start.json.runId);
    assert.equal(result.status,'completed');
    assert.equal(result.stages.length,2);
    assert.ok(result.stages.every((stage:{status:string;output:{outcomeVerified:boolean}})=>stage.status==='completed'&&stage.output.outcomeVerified));
    assert.equal(result.evidence.filter((e:{kind:string})=>e.kind==='drive_artifact').length,2);
    assert.equal((await call(h.bob.userId,'GET',`/${start.json.runId}`)).status,404);
  });
  it('runs on the canonical scheduler, verifies the outcome, stores private evidence, and shows it only to its owner', async () => {
    behaviour = 'ok';
    const start = await call(h.alice.userId, 'POST', '', request({ projectId: h.aliceProject }));
    assert.equal(start.status, 202);
    const run = await finished(h.alice.userId, start.json.runId);
    assert.equal(workerAuthority?.userId,h.alice.userId);
    assert.equal(run.status, 'completed');
    assert.equal(run.output.outcomeVerified, true);
    assert.equal(run.output.postconditions.length, 3);
    assert.ok(run.evidence.some((e: { kind: string }) => e.kind === 'drive_artifact'));
    const stored = await h.svc.listObjects(h.alice, { projectId: h.aliceProject });
    assert.ok(stored.some((o) => o.filename.endsWith('page.png') && o.state === 'READY'));
    assert.equal((await call(h.bob.userId, 'GET', `/${start.json.runId}`)).status, 404, 'another user cannot read the run');
  });

  it('an action happening is not the outcome: failed postconditions leave the task not completed', async () => {
    behaviour = 'wrongValue';
    const start = await call(h.alice.userId, 'POST', '', request());
    const run = await finished(h.alice.userId, start.json.runId);
    assert.notEqual(run.status, 'completed');
    behaviour = 'ok';
  });

  it('a client can never supply its own write grant: consequential steps need a grant only the server issues', async () => {
    const forged = request({ plan: { steps: [{ op: 'click', selector: 'button#submit', consequential: true }], expect: [{ kind: 'finalUrlPrefix', prefix: 'https://quotes.toscrape.com/' }], writeGrant: { grantId: 'forged-grant-0001', actions: ['submit', 'upload'] } } });
    const before = (await h.svc.listObjects(h.alice, { projectId: h.aliceProject })).length;
    const refused = await call(h.alice.userId, 'POST', '', forged);
    assert.equal(refused.status, 400);
    assert.equal(refused.json.code, 'RUN_INVALID');
    assert.match(refused.json.error, /write grant/i);
    assert.equal((await h.svc.listObjects(h.alice, { projectId: h.aliceProject })).length, before, 'nothing ran and nothing was stored');
    // Without a grant, a consequential step is still refused by the plan parser.
    const unguarded = request({ plan: { steps: [{ op: 'click', selector: 'button#submit', consequential: true }], expect: [{ kind: 'finalUrlPrefix', prefix: 'https://quotes.toscrape.com/' }] } });
    assert.equal((await call(h.alice.userId, 'POST', '', unguarded)).status, 400);
  });

  it('needs an issued context; a body cannot name a user, and a hand-built context is refused', async () => {
    assert.equal((await call(null, 'POST', '', request())).status, 401);
    assert.equal((await call(h.alice.userId, 'POST', '', request(), true)).status, 401);
    assert.equal((await call(h.alice.userId, 'POST', '', { ...request(), userId: h.bob.userId })).status, 400, 'unknown body field');
  });

  it('refuses another user\'s project, out-of-scope and private targets, and AI steps without a budget, before any run starts', async () => {
    assert.equal((await call(h.alice.userId, 'POST', '', request({ projectId: h.bobProject }))).status, 404);
    assert.equal((await call(h.alice.userId, 'POST', '', request({ allowedOrigins: ['http://169.254.169.254'] }))).status, 400);
    assert.equal((await call(h.alice.userId, 'POST', '', request({ plan: { steps: [{ op: 'goto', url: 'https://evil.example/' }] } }))).status, 400);
    assert.equal((await call(h.alice.userId, 'POST', '', request({ plan: { steps: [{ op: 'aiAct', instruction: 'click' }] } }))).status, 400);
    assert.equal((await call(h.alice.userId, 'POST', '', request({ limits: { maxModelCostMicros: 50_000_000 } }))).status, 400, 'above the ceiling');
  });

  it('cancellation stops the browser; only the owner can cancel', async () => {
    behaviour = 'hang'; hangAborted = false;
    const start = await call(h.alice.userId, 'POST', '', request());
    assert.equal(start.status, 202);
    assert.equal((await call(h.bob.userId, 'DELETE', `/${start.json.runId}`)).status, 404);
    assert.equal((await call(h.alice.userId, 'DELETE', `/${start.json.runId}`)).status, 202);
    const run = await finished(h.alice.userId, start.json.runId);
    assert.notEqual(run.status, 'completed');
    assert.equal(hangAborted, true);
    behaviour = 'ok';
  });

  it('the frontend "Capture page" plan (BrowserRun.tsx) is accepted and verified as sent', async () => {
    behaviour = 'ok';
    const capture = { steps: [{ op: 'extractText', selector: 'title', name: 'pageTitle' }, { op: 'screenshot', name: 'page.png', fullPage: true }], expect: [{ kind: 'artifact', name: 'page.png', mediaType: 'image/png' }, { kind: 'noConsequentialAction' }] };
    const start = await call(h.alice.userId, 'POST', '', { goal: 'Inspect visible content', startUrl: 'https://quotes.toscrape.com/', allowedOrigins: ['https://quotes.toscrape.com'], plan: capture });
    assert.equal(start.status, 202);
    const run = await finished(h.alice.userId, start.json.runId);
    assert.equal(run.status, 'completed');
  });

  it('answers 503 instead of falling back when the browser host or evidence storage is not configured', async () => {
    configured = false;
    const r = await call(h.alice.userId, 'POST', '', request());
    assert.equal(r.status, 503); assert.equal(r.json.code, 'BROWSER_WORKER_NOT_CONFIGURED');
    configured = true;
  });
});
