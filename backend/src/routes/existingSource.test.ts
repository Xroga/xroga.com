import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';

import { FakeGitHub } from '../existingSource/fakeGitHub.testsupport.js';
import { ExistingSourceService } from '../existingSource/service.js';
import { InMemorySourceBindingStore } from '../existingSource/store.js';
import { createTenantContext } from '../security/tenantContext.js';
import { createExistingSourceRouter } from './existingSource.js';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CANARY = 'ghp_CANARY0123456789abcdefghijklmnopqrstuv';

const gh = new FakeGitHub();
gh.addAccount('tok-alice', '501', 'alice');
gh.addAccount('tok-bob', '502', 'bob');
const repo = gh.addRepo({ fullName: 'alice/app', ownerId: '501', files: [{ path: 'src/a.ts', content: `export const k = "${CANARY}";\n` }, { path: '.env', content: `K=${CANARY}\n` }, { path: 'package.json', content: '{}' }], access: { '501': { pull: true, push: true } } });
const secret = gh.addRepo({ fullName: 'carol/secret', ownerId: '503', files: [{ path: 'a', content: 'x' }], access: { '503': { pull: true } } });
const store = new InMemorySourceBindingStore();
const tokens = new Map([[ALICE, 'tok-alice'], [BOB, 'tok-bob']]);
let enabled = true;
const service = new ExistingSourceService({ store, tokenFor: async (u) => tokens.get(u) ?? null, portFor: (t) => gh.port(t) });

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const who = req.header('x-test-user');
  if (who) (req as unknown as { tenantContext: unknown }).tenantContext = req.header('x-test-forge') ? { userId: who, tenantId: who } : createTenantContext({ userId: who, via: 'local_jwt' });
  next();
});
app.use('/api/existing-source', createExistingSourceRouter(() => service, () => enabled));
const server = app.listen(0, '127.0.0.1');
before(() => new Promise<void>((resolve) => { if (server.listening) resolve(); else server.once('listening', () => resolve()); }));
after(() => new Promise((done) => server.close(done)));
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/existing-source`;

async function call(path: string, user: string | null, init: { method?: string; body?: unknown; forge?: boolean } = {}) {
  const r = await fetch(base() + path, { method: init.method ?? 'GET', headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}), ...(init.forge ? { 'x-test-forge': '1' } : {}) }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const text = await r.text();
  return { status: r.status, text, body: text ? (JSON.parse(text) as Record<string, any>) : {} };
}

describe('/api/existing-source', () => {
  it('is off unless enabled, and needs an issued identity on every route', async () => {
    enabled = false;
    assert.equal((await call('/repositories', ALICE)).status, 503);
    assert.equal((await call('/repositories', ALICE)).body.code, 'EXISTING_SOURCE_DISABLED');
    enabled = true;
    for (const [method, path] of [['GET', '/repositories'], ['POST', '/links'], ['GET', '/links'], ['GET', `/links/${ALICE}`], ['DELETE', `/links/${ALICE}`], ['GET', `/links/${ALICE}/file?path=a`]] as const) {
      assert.equal((await call(path, null, { method, body: method === 'POST' ? { repositoryId: repo } : undefined })).status, 401, `${method} ${path}`);
    }
    assert.equal((await call('/repositories', ALICE, { forge: true })).status, 401, 'a hand-built context is refused');
  });

  it('links an authorised repository, lists and reopens it, and never returns a token', async () => {
    const linked = await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo } });
    assert.equal(linked.status, 201);
    assert.equal(linked.body.binding.providerRepositoryId, repo);
    assert.match(linked.body.binding.baseCommitSha, /^[0-9a-f]{40}$/);
    const again = await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo } });
    assert.equal(again.status, 200);
    assert.equal(again.body.binding.id, linked.body.binding.id);
    const id = linked.body.binding.id as string;
    assert.equal((await call('/links', ALICE)).body.links.length, 1);
    assert.equal((await call(`/links/${id}`, ALICE)).body.binding.state, 'linked');
    const repos = await call('/repositories', ALICE);
    assert.deepEqual(repos.body.repositories.map((r: { fullName: string }) => r.fullName), ['alice/app']);
    for (const r of [linked, again, repos]) assert.ok(!r.text.includes('tok-alice'), 'no token in any response');
  });

  it('inspects the linked repository: directory, file, redaction, and no credential file content', async () => {
    const id = (await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo } })).body.binding.id as string;
    const dir = await call(`/links/${id}/directory`, ALICE);
    assert.equal(dir.status, 200);
    assert.equal(dir.body.entries.find((e: { name: string }) => e.name === '.env').sensitive, true);
    const file = await call(`/links/${id}/file?path=${encodeURIComponent('src/a.ts')}`, ALICE);
    assert.equal(file.status, 200);
    assert.ok(!file.text.includes(CANARY), 'a credential inside source is redacted');
    const env = await call(`/links/${id}/file?path=.env`, ALICE);
    assert.equal(env.status, 403);
    assert.equal(env.body.code, 'SENSITIVE_PATH');
    assert.ok(!env.text.includes(CANARY));
    assert.equal((await call(`/links/${id}/file?path=${encodeURIComponent('../x')}`, ALICE)).status, 400);
    assert.equal((await call(`/links/${id}/file`, ALICE)).status, 400, 'a path is required');
    assert.equal((await call(`/links/${id}/file?path=a&startLine=3`, ALICE)).status, 400, 'a range needs both ends');
  });

  it('hides another tenant\'s links and repositories, with the same answer as one that does not exist', async () => {
    const id = (await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo } })).body.binding.id as string;
    const missing = await call('/links/33333333-3333-4333-8333-333333333333', BOB);
    for (const path of [`/links/${id}`, `/links/${id}/directory`, `/links/${id}/file?path=package.json`]) {
      const r = await call(path, BOB);
      assert.equal(r.status, 404, path);
      assert.equal(r.body.code, 'BINDING_NOT_FOUND');
      assert.equal(r.text, missing.text, 'indistinguishable from an id that never existed');
    }
    assert.equal((await call(`/links/${id}/refresh`, BOB, { method: 'POST' })).status, 404);
    assert.equal((await call(`/links/${id}`, BOB, { method: 'DELETE' })).status, 404);
    assert.deepEqual((await call('/links', BOB)).body.links, []);
    const guessed = await call('/links', BOB, { method: 'POST', body: { repositoryId: repo } });
    assert.equal(guessed.status, 404, "Bob cannot link Alice's private repository by its id");
    assert.equal(guessed.body.code, 'REPO_NOT_AUTHORIZED');
    assert.equal((await call('/links', ALICE, { method: 'POST', body: { repositoryId: secret } })).status, 404);
  });

  it('ignores any identity in the body and rejects unknown fields and malformed ids', async () => {
    assert.equal((await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo, userId: BOB } })).status, 400);
    assert.equal((await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo, ownerAccountId: '503', baseCommitSha: 'a'.repeat(40) } })).status, 400);
    assert.equal((await call('/links', ALICE, { method: 'POST', body: { repositoryId: 'alice/app' } })).status, 400);
    assert.equal((await call('/links/not-a-uuid', ALICE)).status, 400);
    assert.equal((await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo, branch: '../../x' } })).status, 400);
  });

  it('refresh moves the base only on request, unlink removes it from the list, and a removed connection stops reads', async () => {
    const id = (await call('/links', ALICE, { method: 'POST', body: { repositoryId: repo } })).body.binding.id as string;
    const before = (await call(`/links/${id}`, ALICE)).body.binding.baseCommitSha as string;
    const moved = gh.commit(repo, 'main', [{ path: 'package.json', content: '{"v":2}' }]);
    const check = await call(`/links/${id}`, ALICE);
    assert.equal(check.body.head.moved, true);
    assert.equal(check.body.binding.baseCommitSha, before);
    const refreshed = await call(`/links/${id}/refresh`, ALICE, { method: 'POST' });
    assert.deepEqual([refreshed.body.changed, refreshed.body.binding.baseCommitSha], [true, moved]);
    assert.equal((await call(`/links/${id}`, ALICE, { method: 'DELETE' })).status, 204);
    assert.equal((await call(`/links/${id}`, ALICE)).status, 404);
  });
});
