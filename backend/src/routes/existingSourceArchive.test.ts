import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';

import { buildZip } from '../existingSource/archive/zipBuilder.testsupport.js';
import { InMemoryArchiveStore } from '../existingSource/archive/archiveStore.js';
import { FakeGitHub } from '../existingSource/fakeGitHub.testsupport.js';
import { InMemoryCodeIndexStore } from '../existingSource/intelligence/codeIndexStore.js';
import { ExistingSourceIntelligence, IndexCoordinator } from '../existingSource/intelligence/service.js';
import { ExistingSourceService } from '../existingSource/service.js';
import { InMemorySourceBindingStore } from '../existingSource/store.js';
import { createTenantContext } from '../security/tenantContext.js';
import { createExistingSourceRouter } from './existingSource.js';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const gh = new FakeGitHub();
gh.addAccount('tok-alice', '501', 'alice');
const bindings = new InMemorySourceBindingStore();
const indexes = new InMemoryCodeIndexStore();
const archives = new InMemoryArchiveStore();
const tokens = new Map<string, string | null>([[ALICE, 'tok-alice'], [BOB, null]]);
const service = new ExistingSourceService({
  store: bindings, tokenFor: async (u) => tokens.get(u) ?? null, portFor: (t) => gh.port(t), archives, treeCache: new Map(), verifyMaxAgeMs: 0,
  onBindingClosed: async (u, id) => { await indexes.deleteForBinding(u, id); await archives.deleteForBinding(u, id); },
});
const intel = new ExistingSourceIntelligence({ source: service, store: indexes, coordinator: new IndexCoordinator() });

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
async function call(path: string, user: string | null, init: { method?: string; body?: unknown; zip?: Buffer; type?: string } = {}) {
  const headers: Record<string, string> = { ...(user ? { 'x-test-user': user } : {}) };
  let body: Uint8Array | string | undefined;
  if (init.zip) { headers['content-type'] = init.type ?? 'application/zip'; body = new Uint8Array(init.zip); }
  else if (init.body !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(init.body); }
  const r = await fetch(base() + path, { method: init.method ?? 'GET', headers, body });
  const text = await r.text();
  return { status: r.status, text, body: text ? (JSON.parse(text) as Record<string, any>) : {} };
}

