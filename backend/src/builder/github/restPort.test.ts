import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GitHubPortError, validBranchName, validRepositoryName, type GitHubOwner } from './port.js';
import { createRestGitHubPort, gitBlobSha, type GitHubTransport } from './restPort.js';

const TOKEN = 'ghp_test_token_value_for_contract_tests_only';

interface Recorded {
  method: string;
  path: string;
  body: unknown;
  token: string;
}

/** A scripted GitHub API: handlers by "METHOD /path-prefix". Records every request. */
function api(handlers: Record<string, (request: Recorded) => { status: number; body?: unknown; headers?: Record<string, string> }>): { transport: GitHubTransport; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const transport: GitHubTransport = async (token, path, init) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const recorded: Recorded = { method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined, token };
    requests.push(recorded);
    const key = Object.keys(handlers).filter((candidate) => `${method} ${path}`.startsWith(candidate)).sort((a, b) => b.length - a.length)[0];
    if (!key) throw new Error(`unscripted request: ${method} ${path}`);
    const result = handlers[key](recorded);
    return new Response(result.body === undefined ? null : JSON.stringify(result.body), { status: result.status, headers: result.headers });
  };
  return { transport, requests };
}

const repoJson = (over: Record<string, unknown> = {}) => ({ id: 9, full_name: 'alice/site', name: 'site', private: true, html_url: 'https://github.com/alice/site', description: 'Generated with Xroga. xroga-export:abc', default_branch: 'main', owner: { login: 'alice', id: 501 }, ...over });
const alice: GitHubOwner = { login: 'alice', id: 501, type: 'User' };

describe('GitHub REST adapter: reads', () => {
  it('reads the account and its token scopes, and lists organizations', async () => {
    const { transport } = api({
      'GET /user/orgs': () => ({ status: 200, body: [{ login: 'alice-co', id: 777 }, { nonsense: true }] }),
      'GET /user': () => ({ status: 200, body: { id: 501, login: 'alice' }, headers: { 'x-oauth-scopes': 'repo, read:org' } }),
    });
    const port = createRestGitHubPort(transport);
    const viewer = await port.viewer(TOKEN);
    assert.deepEqual(viewer, { id: 501, login: 'alice', scopes: ['repo', 'read:org'], scopesKnown: true });
    assert.deepEqual((await port.listOwners(TOKEN, viewer)).map((owner) => owner.login), ['alice', 'alice-co']);
  });

  it('reports unknown scopes honestly for tokens that do not expose them', async () => {
    const { transport } = api({ 'GET /user': () => ({ status: 200, body: { id: 5, login: 'carol' } }) });
    const viewer = await createRestGitHubPort(transport).viewer(TOKEN);
    assert.equal(viewer.scopesKnown, false);
  });

  it('treats a repository that redirects to a different owner or name as not found', async () => {
    const { transport } = api({ 'GET /repos/alice/site': () => ({ status: 200, body: repoJson({ full_name: 'mallory/site', name: 'site', owner: { login: 'mallory', id: 1 } }) }), 'GET /repos/alice/gone': () => ({ status: 404 }) });
    const port = createRestGitHubPort(transport);
    assert.equal(await port.getRepo(TOKEN, 'alice', 'site'), null);
    assert.equal(await port.getRepo(TOKEN, 'alice', 'gone'), null);
  });

  it('maps GitHub failures to precise, safe errors without leaking provider bodies', async () => {
    const cases: Array<[number, Record<string, string> | undefined, string]> = [
      [401, undefined, 'unauthorized'],
      [403, { 'x-ratelimit-remaining': '0' }, 'rate_limited'],
      [403, { 'x-oauth-scopes': 'public_repo' }, 'forbidden_scope'],
      [403, { 'x-oauth-scopes': 'repo' }, 'forbidden_owner'],
      [500, undefined, 'unavailable'],
    ];
    for (const [status, headers, code] of cases) {
      const { transport } = api({ 'GET /user': () => ({ status, headers, body: { message: `SECRET detail ${TOKEN}` } }) });
      await assert.rejects(createRestGitHubPort(transport).viewer(TOKEN), (error) => error instanceof GitHubPortError && error.code === code && !error.message.includes(TOKEN) && !error.message.includes('SECRET'), `${status} ${code}`);
    }
  });
});

