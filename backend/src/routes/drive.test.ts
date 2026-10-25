import assert from 'node:assert/strict';
import { createTenantContext, type TenantContext } from '../security/tenantContext.js';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import express from 'express';
import { sha256Hex } from '../storage/integrity.js';
import { harness, type Harness } from '../storage/testing/harness.js';
import { createDriveRouter } from './drive.js';

/** Real HTTP server, real router and validation; identity is injected exactly where authMiddleware would set it. */
describe('/api/drive routes', () => {
  let h: Harness;
  let base: string;
  let server: ReturnType<ReturnType<typeof express>['listen']>;
  let configured = true;

  before(async () => {
    h = harness();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const as = req.header('x-test-user');
      // what Batch 1's auth middleware does: an ISSUED context, never a bare user id
      if (as) {
        const r = req as unknown as { userId: string; tenantContext: TenantContext | undefined };
        const issued = createTenantContext({ userId: as, via: 'local_jwt' });
        // x-test-forge simulates a caller that has a user id but no issued context
        const forged: Record<string, () => TenantContext | undefined> = {
          missing: () => undefined,
          plain: () => ({ userId: as, tenantId: as, provenance: 'local_jwt', correlationId: 'x' }) as TenantContext,
          spread: () => ({ ...issued }),
          json: () => JSON.parse(JSON.stringify(issued)),
        };
        const mode = req.header('x-test-forge');
        r.tenantContext = mode ? forged[mode]() : issued;
        r.userId = as; // the middleware sets both
      }
      next();
    });
    app.use('/api/drive', createDriveRouter(() => (configured ? h.svc : null)));
    await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/drive`;
  });
  after(() => { server.close(); });

  const call = async (user: string | null, method: string, path: string, body?: unknown) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(user ? { 'x-test-user': user } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: r.status, cache: r.headers.get('cache-control'), json: (text ? JSON.parse(text) : null) as any, text };
  };

  it('end to end over HTTP: initiate, upload to the synthetic provider, complete, sign, download, delete', async () => {
    const body = Buffer.from('over http');
    const i = await call(h.alice.userId, 'POST', '/uploads', { filename: 'h.txt', contentType: 'text/plain', size: body.length, sha256: sha256Hex(body) });
    assert.equal(i.status, 201);
    assert.equal(i.cache, 'no-store');
    assert.equal(h.store.clientPut(i.json.upload.url, i.json.upload.headers, body).status, 200);
    const c = await call(h.alice.userId, 'POST', `/uploads/${i.json.objectId}/complete`, {});
    assert.equal(c.status, 200);
    assert.equal(c.json.state, 'READY');
    const d = await call(h.alice.userId, 'POST', `/objects/${i.json.objectId}/download-url`, {});
    assert.equal(d.status, 200);
    assert.deepEqual(h.store.clientGet(d.json.url).body, body);
    const list = await call(h.alice.userId, 'GET', '/objects');
    assert.equal(list.json.objects.length, 1);
    assert.equal((await call(h.alice.userId, 'DELETE', `/objects/${i.json.objectId}`)).status, 204);
    assert.equal((await call(h.alice.userId, 'POST', `/objects/${i.json.objectId}/download-url`, {})).status, 404);
  });

  it('identity cannot be supplied by the client: owner/tenant fields are rejected, other users get 404', async () => {
    const i = await call(h.alice.userId, 'POST', '/uploads', { filename: 'a.txt', contentType: 'text/plain', size: 1 });
    assert.equal((await call(h.alice.userId, 'POST', '/uploads', { filename: 'a.txt', contentType: 'text/plain', size: 1, tenantId: h.bob.tenantId })).status, 400);
    assert.equal((await call(h.alice.userId, 'POST', '/uploads', { filename: 'a.txt', contentType: 'text/plain', size: 1, ownerUserId: h.bob.userId })).status, 400);
    assert.equal((await call(h.alice.userId, 'POST', '/uploads', { filename: 'a.txt', contentType: 'text/plain', size: 1, bucket: 'other' })).status, 400);
    assert.equal((await call(h.bob.userId, 'POST', `/uploads/${i.json.objectId}/complete`, {})).status, 404);
    assert.equal((await call(h.bob.userId, 'GET', `/objects/${i.json.objectId}`)).status, 404);
    assert.equal((await call(h.bob.userId, 'DELETE', `/objects/${i.json.objectId}`)).status, 404);
  });

  it('refuses unauthenticated calls, malformed ids and bad bodies without leaking internals', async () => {
    assert.equal((await call(null, 'GET', '/objects')).status, 401);
    assert.equal((await call(h.alice.userId, 'GET', '/objects/not-a-uuid')).status, 404);
    assert.equal((await call(h.alice.userId, 'GET', '/objects?limit=99999')).status, 400);
    const bad = await call(h.alice.userId, 'POST', '/uploads', { filename: '', contentType: 'x', size: 'big' });
    assert.equal(bad.status, 400);
    assert.ok(!/v1\/tenants|xroga-drive-test|stack|at /.test(bad.text));
    assert.equal((await call(h.alice.userId, 'POST', '/uploads', { filename: 'a.exe', contentType: 'application/octet-stream', size: 1 })).status, 415);
  });

  it('quota exhaustion is a 413; unconfigured storage is a 503, never a silent local fallback', async () => {
    const q = harness({ quota: async () => 5 });
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { const r = req as unknown as { userId: string; tenantContext: TenantContext }; r.tenantContext = createTenantContext({ userId: q.alice.userId, via: 'local_jwt' }); r.userId = q.alice.userId; next(); });
    app.use('/d', createDriveRouter(() => q.svc));
    const srv = await new Promise<ReturnType<typeof app.listen>>((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    try {
      const r = await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/d/uploads`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: 'a.txt', contentType: 'text/plain', size: 6 }) });
      assert.equal(r.status, 413);
      assert.equal(((await r.json()) as { code: string }).code, 'QUOTA_EXCEEDED');
    } finally { srv.close(); }
    configured = false;
    const off = await call(h.alice.userId, 'GET', '/objects');
    configured = true;
    assert.equal(off.status, 503);
    assert.equal(off.json.code, 'STORAGE_NOT_CONFIGURED');
  });

  it('a user id without an ISSUED TenantContext never reaches Drive: missing, hand-built, spread and JSON-cloned contexts are 401', async () => {
    const before = (await call(h.alice.userId, 'GET', '/objects')).json.objects.length;
    for (const mode of ['missing', 'plain', 'spread', 'json']) {
      const r = await fetch(base + '/uploads', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-user': h.alice.userId, 'x-test-forge': mode }, body: JSON.stringify({ filename: 'f.txt', contentType: 'text/plain', size: 1 }) });
      assert.equal(r.status, 401, mode);
      assert.equal(((await r.json()) as { code: string }).code, 'TENANT_AUTH_REQUIRED', mode);
    }
    assert.equal((await call(h.alice.userId, 'GET', '/objects')).json.objects.length, before);
  });
});
