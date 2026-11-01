import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';

import { FakeGitHub } from '../existingSource/fakeGitHub.testsupport.js';
import { InMemoryCodeIndexStore } from '../existingSource/intelligence/codeIndexStore.js';
import { monorepoFiles } from '../existingSource/intelligence/monorepoFixture.testsupport.js';
import { ExistingSourceIntelligence, IndexCoordinator } from '../existingSource/intelligence/service.js';
import { ExistingSourceService } from '../existingSource/service.js';
import { InMemorySourceBindingStore } from '../existingSource/store.js';
import { createTenantContext } from '../security/tenantContext.js';
import { createExistingSourceRouter } from './existingSource.js';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const gh = new FakeGitHub();
gh.addAccount('tok-alice', '501', 'alice');
gh.addAccount('tok-bob', '502', 'bob');
const repo = gh.addRepo({ fullName: 'acme/monorepo', ownerId: '501', files: monorepoFiles(), access: { '501': { pull: true, push: true } } });
const bindings = new InMemorySourceBindingStore();
const indexes = new InMemoryCodeIndexStore();
const coordinator = new IndexCoordinator();
const tokens = new Map([[ALICE, 'tok-alice'], [BOB, 'tok-bob']]);
const service = new ExistingSourceService({ store: bindings, tokenFor: async (u) => tokens.get(u) ?? null, portFor: (t) => gh.port(t), treeCache: new Map(), onBindingClosed: (u, id) => indexes.deleteForBinding(u, id) });
const intel = new ExistingSourceIntelligence({ source: service, store: indexes, coordinator });

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const who = req.header('x-test-user');
  if (who) (req as unknown as { tenantContext: unknown }).tenantContext = createTenantContext({ userId: who, via: 'local_jwt' });
  next();
});
app.use('/api/existing-source', createExistingSourceRouter(() => service, () => true, () => intel));
const server = app.listen(0, '127.0.0.1');
before(() => new Promise<void>((resolve) => { if (server.listening) resolve(); else server.once('listening', () => resolve()); }));
after(() => new Promise((done) => server.close(done)));
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/existing-source`;
async function call(path: string, user: string | null, init: { method?: string; body?: unknown } = {}) {
  const r = await fetch(base() + path, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const text = await r.text();
  return { status: r.status, text, body: text ? (JSON.parse(text) as Record<string, any>) : {} };
}

describe('code map routes', () => {
  it('require an issued identity and refuse unknown fields', async () => {
    for (const [m, p] of [['GET', `/links/${ALICE}/index`], ['POST', `/links/${ALICE}/index`], ['GET', `/links/${ALICE}/search?q=abc`], ['POST', `/links/${ALICE}/locate`], ['GET', `/links/${ALICE}/neighborhood?path=a.ts`]] as const) {
      assert.equal((await call(p, null, { method: m, body: m === 'POST' ? { instruction: 'change something', force: false } : undefined })).status, 401, `${m} ${p}`);
    }
  });

  it('build, report, search, locate and explain over HTTP, with bounded responses and no source bodies', async () => {
    const id = (await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo } })).body.binding.id as string;
    assert.equal((await call(`/links/${id}/index`, ALICE)).body.status, 'not_indexed');
    assert.equal((await call(`/links/${id}/search?q=validateInvoiceNotification`, ALICE)).status, 409, 'search needs a current map and does not silently build one');
    assert.equal((await call(`/links/${id}/search?q=validateInvoiceNotification`, ALICE)).body.code, 'INDEX_UNAVAILABLE');

    const built = await call(`/links/${id}/index`, ALICE, { method: 'POST', body: {} });
    assert.equal(built.status, 200);
    assert.equal(built.body.status, 'valid');
    assert.equal(built.body.metrics.kind, 'cold');
    assert.ok(built.body.filesIndexed > 400);
    assert.ok(!('files' in built.body), 'the response is a summary, not the map');
    const again = await call(`/links/${id}/index`, ALICE, { method: 'POST', body: {} });
    assert.equal(again.body.metrics.kind, 'reused');
    assert.equal(again.body.metrics.blobFetches, 0);
    assert.equal((await call(`/links/${id}/index`, ALICE)).body.status, 'valid');

    const search = await call(`/links/${id}/search?q=validateInvoiceNotification&kind=symbol`, ALICE);
    assert.equal(search.body.results[0].path, 'packages/billing/src/notifications/validateInvoiceNotification.ts');
    const located = await call(`/links/${id}/locate`, ALICE, { method: 'POST', body: { instruction: 'Fix `calculateOrderTotal` so it rounds once' } });
    assert.equal(located.body.relevance.targets[0].path, 'packages/orders/src/pricing/calculateOrderTotal.ts');
    assert.ok(located.body.passport.estimatedTokens <= 3_500);
    const near = await call(`/links/${id}/neighborhood?path=${encodeURIComponent('packages/orders/src/pricing/calculateOrderTotal.ts')}`, ALICE);
    assert.ok(near.body.dependedOnBy.includes('packages/orders/src/checkout/checkoutSummary.ts'));
    assert.equal((await call(`/links/${id}/neighborhood?path=${encodeURIComponent('../secret')}`, ALICE)).status, 400);
    assert.equal((await call(`/links/${id}/search?q=a`, ALICE)).status, 400);
    assert.equal((await call(`/links/${id}/locate`, ALICE, { method: 'POST', body: { instruction: 'x'.repeat(9_000) } })).status, 400);
    assert.equal((await call(`/links/${id}/index`, ALICE, { method: 'POST', body: { force: true, userId: BOB } })).status, 400);
  });

  it('hides another tenant\'s map exactly like a binding that does not exist', async () => {
    gh.setAccess(repo, '502', { pull: true });
    const id = (await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo } })).body.binding.id as string;
    await call(`/links/${id}/index`, ALICE, { method: 'POST', body: {} });
    const missing = await call('/links/33333333-3333-4333-8333-333333333333/index', BOB);
    for (const [m, p, body] of [['GET', `/links/${id}/index`, undefined], ['POST', `/links/${id}/index`, {}], ['GET', `/links/${id}/search?q=validate`, undefined], ['POST', `/links/${id}/locate`, { instruction: 'change validation' }], ['GET', `/links/${id}/neighborhood?path=package.json`, undefined]] as const) {
      const r = await call(p, BOB, { method: m, body });
      assert.equal(r.status, 404, `${m} ${p}`);
      assert.equal(r.body.code, 'BINDING_NOT_FOUND');
      assert.equal(r.text, missing.text);
    }
  });

  it('unlinking removes the derived map', async () => {
    const id = (await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo } })).body.binding.id as string;
    await call(`/links/${id}/index`, ALICE, { method: 'POST', body: {} });
    assert.equal(indexes.count(ALICE, id), 1);
    assert.equal((await call(`/links/${id}`, ALICE, { method: 'DELETE' })).status, 204);
    assert.equal(indexes.count(ALICE, id), 0);
    assert.equal((await call(`/links/${id}/index`, ALICE)).status, 404);
  });
});
