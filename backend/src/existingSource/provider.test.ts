import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRestSourcePort } from './provider.js';
import { isSensitivePath } from './sensitivePaths.js';
import { readCompleteTree } from './treeReader.js';
import { ProviderError } from './types.js';

const TOKEN = 'ghp_TESTTOKEN0123456789abcdefghijklmnopqrst';
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

function port(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; auth: string | null }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, auth: new Headers(init.headers).get('authorization') });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { port: createRestSourcePort(TOKEN, fetchImpl, 'https://api.test'), calls };
}

describe('GitHub REST source port', () => {
  it('addresses every repository by its immutable id, never by name, and sends the token only as a header', async () => {
    const { port: p, calls } = port((url) => {
      if (url.endsWith('/repositories/42')) return json({ id: 42, full_name: 'o/r', owner: { id: 7, login: 'o', type: 'Organization' }, private: true, archived: false, default_branch: 'main', permissions: { pull: true, push: false } });
      if (url.includes('/branches/')) return json({ commit: { sha: 'a'.repeat(40) }, protected: true });
      return json({});
    });
    const repo = await p.getRepository('42');
    assert.deepEqual([repo.id, repo.ownerId, repo.ownerType, repo.permissions.push], ['42', '7', 'Organization', false]);
    assert.deepEqual(await p.getBranchHead('42', 'release/1.0'), { commitSha: 'a'.repeat(40), protected: true });
    for (const c of calls) {
      assert.match(c.url, /^https:\/\/api\.test\/repositories\/42/);
      assert.ok(!c.url.includes(TOKEN), 'the token is never in a URL');
      assert.equal(c.auth, `Bearer ${TOKEN}`);
    }
    assert.ok(calls[1]!.url.endsWith('/branches/release%2F1.0'), 'branch names are encoded');
  });

  it('refuses ids and object ids that are not what they claim, before any request', async () => {
    const { port: p, calls } = port(() => json({}));
    for (const id of ['', 'abc', '1/../2', '1?x=1', '12345678901234567890123']) await assert.rejects(p.getRepository(id), (e) => e instanceof ProviderError && e.kind === 'not_found');
    await assert.rejects(p.getBlob('1', 'not-a-sha'), (e) => e instanceof ProviderError);
    await assert.rejects(p.getCommitTreeSha('1', '../../x'), (e) => e instanceof ProviderError);
    assert.equal(calls.length, 0);
  });

  it('classifies failures and never echoes the provider body', async () => {
    const kinds = new Map<number, string>([[401, 'unauthorized'], [404, 'not_found'], [451, 'not_found'], [409, 'empty'], [500, 'unavailable'], [502, 'unavailable']]);
    for (const [status, kind] of kinds) {
      const { port: p } = port(() => new Response('internal request id req_SECRET host db.internal', { status }));
      await assert.rejects(p.getRepository('1'), (e) => e instanceof ProviderError && e.kind === kind && !/req_SECRET|db\.internal/.test(e.message), String(status));
    }
    const limited = port(() => new Response('', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }));
    await assert.rejects(limited.port.getRepository('1'), (e) => e instanceof ProviderError && e.kind === 'rate_limited');
    const denied = port(() => new Response('', { status: 403 }));
    await assert.rejects(denied.port.getRepository('1'), (e) => e instanceof ProviderError && e.kind === 'forbidden');
    const down = createRestSourcePort(TOKEN, (async () => { throw new TypeError('connect ECONNREFUSED 10.0.0.5'); }) as unknown as typeof fetch);
    await assert.rejects(down.viewer(), (e) => e instanceof ProviderError && e.kind === 'unavailable' && !/10\.0\.0\.5/.test(e.message));
  });

  it('a missing branch is null, an empty repository is its own failure, and a bad viewer is unauthorised', async () => {
    assert.equal(await port(() => new Response('', { status: 404 })).port.getBranchHead('1', 'nope'), null);
    await assert.rejects(port(() => new Response('', { status: 409 })).port.getBranchHead('1', 'main'), (e) => e instanceof ProviderError && e.kind === 'empty');
    await assert.rejects(port(() => json({ id: 'x', login: '' })).port.viewer(), (e) => e instanceof ProviderError && e.kind === 'unauthorized');
  });

  it('lists repositories with owner ids and permissions, and reports whether there is another page', async () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, full_name: `o/r${i}`, owner: { id: 7, login: 'o', type: 'User' }, private: false, archived: false, default_branch: 'main', permissions: { pull: true } }));
    const { port: p, calls } = port(() => json(rows, { headers: { link: '<https://api.test/user/repos?page=2>; rel="next"' } }));
    const page = await p.listRepositories(1);
    assert.equal(page.repositories.length, 100);
    assert.equal(page.hasMore, true);
    assert.match(calls[0]!.url, /affiliation=owner,collaborator,organization_member/);
  });
});

