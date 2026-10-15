import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { createTenantContext } from '../security/tenantContext.js';

test('project deletion requires the exact transactional owner receipt and never acknowledges missing evidence', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const prior = keys.map(key => process.env[key]);
  process.env.SUPABASE_URL = 'http://127.0.0.1:49194';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  const original = globalThis.fetch;
  const owner = '11111111-1111-4111-8111-111111111111', project = '22222222-2222-4222-8222-222222222222';
  let receipt: unknown = { id: project, user_id: owner }, outage = false, calls = 0;
  const { default: router } = await import('./projects.js');
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { (req as AuthRequest).tenantContext = createTenantContext({ userId: owner, via: 'local_jwt' }); next(); });
  app.use('/projects', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.origin === base) return original(input, init);
    calls++;
    assert.equal(url.origin, process.env.SUPABASE_URL);
    assert.equal(url.pathname, '/rest/v1/rpc/delete_owned_project_atomic');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), { p_owner_id: owner, p_project_id: project });
    return outage ? Response.json({ message: 'PRIVATE_DATABASE_DETAIL' }, { status: 400 }) : Response.json(receipt);
  };
  const remove = (id = project) => fetch(`${base}/projects/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: project, project_id: owner }) });
  try {
    const result = await remove(); assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { success: true, id: project });
    for (receipt of [{ id: owner, user_id: owner }, { id: project, user_id: project }, {}, [], [{ id: project, user_id: owner }]]) {
      assert.equal((await remove()).status, 503);
    }
    receipt = null; assert.equal((await remove()).status, 404);
    outage = true; const failed = await remove(); assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes('PRIVATE_DATABASE_DETAIL'));
    const before = calls; assert.equal((await remove('invalid')).status, 404); assert.equal(calls, before);
  } finally {
    globalThis.fetch = original;
    keys.forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
