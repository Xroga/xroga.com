import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';

test('GitHub settings require exact active owner receipt and never rewrite a token mirror', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const prior = keys.map(key => process.env[key]);
  process.env.SUPABASE_URL = 'http://127.0.0.1:49194';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  const original = globalThis.fetch;
  const owner = '11111111-1111-4111-8111-111111111111';
  let mode = 'ok', calls = 0;
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { (req as AuthRequest).userId = owner; next(); });
  const { default: router } = await import('./github.js'); app.use('/github', router);
  const { setGithubDefaultRepo } = await import('../services/integrations/githubAuth.js');
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.origin === base) return original(input, init);
    calls++;
    assert.equal(url.origin, process.env.SUPABASE_URL);
    assert.equal(url.pathname, '/rest/v1/github_integrations');
    assert.equal(init?.method, 'PATCH');
    assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
    assert.equal(url.searchParams.get('access_token'), 'neq.');
    assert.equal(url.searchParams.get('select'), 'user_id');
    assert.deepEqual(Object.keys(JSON.parse(String(init?.body))).sort(), ['default_repo', 'repo_strategy']);
    if (mode === 'outage') return Response.json({ message: 'PRIVATE_CANARY' }, { status: 503 });
    return Response.json(mode === 'missing' ? [] : mode === 'foreign' ? [{ user_id: 'foreign' }] :
      mode === 'duplicate' ? [{ user_id: owner }, { user_id: owner }] : [{ user_id: owner }]);
  };
  const settings = (defaultRepo = 'owner/repository') => fetch(`${base}/github/settings`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ repoStrategy: 'manual', defaultRepo }),
  });
  try {
    assert.equal((await settings()).status, 200);
    await setGithubDefaultRepo(owner, 'owner/repository');
    for (mode of ['missing', 'foreign', 'duplicate']) {
      assert.equal((await settings()).status, 409);
      await assert.rejects(setGithubDefaultRepo(owner, 'owner/repository'), /connection is unavailable/);
    }
    mode = 'outage'; const failed = await settings(); assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes('PRIVATE_CANARY'));
    await assert.rejects(setGithubDefaultRepo(owner, 'owner/repository'), /settings could not be saved/);
    const before = calls; assert.equal((await settings('https://foreign.invalid/repo')).status, 400);
    assert.equal(calls, before);
  } finally {
    globalThis.fetch = original;
    keys.forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