describe('sensitive paths', () => {
  it('marks credential-bearing files and leaves examples and ordinary source alone', () => {
    for (const p of ['.env', 'apps/api/.env', '.env.production', '.env.local', 'id_rsa', 'home/.ssh/config', 'certs/server.pem', 'k.key', '.npmrc', '.aws/credentials', 'secrets.json', 'a/b/id_ed25519']) assert.equal(isSensitivePath(p), true, p);
    for (const p of ['.env.example', '.env.sample', 'src/env.ts', 'README.md', 'src/keyboard.ts', 'id_rsa.pub', 'docs/pem.md', 'src/secrets/README.md']) assert.equal(isSensitivePath(p), false, p);
  });
});

describe('complete tree reads', () => {
  const tree = (entries: Array<{ path: string; type?: string; sha?: string }>, truncated = false) => ({ sha: 's', tree: entries, truncated });

  it('uses the recursive listing when it is complete, and flags an over-limit one as partial', async () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({ path: `f${i}`, type: 'blob', sha: 'x' }));
    const ok = await readCompleteTree({ getTree: async () => tree(entries) }, '1', 'r', { maxEntries: 10, maxSubtreeFetches: 5 });
    assert.deepEqual([ok.complete, ok.mode, ok.entries.length], [true, 'recursive', 5]);
    const capped = await readCompleteTree({ getTree: async () => tree(entries) }, '1', 'r', { maxEntries: 3, maxSubtreeFetches: 5 });
    assert.deepEqual([capped.complete, capped.partialReason, capped.entries.length], [false, 'entry_limit', 3]);
  });

  it('walks a truncated tree directory by directory and rebuilds full paths', async () => {
    const dirs: Record<string, ReturnType<typeof tree>> = {
      root: tree([{ path: 'a', type: 'tree', sha: 'A' }, { path: 'b', type: 'tree', sha: 'B' }, { path: 'top.ts', type: 'blob', sha: 't' }]),
      A: tree([{ path: 'x.ts', type: 'blob', sha: '1' }, { path: 'inner', type: 'tree', sha: 'I' }]),
      B: tree([{ path: 'y.ts', type: 'blob', sha: '2' }]),
      I: tree([{ path: 'deep.ts', type: 'blob', sha: '3' }]),
    };
    const out = await readCompleteTree({ getTree: async (_id, sha, recursive) => (recursive ? tree([], true) : dirs[sha] ?? null) }, '1', 'root');
    assert.equal(out.complete, true);
    assert.equal(out.mode, 'subtrees');
    assert.deepEqual(out.entries.map((e) => e.path).sort(), ['a', 'a/inner', 'a/inner/deep.ts', 'a/x.ts', 'b', 'b/y.ts', 'top.ts']);
  });

  it('stops at the fetch bound and says so; an unreadable response is never complete', async () => {
    const dirs: Record<string, ReturnType<typeof tree>> = { root: tree([{ path: 'a', type: 'tree', sha: 'A' }, { path: 'b', type: 'tree', sha: 'B' }]), A: tree([{ path: 'x', type: 'blob', sha: '1' }]), B: tree([{ path: 'y', type: 'blob', sha: '2' }]) };
    const get = async (_id: string, sha: string, recursive: boolean) => (recursive ? tree([], true) : dirs[sha] ?? null);
    const limited = await readCompleteTree({ getTree: get }, '1', 'root', { maxEntries: 100, maxSubtreeFetches: 2 });
    assert.deepEqual([limited.complete, limited.partialReason], [false, 'fetch_limit']);
    const unreadable = await readCompleteTree({ getTree: async () => null }, '1', 'root');
    assert.deepEqual([unreadable.complete, unreadable.partialReason, unreadable.entries.length], [false, 'unreadable', 0]);
  });
});