const project = () => buildZip([
  { name: 'shop-main/package.json', data: '{"name":"shop","scripts":{"test":"jest"}}' },
  { name: 'shop-main/src/pricing/total.ts', data: 'export function calculateTotal(items: number[]): number {\n  return items.reduce((a, b) => a + b, 0);\n}\n' },
  { name: 'shop-main/src/checkout/summary.ts', data: "import { calculateTotal } from '../pricing/total';\nexport const summary = (x: number[]) => calculateTotal(x);\n" },
  { name: 'shop-main/src/pricing/total.test.ts', data: "import { calculateTotal } from './total';\ndescribe('total', () => { it('sums', () => { expect(calculateTotal([1, 2])).toBe(3); }); });\n" },
  { name: 'shop-main/.env', data: 'STRIPE_KEY=sk_live_abc123' },
  { name: 'shop-main/logo.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]) },
  { name: 'shop-main/../../escape.txt', data: 'nope' },
]);

describe('ZIP import of an existing project', () => {
  it('needs an issued identity and a zip body', async () => {
    assert.equal((await call('/archives', null, { method: 'POST', zip: project() })).status, 401);
    const empty = await call('/archives', ALICE, { method: 'POST', body: {} });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.code, 'INVALID_ARCHIVE');
    assert.equal((await call('/archives', ALICE, { method: 'POST', zip: Buffer.from('plain text, not a zip') })).body.code, 'INVALID_ARCHIVE');
  });

  it('imports, links, browses, reads with redaction rules, and maps it exactly like a repository', async () => {
    const imported = await call('/archives?name=shop-main.zip', ALICE, { method: 'POST', zip: project() });
    assert.equal(imported.status, 201);
    const binding = imported.body.binding;
    assert.equal(binding.originKind, 'archive');
    assert.equal(binding.repositoryFullName, 'zip/shop-main');
    assert.deepEqual(binding.permissions, { pull: true, push: false, admin: false });
    assert.equal(imported.body.report.refused.unsafe_path, 1);
    assert.ok(!imported.text.includes('sk_live_abc123'));

    assert.ok((await call('/links', ALICE)).body.links.some((l: { id: string }) => l.id === binding.id));
    assert.equal((await call(`/links/${binding.id}`, ALICE)).body.binding.state, 'linked');
    const root = await call(`/links/${binding.id}/directory`, ALICE);
    const names = root.body.entries.map((e: { name: string }) => e.name);
    assert.deepEqual(names.sort(), ['.env', 'logo.png', 'package.json', 'src']);
    assert.equal(root.body.entries.find((e: { name: string }) => e.name === '.env').sensitive, true);
    const file = await call(`/links/${binding.id}/file?path=${encodeURIComponent('src/pricing/total.ts')}`, ALICE);
    assert.match(file.body.content, /calculateTotal/);
    assert.equal((await call(`/links/${binding.id}/file?path=.env`, ALICE)).body.code, 'SENSITIVE_PATH');
    assert.equal((await call(`/links/${binding.id}/file?path=logo.png`, ALICE)).status >= 400, true, 'a binary that was never kept cannot be read');
    assert.equal((await call(`/links/${binding.id}/file?path=${encodeURIComponent('../escape.txt')}`, ALICE)).status, 400);

    const built = await call(`/links/${binding.id}/index`, ALICE, { method: 'POST', body: {} });
    assert.equal(built.body.status, 'valid');
    const near = await call(`/links/${binding.id}/neighborhood?path=${encodeURIComponent('src/pricing/total.ts')}`, ALICE);
    assert.ok(near.body.dependedOnBy.includes('src/checkout/summary.ts'));
    assert.ok(near.body.tests.includes('src/pricing/total.test.ts'));
    const located = await call(`/links/${binding.id}/locate`, ALICE, { method: 'POST', body: { instruction: 'calculateTotal should ignore negative items' } });
    assert.equal(located.body.relevance.targets[0].path, 'src/pricing/total.ts');
    assert.equal((await call(`/links/${binding.id}/refresh`, ALICE, { method: 'POST', body: {} })).body.code, 'INVALID_REQUEST', 'an archive never moves');
  });

  it('is idempotent for the same bytes and distinct for different ones', async () => {
    const a = await call('/archives?name=one', ALICE, { method: 'POST', zip: buildZip([{ name: 'a.ts', data: '1' }]) });
    const again = await call('/archives?name=one', ALICE, { method: 'POST', zip: buildZip([{ name: 'a.ts', data: '1' }]) });
    assert.equal(again.status, 200);
    assert.equal(again.body.binding.id, a.body.binding.id);
    const other = await call('/archives?name=one', ALICE, { method: 'POST', zip: buildZip([{ name: 'a.ts', data: '2' }]) });
    assert.notEqual(other.body.binding.id, a.body.binding.id);
  });

  it('is invisible to another owner, which cannot read, index or unlink it', async () => {
    const mine = (await call('/archives?name=private', ALICE, { method: 'POST', zip: buildZip([{ name: 'secret.ts', data: 'export const s = 1;' }]) })).body.binding.id as string;
    const missing = await call('/links/33333333-3333-4333-8333-333333333333', BOB);
    for (const [m, p] of [['GET', `/links/${mine}`], ['GET', `/links/${mine}/directory`], ['GET', `/links/${mine}/file?path=secret.ts`], ['POST', `/links/${mine}/index`], ['DELETE', `/links/${mine}`]] as const) {
      const r = await call(p, BOB, { method: m, body: m === 'POST' ? {} : undefined });
      assert.equal(r.status, 404, `${m} ${p}`);
    }
    assert.equal(missing.status, 404);
    assert.equal((await call('/links', BOB)).body.links.length, 0);
    // the same bytes imported by someone else are that person's own archive, not mine
    const bobs = await call('/archives?name=private', BOB, { method: 'POST', zip: buildZip([{ name: 'secret.ts', data: 'export const s = 1;' }]) });
    assert.notEqual(bobs.body.binding.id, mine);
    assert.equal(archives.count(ALICE) > 0 && archives.count(BOB), 1);
  });

  it('survives removing the GitHub connection and is deleted, with its map, on unlink', async () => {
    const id = (await call('/archives?name=keep', ALICE, { method: 'POST', zip: buildZip([{ name: 'k.ts', data: 'export const k = 1;' }]) })).body.binding.id as string;
    await call(`/links/${id}/index`, ALICE, { method: 'POST', body: {} });
    assert.equal(indexes.count(ALICE, id), 1);
    await service.connectionRemoved(ALICE);
    assert.equal((await call(`/links/${id}`, ALICE)).body.binding.state, 'linked', 'an uploaded archive does not depend on the GitHub connection');
    assert.equal(indexes.count(ALICE, id), 1);
    const before = archives.count(ALICE);
    assert.equal((await call(`/links/${id}`, ALICE, { method: 'DELETE' })).status, 204);
    assert.equal(indexes.count(ALICE, id), 0);
    assert.equal(archives.count(ALICE), before - 1);
    assert.equal((await call(`/links/${id}/directory`, ALICE)).status, 404);
  });

  it('refuses hostile archives with a clear error and stores nothing', async () => {
    const before = archives.count(ALICE);
    const bomb = buildZip([{ name: 'zeros.txt', data: Buffer.alloc(1_500_000, 0) }]);
    assert.equal((await call('/archives', ALICE, { method: 'POST', zip: bomb })).body.code, 'INVALID_ARCHIVE');
    assert.equal((await call('/archives', ALICE, { method: 'POST', zip: buildZip([{ name: 'a', data: 'x' }, { name: 'A', data: 'y' }]) })).body.code, 'INVALID_ARCHIVE');
    assert.equal((await call('/archives', ALICE, { method: 'POST', zip: buildZip([{ name: '../../x', data: 'x' }]) })).body.code, 'INVALID_ARCHIVE');
    const huge = await call('/archives', ALICE, { method: 'POST', zip: Buffer.alloc(11 * 1024 * 1024, 7) });
    assert.equal(huge.status, 413);
    assert.equal(archives.count(ALICE), before);
  });
});
