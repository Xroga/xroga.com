import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { getGithubDefaultRepo } from './githubDeploy.js';

test('deployment metadata cannot revive revoked or replaced credentials or ignore authority errors', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  let mode = 'active';
  let reads = 0;
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    assert.equal(req.method, 'GET');
    assert.ok(['/rest/v1/github_integrations', '/rest/v1/user_integrations'].includes(url.pathname));
    assert.equal(url.searchParams.get('user_id'), 'eq.11111111-1111-4111-8111-111111111111');
    const metadata = url.searchParams.get('select') === 'repo_strategy,default_repo';
    const error = metadata && mode === 'outage';
    res.writeHead(error ? 400 : 200, { 'Content-Type': 'application/json' });
    if (error) { res.end(JSON.stringify({ code: 'XX000', message: 'private error' })); return; }
    if (metadata) { res.end(JSON.stringify([{ repo_strategy: 'manual', default_repo: 'owner/repo', access_token: 'UNTRUSTED_METADATA_TOKEN' }])); return; }
    if (url.pathname === '/rest/v1/github_integrations') { res.end(JSON.stringify([{ access_token: 'synthetic-current' }])); return; }
    assert.equal(url.searchParams.get('provider'), 'eq.github');
    reads++;
    const token = reads === 1 || mode === 'active' ? 'synthetic-current' : mode === 'revoked' ? '' : 'synthetic-reconnected';
    res.end(JSON.stringify([{ access_token: token }]));
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    for (mode of ['active', 'revoked', 'reconnected', 'outage']) {
      reads = 0;
      assert.equal(await getGithubDefaultRepo('11111111-1111-4111-8111-111111111111'), mode === 'active' ? 'owner/repo' : null);
      assert.equal(reads, mode === 'outage' ? 1 : 2);
    }
  } finally {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
