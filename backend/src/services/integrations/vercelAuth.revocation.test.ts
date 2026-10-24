import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { clearVercelConnection, getVercelToken, isVercelAccessTokenExpiring, saveVercelConnection } from './vercelAuth.js';
import { createTenantContext } from '../../security/tenantContext.js';
import { readFileSync } from 'node:fs';

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
      const fail = mode === 'outage' || (mode === 'cleanup-failure' && storage && body.includes('vercel.json'));
      res.writeHead(fail ? 400 : 200, { 'Content-Type': 'application/json' });
      if (fail) res.end(JSON.stringify({ message: 'SYNTHETIC_PRIVATE_ERROR', code: '42P01' }));
      else if (path === '/rest/v1/rpc/prepare_direct_oauth_write') res.end(JSON.stringify('33333333-3333-4333-8333-333333333333'));
      else if (path === '/rest/v1/rpc/save_direct_oauth_connection') res.end('true');
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
  const context=createTenantContext({userId:user,via:'remote_getuser'});
  try {
    for (const key of keys) delete process.env[key];
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    assert.equal(await getVercelToken(user), null);
    await assert.rejects(clearVercelConnection(context), { message: 'Vercel revocation could not be recorded. Retry shortly.' });
    await assert.rejects(saveVercelConnection(user, 'synthetic-new-token', {}), { message: 'OAuth connection could not be admitted. Retry shortly.' });
    assert.ok(calls.every(call => call.path.startsWith('/rest/v1/user_integrations')
      || call.path === '/rest/v1/rpc/prepare_direct_oauth_write'));
    mode = 'revoked';calls.length = 0;
    assert.equal(await getVercelToken(user), null);
    assert.ok(calls.every(call => !call.path.startsWith('/storage/')));
    mode = 'public';calls.length = 0;
    await saveVercelConnection(user, 'synthetic-new-token', {});
    assert.equal(calls.filter(call => call.path.startsWith('/storage/')).length, 0, 'New Vercel credentials never use the legacy object mirror');
    assert.ok(calls.some(call => call.path === '/rest/v1/rpc/save_direct_oauth_connection'));
    mode = 'lost-lease';calls.length = 0;
    await assert.rejects(saveVercelConnection(user, 'synthetic-rotated-token', {}, 'synthetic-old-lease'),
      { message: 'Vercel connection changed during refresh. Reconnect or retry.' });
    assert.equal(calls.length, 1);assert.equal(calls[0].method, 'GET');
    const query = new URL(calls[0].path, 'http://127.0.0.1').searchParams;
    assert.equal(query.get('user_id'), `eq.${user}`);
    assert.equal(query.get('provider'), 'eq.vercel');
    assert.ok(query.get('select')?.includes('credential_revision'));
    mode = 'cleanup-failure';calls.length = 0;
    await assert.rejects(clearVercelConnection(context), { message: 'Vercel disconnected, but legacy copy cleanup is pending. Retry shortly.' });
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

test('delayed pipeline auth failures report reauthorization without revoking a newer connection',()=>{
  const source=readFileSync(new URL('../../ai/pipeline.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/clearVercelConnection/);
  assert.equal((source.match(/status: reauth \? 'deploy_reauth_required' : 'deploy_failed'/g)||[]).length,2);
});
