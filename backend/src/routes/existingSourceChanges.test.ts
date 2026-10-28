import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';

import type { AgentSoftwareExecutorResult } from '../ai/softwareAgent/AgentSoftwareExecutor.js';
import { ChangeDelivery } from '../existingSource/change/delivery.js';
import { GitFake } from '../existingSource/change/gitFake.testsupport.js';
import { LocalProcessPort } from '../existingSource/change/localProcessPort.testsupport.js';
import { ChangeService } from '../existingSource/change/service.js';
import { InMemoryChangeStore } from '../existingSource/change/store.js';
import type { ExistingSourceToolHost } from '../existingSource/change/toolHost.js';
import { readZip } from '../existingSource/archive/zipReader.js';
import { FakeGitHub, type FakeFile } from '../existingSource/fakeGitHub.testsupport.js';
import { InMemoryCodeIndexStore } from '../existingSource/intelligence/codeIndexStore.js';
import { ExistingSourceIntelligence, IndexCoordinator } from '../existingSource/intelligence/service.js';
import { ExistingSourceService } from '../existingSource/service.js';
import { InMemorySourceBindingStore } from '../existingSource/store.js';
import { createTenantContext } from '../security/tenantContext.js';
import { createExistingSourceRouter } from './existingSource.js';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const FILES: FakeFile[] = [
  { path: 'package.json', content: '{"name":"cart","scripts":{"test":"node --test"}}\n' },
  { path: '.env', content: 'STRIPE_KEY=sk_live_do_not_leak\n' },
  { path: 'src/pricing.js', content: 'exports.applyDiscount = (price, percent) => price - percent;\n' },
  { path: 'test/pricing.test.js', content: "const test = require('node:test');\nconst assert = require('node:assert');\nconst { applyDiscount } = require('../src/pricing');\ntest('zero percent', () => { assert.strictEqual(applyDiscount(5, 0), 5); });\n" },
];
const FIX = 'exports.applyDiscount = (price, percent) => Math.round(price * (100 - percent)) / 100;\n';
const NEW_TEST = "const test = require('node:test');\nconst assert = require('node:assert');\nconst { applyDiscount } = require('../src/pricing');\ntest('ten percent', () => { assert.strictEqual(applyDiscount(200, 10), 180); });\n";

