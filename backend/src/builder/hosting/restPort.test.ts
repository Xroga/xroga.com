import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { VercelPortError, type VercelScope } from './port.js';
import { createRestVercelPort, type VercelTransport } from './restPort.js';

const TOKEN = 'vercel_oauth_token_value_for_contract_tests_only';
const TEAM: VercelScope = { kind: 'team', id: 'team_abcdefgh1234', slug: 'acme', name: 'Acme' };
const PERSONAL: VercelScope = { kind: 'personal', id: null, slug: 'alice', name: 'alice' };

interface Recorded {
  method: string;
  path: string;
  body: Record<string, unknown> | unknown[] | undefined;
  token: string;
}

function api(handler: (request: Recorded) => { status: number; body?: unknown }): { transport: VercelTransport; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const transport: VercelTransport = async (token, path, init) => {
    const recorded: Recorded = { method: (init?.method ?? 'GET').toUpperCase(), path, body: init?.body ? (JSON.parse(String(init.body)) as Recorded['body']) : undefined, token };
    requests.push(recorded);
    const result = handler(recorded);
    return new Response(result.body === undefined ? null : JSON.stringify(result.body), { status: result.status });
  };
  return { transport, requests };
}

const deployment = (over: Record<string, unknown> = {}) => ({ id: 'dpl_abc1234567', url: 'acme-tasks-abc.vercel.app', readyState: 'READY', target: null, projectId: 'prj_abc1234567', meta: { xrogaRevision: 'rev1', num: 5 }, ...over });

