import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { clearGitHubConnection, getGitHubStorageMeta, getGitHubToken, saveGitHubConnection } from './githubAuth.js';

test('GitHub authority outages and durable revocation prevent stale mirror resurrection', async () => {
  let mode = 'outage';
  const calls: Array<{ path: string; method: string; body: string }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const path = req.url ?? '';
      calls.push({ path, method: req.method ?? '', body });
      const storage = path.startsWith('/storage/');
      const primary = path.startsWith('/rest/v1/github_integrations');
      const fail = mode === 'outage' || (mode === 'legacy-outage' && !primary) || (mode === 'cleanup-failure' && storage);
      res.writeHead(fail ? 400 : 200, { 'Content-Type': 'application/json' });
      if (fail) res.end(JSON.stringify({ message: 'SYNTHETIC_PRIVATE_ERROR', code: '42P01' }));
      else if (path==='/rest/v1/rpc/revoke_github_oauth_connection') res.end('true');
      else if (storage) res.end(JSON.stringify({ access_token: 'synthetic-stale-token', username: 'fixture' }));
      else if (req.method !== 'GET') res.end('null');
      else if (mode === 'revoked') res.end(JSON.stringify([{ access_token: '' }]));
      else if (mode === 'active') res.end(JSON.stringify([{ access_token: 'synthetic-current-token' }]));
      else if (mode === 'legacy-revoked' && !primary) res.end(JSON.stringify([{ access_token: 'synthetic-stale-token', metadata: { revoked: true } }]));
      else if (mode === 'legacy-only' && !primary) res.end(JSON.stringify([{ access_token: 'synthetic-stale-token', metadata: {} }]));
      else res.end('[]');
    });
  });
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_DB_PASSWORD'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const user = '11111111-1111-4111-8111-111111111111';
  try {
    for (const key of keys) delete process.env[key];
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    assert.equal(await getGitHubToken(user), null);
    await assert.rejects(clearGitHubConnection(user), { message: 'GitHub revocation could not be recorded. Retry shortly.' });
    await assert.rejects(saveGitHubConnection(user, 'synthetic-new-token', { providerUserId: '123', username: 'fixture', authorizationRevision:'10000000-0000-4000-8000-000000000001' }),
      { message: 'GitHub connection could not be saved. Retry shortly.' });
    assert.ok(calls.every(call => call.path.startsWith('/rest/v1/github_integrations') || call.path.startsWith('/rest/v1/rpc/')));
    for (mode of ['legacy-outage', 'revoked', 'legacy-revoked']) {
      calls.length = 0;
      assert.equal(await getGitHubToken(user), null);
      assert.equal(await getGitHubStorageMeta(user), null);
      assert.ok(calls.every(call => !call.path.startsWith('/storage/')));
    }
    mode = 'active';
    assert.equal(await getGitHubToken(user), 'synthetic-current-token');
    mode = 'legacy-only';
    assert.equal(await getGitHubToken(user), 'synthetic-stale-token', 'A matching active legacy database grant remains supported');
    mode = 'orphan';calls.length=0;
    assert.equal(await getGitHubToken(user),null);
    assert.equal(await getGitHubStorageMeta(user),null);
    assert.ok(calls.every(call=>!call.path.startsWith('/storage/')),'Empty authority is not a storage-only credential grant');
    mode = 'cleanup-failure';
    calls.length = 0;
    await assert.rejects(clearGitHubConnection(user), { message: 'GitHub disconnected, but legacy copy cleanup is pending. Retry shortly.' });
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].path,'/rest/v1/rpc/revoke_github_oauth_connection');
    assert.deepEqual(JSON.parse(calls[0].body),{p_owner_id:user});
    assert.ok(calls[1].path.startsWith('/storage/'));
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
