import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { createTenantContext } from '../security/tenantContext.js';

test('admin diagnostics deny non-admins, bound reads and report outages without private payloads', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const prior = keys.map(key => process.env[key]);
  process.env.SUPABASE_URL = 'http://127.0.0.1:49194';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  const original = globalThis.fetch;
  const owner = '11111111-1111-4111-8111-111111111111';
  let role = 'admin', outage = false, reads = 0;
  const { adminMiddleware } = await import('../middleware/admin.js');
  const { default: router } = await import('./admin.js');
  const app = express();
  app.use((req, _res, next) => { (req as AuthRequest).tenantContext = createTenantContext({ userId: owner, via: 'local_jwt' }); next(); });
  app.use('/admin', adminMiddleware, router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.origin === base) return original(input, init);
    assert.equal(url.origin, process.env.SUPABASE_URL);
    assert.ok(!init?.method || init.method === 'GET');
    if (url.pathname === '/rest/v1/profiles') {
      assert.equal(url.searchParams.get('id'), `eq.${owner}`);
      return Response.json({ id: owner, role });
    }
    reads++;
    const errors = url.pathname === '/rest/v1/system_errors';
    assert.ok(errors || url.pathname === '/rest/v1/deployment_status');
    assert.equal(url.searchParams.get('select'), errors
      ? 'id,timestamp,api,error_message,fallback_used,severity'
      : 'id,user_id,run_id,target,status,method,created_at,updated_at');
    assert.ok(Number(url.searchParams.get('limit')) > 0);
    assert.ok(Number(url.searchParams.get('limit')) <= (errors ? 200 : 100));
    if (outage) return Response.json({ message: 'PRIVATE_DATABASE_CANARY' }, { status: 503 });
    return Response.json(errors ? [{ id: 'log', error_message: 'Bearer synthetic-private-token', severity: 'error' }] : []);
  };
  try {
    for (role of ['member', 'guest', 'founder']) {
      assert.equal((await fetch(`${base}/admin/errors`)).status, 403);
      assert.equal((await fetch(`${base}/admin/deployments`)).status, 403);
    }
    assert.equal(reads, 0); role = 'admin';
    for (const path of ['errors', 'deployments']) {
      for (const limit of ['-1', '0', '1.5', 'NaN', 'Infinity', '9007199254740992', '1&limit=2']) {
        assert.equal((await fetch(`${base}/admin/${path}?limit=${limit}`)).status, 400);
      }
      assert.equal((await fetch(`${base}/admin/${path}?limit=999`)).status, 200);
      outage = true;
      const failed = await fetch(`${base}/admin/${path}`);
      assert.equal(failed.status, 503);
      const body = await failed.text();
      assert.ok(!body.includes('PRIVATE_DATABASE_CANARY'));
      assert.ok(!body.includes('[]'));
      outage = false;
    }
    const before = reads;
    assert.equal((await fetch(`${base}/admin/errors?severity=unknown`)).status, 400);
    assert.equal((await fetch(`${base}/admin/errors?api[x]=bad`)).status, 400);
    assert.equal(reads, before);
    const success = await fetch(`${base}/admin/errors`);
    assert.equal(success.status, 200);
    const body = await success.text();
    assert.ok(body.includes('[REDACTED]')); assert.ok(!body.includes('synthetic-private-token'));
  } finally {
    globalThis.fetch = original;
    keys.forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
