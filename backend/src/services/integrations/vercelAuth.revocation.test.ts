import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { clearVercelConnection, getVercelToken, isVercelAccessTokenExpiring, saveVercelConnection } from './vercelAuth.js';

test('Vercel authority outages, revocation, public buckets and lost refresh leases fail closed', async () => {
  let mode = 'outage';
  const calls: Array<{ path: string; method: string; body: string }> = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const path = req.url ?? '';
      calls.push({ path, method: req.method ?? '', body });
      const storage = path.startsWith('/storage/');
      const fail = mode === 'outage' || (mode === 'cleanup-failure' && storage);
      res.writeHead(fail ? 400 : 200, { 'Content-Type': 'application/json' });
      if (fail) res.end(JSON.stringify({ message: 'SYNTHETIC_PRIVATE_ERROR', code: '42P01' }));
      else if (path === '/storage/v1/bucket') res.end(JSON.stringify([{ id: 'xroga-github-tokens', public: mode === 'public' }]));
      else if (storage) res.end(JSON.stringify({ access_token: 'synthetic-stale-token' }));
      else if (req.method === 'PATCH') res.end(mode === 'lost-lease' ? '[]' : JSON.stringify([{ user_id: 'fixture' }]));
      else if (req.method !== 'GET') res.end('null');
      else if (mode === 'revoked') res.end(JSON.stringify([{ access_token: '', metadata: { revoked: true } }]));
      else res.end('[]');
    });
  });
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_DB_PASSWORD'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();assert.ok(address && typeof address !== 'string');
  const user = '11111111-1111-4111-8111-111111111111';
  try {
    for (const key of keys) delete process.env[key];
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    assert.equal(await getVercelToken(user), null);
    await assert.rejects(clearVercelConnection(user), { message: 'Vercel revocation could not be recorded. Retry shortly.' });
    await assert.rejects(saveVercelConnection(user, 'synthetic-new-token', {}), { message: 'Vercel connection could not be saved. Retry shortly.' });
    assert.ok(calls.every(call => call.path.startsWith('/rest/v1/user_integrations')));
    mode = 'revoked';calls.length = 0;
    assert.equal(await getVercelToken(user), null);
    assert.ok(calls.every(call => !call.path.startsWith('/storage/')));
    mode = 'public';calls.length = 0;
    await saveVercelConnection(user, 'synthetic-new-token', {});
    assert.equal(calls.filter(call => call.path.startsWith('/storage/')).length, 1);
    assert.equal(calls.at(-1)?.path, '/storage/v1/bucket', 'A public bucket receives no token upload or repair');
    mode = 'lost-lease';calls.length = 0;
    await assert.rejects(saveVercelConnection(user, 'synthetic-rotated-token', {}, 'synthetic-old-lease'),
      { message: 'Vercel connection changed during refresh. Reconnect or retry.' });
    assert.equal(calls.length, 1);assert.equal(calls[0].method, 'PATCH');
    const query = new URL(calls[0].path, 'http://127.0.0.1').searchParams;
    assert.equal(query.get('user_id'), `eq.${user}`);
    assert.equal(query.get('provider'), 'eq.vercel');
    assert.equal(query.get('refresh_token'), 'eq.synthetic-old-lease');
    mode = 'cleanup-failure';calls.length = 0;
    await assert.rejects(clearVercelConnection(user), { message: 'Vercel disconnected, but legacy copy cleanup is pending. Retry shortly.' });
    assert.equal(JSON.parse(calls[0].body).metadata.revoked, true);
    assert.equal(JSON.parse(calls[0].body).refresh_token, null);
    assert.equal(isVercelAccessTokenExpiring('invalid-date'), true);
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