describe('GitHub REST adapter: repository creation', () => {
  it('creates a personal private repository with an initial commit and checks the owner', async () => {
    const { transport, requests } = api({ 'POST /user/repos': () => ({ status: 201, body: repoJson() }) });
    const repo = await createRestGitHubPort(transport).createRepo(TOKEN, { owner: alice, viewerLogin: 'alice', name: 'site', private: true, description: 'd' });
    assert.equal(repo.private, true);
    assert.equal(requests[0].path, '/user/repos');
    assert.deepEqual(requests[0].body, { name: 'site', description: 'd', private: true, auto_init: true, has_issues: true });
  });

  it('creates under an organization through the organization endpoint', async () => {
    const org: GitHubOwner = { login: 'alice-co', id: 777, type: 'Organization' };
    const { transport, requests } = api({ 'POST /orgs/alice-co/repos': () => ({ status: 201, body: repoJson({ full_name: 'alice-co/site', owner: { login: 'alice-co', id: 777 } }) }) });
    await createRestGitHubPort(transport).createRepo(TOKEN, { owner: org, viewerLogin: 'alice', name: 'site', private: true, description: 'd' });
    assert.equal(requests[0].path, '/orgs/alice-co/repos');
  });

  it('rejects a repository created under a different owner than the one approved', async () => {
    const { transport } = api({ 'POST /user/repos': () => ({ status: 201, body: repoJson({ owner: { login: 'eve', id: 666 } }) }) });
    await assert.rejects(createRestGitHubPort(transport).createRepo(TOKEN, { owner: alice, viewerLogin: 'alice', name: 'site', private: true, description: 'd' }), (error) => error instanceof GitHubPortError && error.code === 'forbidden_owner');
  });

  it('maps a name collision, and marks lost responses as ambiguous', async () => {
    const taken = api({ 'POST /user/repos': () => ({ status: 422, body: { message: 'name already exists' } }) });
    await assert.rejects(createRestGitHubPort(taken.transport).createRepo(TOKEN, { owner: alice, viewerLogin: 'alice', name: 'site', private: true, description: 'd' }), (error) => error instanceof GitHubPortError && error.code === 'name_taken' && !error.ambiguous);
    const flaky = api({ 'POST /user/repos': () => ({ status: 502 }) });
    await assert.rejects(createRestGitHubPort(flaky.transport).createRepo(TOKEN, { owner: alice, viewerLogin: 'alice', name: 'site', private: true, description: 'd' }), (error) => error instanceof GitHubPortError && error.ambiguous === true);
    const down: GitHubTransport = async () => { throw new Error('socket hang up'); };
    await assert.rejects(createRestGitHubPort(down).createRepo(TOKEN, { owner: alice, viewerLogin: 'alice', name: 'site', private: true, description: 'd' }), (error) => error instanceof GitHubPortError && error.ambiguous === true);
  });
});

/** A GitHub Git Data API stand-in that stores blobs and trees so the adapter's read-back verification is real. */
function gitApi(options: { headSha?: string | null; tamperTree?: boolean; refStatus?: number } = {}) {
  const blobs = new Map<string, string>();
  const trees = new Map<string, Array<{ path: string; type: string; sha: string }>>();
  let head: string | null = options.headSha === undefined ? 'a'.repeat(40) : options.headSha;
  const handlers: Parameters<typeof api>[0] = {
    'GET /repos/alice/site/git/ref/heads/main': () => (head ? { status: 200, body: { object: { sha: head } } } : { status: 404 }),
    'POST /repos/alice/site/git/blobs': (request) => {
      const body = request.body as { content: string };
      const content = Buffer.from(body.content, 'base64').toString('utf8');
      const sha = gitBlobSha(content);
      blobs.set(sha, content);
      return { status: 201, body: { sha } };
    },
    'POST /repos/alice/site/git/trees': (request) => {
      const entries = (request.body as { tree: Array<{ path: string; sha: string }> }).tree.map((entry) => ({ ...entry, type: 'blob' }));
      const sha = `tree${trees.size + 1}`.padEnd(40, '0');
      trees.set(sha, options.tamperTree ? [...entries, { path: 'injected.txt', type: 'blob', sha: 'f'.repeat(40) }] : entries);
      return { status: 201, body: { sha } };
    },
    'POST /repos/alice/site/git/commits': () => ({ status: 201, body: { sha: 'c'.repeat(40) } }),
    'PATCH /repos/alice/site/git/refs/heads/main': (request) => {
      assert.equal((request.body as { force: boolean }).force, false, 'a push never forces');
      if (options.refStatus) return { status: options.refStatus, body: { message: 'Update is not a fast forward' } };
      head = 'c'.repeat(40);
      return { status: 200, body: {} };
    },
    'POST /repos/alice/site/git/refs': () => {
      head = 'c'.repeat(40);
      return { status: 201, body: {} };
    },
    'GET /repos/alice/site/git/commits/': () => ({ status: 200, body: { tree: { sha: [...trees.keys()].pop() } } }),
    'GET /repos/alice/site/git/trees/': (request) => ({ status: 200, body: { truncated: false, tree: trees.get(request.path.split('/trees/')[1].split('?')[0]) } }),
  };
  return { ...api(handlers), blobs };
}