const gh = new FakeGitHub();
gh.addAccount('tok-alice', '501', 'alice'); gh.addAccount('tok-bob', '502', 'bob');
const repo = gh.addRepo({ fullName: 'acme/cart', ownerId: '501', files: FILES, access: { '501': { pull: true, push: true } } });
const tokens = new Map<string, string | null>([[ALICE, 'tok-alice'], [BOB, 'tok-bob']]);
const source = new ExistingSourceService({ store: new InMemorySourceBindingStore(), tokenFor: async (u) => tokens.get(u) ?? null, portFor: (t) => gh.port(t), treeCache: new Map(), verifyMaxAgeMs: 0 });
const intel = new ExistingSourceIntelligence({ source, store: new InMemoryCodeIndexStore(), coordinator: new IndexCoordinator() });
const store = new InMemoryChangeStore();
const git = new GitFake();
let release: (() => void) | null = null; let hold = false;
const changes = new ChangeService({
  source, intel, store, execution: new LocalProcessPort(), modelRouteFor: async () => ({}) as never,
  runAgent: async (input) => {
    const host = input.host as ExistingSourceToolHost;
    if (hold) await new Promise<void>((resolve) => { release = resolve; input.signal?.addEventListener('abort', () => resolve(), { once: true }); });
    if (input.signal?.aborted) return { status: 'cancelled', evidence: { changedFiles: [], checks: [] }, blockers: [], outputText: '', iterations: 0 };
    await host.writeFile(input.contract, 'src/pricing.js', FIX, 'modify');
    await host.writeFile(input.contract, 'test/discount.test.js', NEW_TEST, 'create');
    return { status: 'implemented', evidence: { changedFiles: [], checks: [] }, blockers: [], outputText: 'done', iterations: 1 } as AgentSoftwareExecutorResult;
  },
});
const delivery = new ChangeDelivery({ source, store, apiFor: async () => git });

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const who = req.header('x-test-user');
  if (who) (req as unknown as { tenantContext: unknown }).tenantContext = createTenantContext({ userId: who, via: 'local_jwt' });
  next();
});
app.use('/api/existing-source', createExistingSourceRouter(() => source, () => true, () => intel, () => ({ changes, delivery })));
const server = app.listen(0, '127.0.0.1');
before(() => new Promise<void>((resolve) => { if (server.listening) resolve(); else server.once('listening', () => resolve()); }));
after(() => new Promise((done) => server.close(done)));
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/existing-source`;
async function call(path: string, user: string | null, init: { method?: string; body?: unknown } = {}) {
  const r = await fetch(base() + path, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const buf = Buffer.from(await r.arrayBuffer()); const text = buf.toString('utf8');
  let body: Record<string, any> = {}; try { body = text ? JSON.parse(text) : {}; } catch { /* a file */ }
  return { status: r.status, text, buf, body, headers: r.headers };
}
async function until(changeId: string, user: string, done: (s: string) => boolean) {
  for (let i = 0; i < 600; i++) { const s = (await call(`/changes/${changeId}`, user)).body.change?.status as string; if (done(s)) return s; await new Promise((r) => setTimeout(r, 25)); }
  throw new Error('timed out waiting for the change');
}

describe('change routes', () => {
  it('require an issued identity and refuse unknown fields and malformed ids', async () => {
    const linkId = (await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo } })).body.binding.id as string;
    for (const [m, p] of [['POST', `/links/${linkId}/changes`], ['GET', `/links/${linkId}/changes`], ['GET', `/changes/${linkId}`], ['POST', `/changes/${linkId}/cancel`], ['POST', `/changes/${linkId}/deliver`], ['GET', `/changes/${linkId}/export?format=patch`]] as const) {
      assert.equal((await call(p, null, { method: m, body: m === 'POST' ? {} : undefined })).status, 401, `${m} ${p}`);
    }
    assert.equal((await call(`/links/${linkId}/changes`, ALICE, { method: 'POST', body: { instruction: 'fix the discount bug', userId: BOB } })).status, 400);
    assert.equal((await call(`/links/${linkId}/changes`, ALICE, { method: 'POST', body: { instruction: 'x' } })).status, 400);
    assert.equal((await call('/changes/not-a-uuid', ALICE)).status, 400);
    assert.equal((await call(`/changes/${linkId}/export?format=exe`, ALICE)).status, 400);
  });

  it('requests a change, reports durable progress, shows diff and evidence, then exports it; no credential or file bodies leak', async () => {
    const linkId = (await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo } })).body.binding.id as string;
    const created = await call(`/links/${linkId}/changes`, ALICE, { method: 'POST', body: { instruction: 'Fix the bug: `applyDiscount` subtracts the percent instead of taking it off' } });
    assert.equal(created.status, 202);
    const id = created.body.change.id as string;
    assert.equal(await until(id, ALICE, (s) => ['verified', 'failed', 'unverified'].includes(s)), 'verified');
    const done = (await call(`/changes/${id}`, ALICE)).body.change;
    assert.equal(done.reproduction, 'reproduced');
    assert.deepEqual(done.files.map((f: { path: string }) => f.path).sort(), ['src/pricing.js', 'test/discount.test.js']);
    assert.equal(done.revisions[0].tests.status, 'passed');
    assert.match(done.revisions[0].diff, /-exports\.applyDiscount = \(price, percent\) => price - percent;/);
    assert.ok(done.events.some((e: { type: string }) => e.type === 'verification.completed'));
    assert.ok(!('result' in done), 'file bodies are not part of the status response');
    assert.ok(!JSON.stringify(done).includes('sk_live_do_not_leak'));
    assert.equal((await call(`/links/${linkId}/changes`, ALICE)).body.changes[0].id, id);

    const patch = await call(`/changes/${id}/export?format=patch`, ALICE);
    assert.equal(patch.status, 200);
    assert.match(patch.headers.get('content-disposition') ?? '', /attachment; filename="xroga-change-[0-9a-f]{8}\.patch"/);
    assert.match(patch.text, /ten percent/);
    const zip = await call(`/changes/${id}/export?format=zip`, ALICE);
    assert.equal(zip.headers.get('content-type'), 'application/zip');
    assert.deepEqual(readZip(zip.buf).files.map((f) => f.path).sort(), ['src/pricing.js', 'test/discount.test.js']);
  });

  it('delivers a draft PR over HTTP, is idempotent, answers a conflict with 409 and a structured report, and refuses a second owner', async () => {
    const linkId = (await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo } })).body.binding.id as string;
    const binding = (await call(`/links/${linkId}`, ALICE)).body.binding;
    git.seed(FILES, 'main', binding.baseCommitSha);
    const request = async () => {
      const id = (await call(`/links/${linkId}/changes`, ALICE, { method: 'POST', body: { instruction: 'Fix the bug in `applyDiscount`: wrong percent maths' } })).body.change.id as string;
      await until(id, ALICE, (s) => s === 'verified');
      return id;
    };
    const first = await request();
    assert.equal((await call(`/changes/${first}/deliver`, BOB, { method: 'POST', body: {} })).status, 404);
    assert.equal((await call(`/changes/${first}/deliver`, ALICE, { method: 'POST', body: { force: true } })).status, 400, 'unknown fields are refused');
    const ok = await call(`/changes/${first}/deliver`, ALICE, { method: 'POST', body: {} });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.receipt.draft, true);
    assert.equal(ok.body.receipt.verified, true);
    assert.equal(ok.body.change.status, 'delivered');
    assert.match(ok.body.receipt.branch, /^xroga\/change-/);
    assert.equal(git.pullRequests.length, 1);
    assert.equal((await call(`/changes/${first}/deliver`, ALICE, { method: 'POST', body: {} })).body.alreadyDelivered, true);
    assert.equal(git.pullRequests.length, 1);

    // someone else edits the same file on the remote; a second change touching it cannot be delivered
    git.advance('main', { 'src/pricing.js': 'exports.applyDiscount = () => 0;\n' });
    const second = await request();
    const conflict = await call(`/changes/${second}/deliver`, ALICE, { method: 'POST', body: {} });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, 'DELIVERY_CONFLICT');
    assert.deepEqual(conflict.body.conflicts.map((c: { path: string; reason: string }) => [c.path, c.reason]), [['src/pricing.js', 'changed_on_remote']]);
    assert.equal(conflict.body.exportAvailable, true);
    assert.equal(git.pullRequests.length, 1, 'nothing was written for the conflicting change');
    assert.equal((await call(`/changes/${second}/export?format=patch`, ALICE)).status, 200, 'it can still be exported');
  });

  it('cancels a running change, and hides everything from another owner', async () => {
    const linkId = (await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo } })).body.binding.id as string;
    hold = true;
    const id = (await call(`/links/${linkId}/changes`, ALICE, { method: 'POST', body: { instruction: 'Fix the bug in `applyDiscount` percent maths' } })).body.change.id as string;
    await until(id, ALICE, (s) => s === 'working');
    assert.equal((await call(`/changes/${id}`, BOB)).status, 404);
    assert.equal((await call(`/changes/${id}/cancel`, BOB, { method: 'POST', body: {} })).status, 404);
    assert.equal((await call(`/changes/${id}/export?format=patch`, BOB)).status, 404);
    assert.equal((await call(`/links/${linkId}/changes`, BOB)).status, 404);
    await call(`/changes/${id}/cancel`, ALICE, { method: 'POST', body: {} });
    assert.equal(await until(id, ALICE, (s) => s === 'cancelled'), 'cancelled');
    hold = false; release = null;
    assert.equal((await call(`/changes/${id}/resume`, ALICE, { method: 'POST', body: {} })).status, 409, 'only an interrupted change can be resumed');
    assert.equal((await call(`/changes/${id}/export?format=patch`, ALICE)).status, 409, 'a cancelled change has nothing to export');
  });
});

describe('launching a change on the durable Google path', () => {
  const task = { id: '66666666-6666-4666-8666-666666666666', status: 'queued' } as never;
  const tenant = { userId: '11111111-1111-4111-8111-111111111111' } as never;
  it('queues a canonical run for the change and returns the queued change, without starting it in this process', async () => {
    const calls: string[] = []; let admitted: { runId: string; input: Record<string, unknown> } | null = null;
    const c = { changes: {
      start: () => { calls.push('start'); },
      attachRun: async (_u: string, _id: string, runId: string) => { calls.push('attach'); return { id: 'x', canonicalRunId: runId }; },
      abandon: async () => { calls.push('abandon'); },
    } } as never;
    const { launchChange } = await import('./existingSource.js');
    const result = await launchChange(tenant, c, task, { selected: () => true, admit: (async (_ctx: unknown, runId: string, input: Record<string, unknown>) => { admitted = { runId, input }; return { runId, dispatched: true }; }) as never });
    assert.deepEqual(calls, ['attach']);
    assert.equal((result as unknown as { canonicalRunId: string }).canonicalRunId, admitted!.runId);
    assert.deepEqual(admitted!.input, { prompt: 'Existing project change', existingSourceChangeId: (task as unknown as { id: string }).id });
  });
  it('ends the change with a reason when it cannot be handed to a worker', async () => {
    const calls: string[] = [];
    const c = { changes: { attachRun: async () => ({}), abandon: async (_u: string, _id: string, reason: string) => { calls.push(reason); } } } as never;
    const { launchChange } = await import('./existingSource.js');
    await assert.rejects(() => launchChange(tenant, c, task, { selected: () => true, admit: (async () => { throw Object.assign(new Error('x'), { code: 'OUT_OF_TOKENS' }); }) as never }),
      (e: unknown) => (e as { code?: string }).code === 'EXECUTION_UNAVAILABLE');
    assert.match(calls[0]!, /AI capacity/);
  });
  it('runs in this process when the durable path is not selected', async () => {
    const calls: string[] = [];
    const c = { changes: { start: () => { calls.push('start'); } } } as never;
    const { launchChange } = await import('./existingSource.js');
    await launchChange(tenant, c, task, { selected: () => false, admit: (async () => { throw new Error('not expected'); }) as never });
    assert.deepEqual(calls, ['start']);
  });
});
