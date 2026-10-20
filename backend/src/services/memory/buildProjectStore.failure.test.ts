import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { ensureProjectIdByRepo, findProjectIdByRepo, projectIdentityId, upsertBuildProject } from './buildProjectStore.js';
import {createTenantContext} from '../../security/tenantContext.js';

test('build persistence refuses unavailable identity reads and disappeared owner updates', async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const context=createTenantContext({userId:owner,via:'persisted_owner'});
  const project = '22222222-2222-4222-8222-222222222222';
  let mode: 'outage' | 'disappeared' | 'concurrent' = 'outage';
  const requests: { method: string; url: URL; body: Record<string, unknown> }[] = [];
  let created = false;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const url = new URL(req.url!, 'http://127.0.0.1');
    requests.push({ method: req.method!, url, body: raw ? JSON.parse(raw) : {} });
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'outage') {
      res.statusCode = 503;
      res.end(JSON.stringify({ code: 'XX000', message: 'PRIVATE_DATABASE_CANARY' }));
    } else if (mode === 'disappeared') {
      res.end(JSON.stringify(req.method === 'GET' ? [{ id: project,user_id:owner,github_repo_name:'fixture/re_po' }] : []));
    } else if (req.method === 'POST') {
      const alreadyCreated = created;
      created = true;
      res.end(JSON.stringify(alreadyCreated ? [] : [{ id: projectIdentityId(owner, 'fixture/re_po'),user_id:owner,github_repo_name:'fixture/re_po' }]));
    } else {
      res.end(JSON.stringify(created ? [{ id: projectIdentityId(owner, 'fixture/re_po'),user_id:owner,github_repo_name:'fixture/re_po' }] : []));
    }
  });
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_DB_PASSWORD'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    for (const key of keys) delete process.env[key];
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    const input = { userId: owner, name: 'fixture', userPrompt: 'fixture', githubRepoName: 'fixture/re_po', projectFiles: [] };
    assert.equal(await ensureProjectIdByRepo(context, input.githubRepoName), null);
    assert.equal(await upsertBuildProject(context,input), null);
    assert.equal(await findProjectIdByRepo(context, input.githubRepoName), null);
    assert.ok(requests.length > 0);
    assert.ok(requests.every(request => request.method === 'GET'));
    assert.ok(requests.every(request => request.url.searchParams.get('user_id') === `eq.${owner}`));
    assert.ok(requests.some(request => request.url.searchParams.get('github_repo_name') === 'ilike.fixture/re\\_po'));

    requests.length = 0;
    mode = 'disappeared';
    assert.equal(await upsertBuildProject(context,input), null);
    assert.deepEqual(requests.map(request => request.method), ['GET', 'POST']);
    assert.equal(requests[1]!.url.pathname,'/rest/v1/rpc/save_owned_build_project_atomic');
    assert.equal(requests[1]!.body.p_expected_id,project);
    assert.equal(requests[1]!.body.p_owner_id,owner);

    requests.length = 0;
    mode = 'concurrent';
    const results = await Promise.all([ensureProjectIdByRepo(context, input.githubRepoName), ensureProjectIdByRepo(context, input.githubRepoName)]);
    assert.deepEqual(results, [projectIdentityId(owner, input.githubRepoName), projectIdentityId(owner, input.githubRepoName)]);
    assert.ok(requests.filter(request => request.method === 'POST').every(request => request.body.user_id === owner));
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