describe('Vercel REST adapter', () => {
  it('reads the account and its teams', async () => {
    const { transport } = api((request) => (request.path === '/v2/user' ? { status: 200, body: { user: { id: 'user_1', username: 'alice' } } } : { status: 200, body: { teams: [{ id: 'team_abcdefgh1234', slug: 'acme', name: 'Acme' }, { id: 'bad', slug: 'x' }] } }));
    const port = createRestVercelPort(transport);
    const viewer = await port.viewer(TOKEN);
    assert.deepEqual(viewer, { id: 'user_1', username: 'alice' });
    assert.deepEqual((await port.scopes(TOKEN, viewer)).map((scope) => scope.slug), ['alice', 'acme']);
  });

  it('reports whether a project is linked to Git', async () => {
    const linked = api(() => ({ status: 200, body: { id: 'prj_1', name: 'a', accountId: 'acc', link: { type: 'github', repo: 'o/r' } } }));
    assert.equal((await createRestVercelPort(linked.transport).getProject(TOKEN, PERSONAL, 'a'))?.gitLinked, true);
    const plain = api(() => ({ status: 200, body: { id: 'prj_2', name: 'b', accountId: 'acc' } }));
    assert.equal((await createRestVercelPort(plain.transport).getProject(TOKEN, PERSONAL, 'b'))?.gitLinked, false);
    const missing = api(() => ({ status: 404 }));
    assert.equal(await createRestVercelPort(missing.transport).getProject(TOKEN, PERSONAL, 'c'), null);
  });

  it('creates a project WITHOUT a Git repository, scoped to the team', async () => {
    const { transport, requests } = api(() => ({ status: 200, body: { id: 'prj_3', name: 'acme-tasks', accountId: 'team_abcdefgh1234', framework: 'nextjs' } }));
    const project = await createRestVercelPort(transport).createProject(TOKEN, TEAM, { name: 'acme-tasks', framework: 'nextjs' });
    assert.equal(requests[0].path, '/v11/projects?teamId=team_abcdefgh1234');
    assert.deepEqual(requests[0].body, { name: 'acme-tasks', framework: 'nextjs' });
    assert.ok(!('gitRepository' in (requests[0].body as object)), 'a project created by Xroga is never linked to Git');
    assert.equal(project.gitLinked, false);
  });

  it('writes environment variables only with the targets it was given', async () => {
    const { transport, requests } = api(() => ({ status: 201, body: {} }));
    await createRestVercelPort(transport).setEnv(TOKEN, PERSONAL, 'prj_abc1234567', [{ key: 'NEXT_PUBLIC_X', value: 'v', type: 'encrypted', target: ['preview'] }]);
    assert.equal(requests[0].path, '/v10/projects/prj_abc1234567/env?upsert=true');
    assert.deepEqual(requests[0].body, [{ key: 'NEXT_PUBLIC_X', value: 'v', type: 'encrypted', target: ['preview'] }]);
  });

  it('creates a PREVIEW deployment: files inline, identity in meta, and never a target', async () => {
    const { transport, requests } = api(() => ({ status: 200, body: deployment({ readyState: 'QUEUED' }) }));
    const created = await createRestVercelPort(transport).createPreviewDeployment(TOKEN, TEAM, { projectName: 'acme-tasks', files: [{ path: 'index.html', content: '<h1>Hi</h1>' }], framework: null, meta: { xrogaRevision: 'rev1' } });
    const body = requests[0].body as Record<string, unknown>;
    assert.equal(requests[0].path, '/v13/deployments?teamId=team_abcdefgh1234&forceNew=1&skipAutoDetectionConfirmation=1');
    assert.ok(!('target' in body), 'an omitted target is a preview; the adapter never sets one');
    assert.ok(!('gitSource' in body));
    assert.deepEqual(body.files, [{ file: 'index.html', data: Buffer.from('<h1>Hi</h1>').toString('base64'), encoding: 'base64' }]);
    assert.deepEqual(body.meta, { xrogaRevision: 'rev1' });
    assert.equal(created.readyState, 'QUEUED');
  });

  it('reads deployment status, identity metadata and the target, and keeps only string metadata', async () => {
    const { transport } = api(() => ({ status: 200, body: deployment() }));
    const read = await createRestVercelPort(transport).getDeployment(TOKEN, PERSONAL, 'dpl_abc1234567');
    assert.equal(read.readyState, 'READY');
    assert.equal(read.target, null);
    assert.deepEqual(read.meta, { xrogaRevision: 'rev1' });
    assert.equal(read.url, 'acme-tasks-abc.vercel.app');
    const odd = api(() => ({ status: 200, body: { id: 'dpl_abc1234567', url: 'x.vercel.app', readyState: 'WHATEVER' } }));
    await assert.rejects(createRestVercelPort(odd.transport).getDeployment(TOKEN, PERSONAL, 'dpl_abc1234567'), VercelPortError);
  });

  it('returns a bounded build-log tail for failures', async () => {
    const { transport } = api(() => ({ status: 200, body: Array.from({ length: 60 }, (_, i) => ({ text: `line ${i}` })) }));
    const tail = await createRestVercelPort(transport).buildLogTail(TOKEN, PERSONAL, 'dpl_abc1234567');
    assert.ok(tail.includes('line 59') && !tail.includes('line 10\n'));
    assert.ok(tail.length <= 1500);
  });

  it('promotes an existing deployment without rebuilding', async () => {
    const { transport, requests } = api(() => ({ status: 201 }));
    await createRestVercelPort(transport).promote(TOKEN, TEAM, 'prj_abc1234567', 'dpl_abc1234567');
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].path, '/v10/projects/prj_abc1234567/promote/dpl_abc1234567?teamId=team_abcdefgh1234');
    assert.equal(requests[0].body, undefined);
  });

  it('keeps the token in the authorization channel only', async () => {
    const { transport, requests } = api(() => ({ status: 200, body: deployment() }));
    const port = createRestVercelPort(transport);
    await port.getDeployment(TOKEN, TEAM, 'dpl_abc1234567');
    await port.promote(TOKEN, TEAM, 'prj_abc1234567', 'dpl_abc1234567');
    for (const request of requests) {
      assert.equal(request.token, TOKEN);
      assert.ok(!request.path.includes(TOKEN) && !JSON.stringify(request.body ?? '').includes(TOKEN));
    }
  });

  it('maps failures to precise, safe errors and marks lost responses ambiguous', async () => {
    for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [429, 'rate_limited'], [400, 'validation'], [503, 'unavailable']] as const) {
      const { transport } = api(() => ({ status, body: { error: { message: `SECRET detail ${TOKEN}` } } }));
      await assert.rejects(createRestVercelPort(transport).viewer(TOKEN), (error) => error instanceof VercelPortError && error.code === code && !error.message.includes(TOKEN) && !error.message.includes('SECRET'), String(status));
    }
    const flaky = api(() => ({ status: 502 }));
    await assert.rejects(createRestVercelPort(flaky.transport).promote(TOKEN, PERSONAL, 'prj_abc1234567', 'dpl_abc1234567'), (error) => error instanceof VercelPortError && error.ambiguous === true);
    const down: VercelTransport = async () => { throw new Error('socket hang up'); };
    await assert.rejects(createRestVercelPort(down).createPreviewDeployment(TOKEN, PERSONAL, { projectName: 'x1', files: [], framework: null, meta: {} }), (error) => error instanceof VercelPortError && error.ambiguous === true);
  });

  it('rejects malformed identifiers before any request is made', async () => {
    const { transport, requests } = api(() => ({ status: 200, body: {} }));
    const port = createRestVercelPort(transport);
    await assert.rejects(port.getProject(TOKEN, PERSONAL, '../etc'), VercelPortError);
    await assert.rejects(port.getDeployment(TOKEN, PERSONAL, 'dpl/../x'), VercelPortError);
    await assert.rejects(port.promote(TOKEN, PERSONAL, 'prj/../x', 'dpl_abc1234567'), VercelPortError);
    await assert.rejects(port.getProject(TOKEN, { ...TEAM, id: 'team_x; drop' }, 'ok-name'), VercelPortError);
    assert.equal(requests.length, 0);
  });
});