const files = [{ path: 'index.html', content: '<h1>Hi</h1>' }, { path: 'src/app.ts', content: 'export const x = 1;\n' }];

describe('GitHub REST adapter: pushing a revision', () => {
  it('writes blobs, a tree, a commit and a non-forced ref, then verifies GitHub holds exactly those files', async () => {
    const { transport, requests, blobs } = gitApi();
    const result = await createRestGitHubPort(transport).pushFiles(TOKEN, { owner: 'alice', repo: 'site', branch: 'main', files, message: 'Xroga: revision 2' });
    assert.equal(result.kind, 'pushed');
    if (result.kind === 'pushed') {
      assert.equal(result.verifiedFiles, 2);
      assert.equal(result.parentSha, 'a'.repeat(40));
    }
    assert.equal(blobs.size, 2);
    const commit = requests.find((request) => request.path.endsWith('/git/commits') && request.method === 'POST')!.body as { parents: string[]; message: string };
    assert.deepEqual(commit.parents, ['a'.repeat(40)]);
    assert.equal(commit.message, 'Xroga: revision 2');
  });

  it('sends the token only in the authorization channel, never in a path or body', async () => {
    const { transport, requests } = gitApi();
    await createRestGitHubPort(transport).pushFiles(TOKEN, { owner: 'alice', repo: 'site', branch: 'main', files, message: 'm' });
    for (const request of requests) {
      assert.equal(request.token, TOKEN);
      assert.ok(!request.path.includes(TOKEN));
      assert.ok(!JSON.stringify(request.body ?? '').includes(TOKEN));
    }
  });

  it('reports a diverged remote without pushing anything when the expected head is stale', async () => {
    const { transport, requests } = gitApi({ headSha: 'b'.repeat(40) });
    const result = await createRestGitHubPort(transport).pushFiles(TOKEN, { owner: 'alice', repo: 'site', branch: 'main', files, message: 'm', expectedHead: 'a'.repeat(40) });
    assert.deepEqual(result, { kind: 'diverged', remoteHead: 'b'.repeat(40) });
    assert.ok(!requests.some((request) => request.method === 'POST'), 'nothing was written');
  });

  it('reports divergence when GitHub refuses a non-fast-forward update, rather than forcing it', async () => {
    const { transport } = gitApi({ refStatus: 422 });
    const result = await createRestGitHubPort(transport).pushFiles(TOKEN, { owner: 'alice', repo: 'site', branch: 'main', files, message: 'm' });
    assert.equal(result.kind, 'diverged');
  });

  it('fails verification when GitHub holds different content than was pushed', async () => {
    const { transport } = gitApi({ tamperTree: true });
    const result = await createRestGitHubPort(transport).pushFiles(TOKEN, { owner: 'alice', repo: 'site', branch: 'main', files, message: 'm' });
    assert.equal(result.kind, 'verification_failed');
  });
});

describe('GitHub naming rules', () => {
  it('validates repository and branch names', () => {
    for (const ok of ['site', 'my-app_2', 'a.b', 'A1']) assert.equal(validRepositoryName(ok), true, ok);
    for (const bad of ['', '.', '..', '.hidden', 'x.git', 'a b', 'a/b', 'é', 'a'.repeat(101)]) assert.equal(validRepositoryName(bad), false, bad);
    for (const ok of ['main', 'release/1.0', 'feat_x']) assert.equal(validBranchName(ok), true, ok);
    for (const bad of ['', '/main', 'main/', 'a..b', 'x.lock', 'a b']) assert.equal(validBranchName(bad), false, bad);
  });
  it('computes git blob hashes the way git does', () => {
    assert.equal(gitBlobSha('hello\n'), 'ce013625030ba8dba906f756967f9e9ca394464a');
    assert.equal(gitBlobSha(''), 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  });
});
