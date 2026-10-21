import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, afterEach, before, describe, it } from 'node:test';
import { harness } from '../../storage/testing/harness.js';
import { setStorageServiceForTests } from '../../storage/runtime.js';

/** Fake PostgREST: records inserts so the tests can prove what was (not) written. */
describe('storeProjectFile compatibility modes', () => {
  const inserts: Array<Record<string, unknown>> = [];
  let server: ReturnType<typeof createServer>;
  let store: typeof import('./projectFiles.js');
  const saved = { ...process.env };

  const readBody = (req: IncomingMessage) => new Promise<string>((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b)); });

  before(async () => {
    server = createServer(async (req, res) => {
      const body = await readBody(req);
      if (req.method === 'POST' && req.url?.startsWith('/rest/v1/project_files')) {
        const row = JSON.parse(body) as Record<string, unknown>;
        inserts.push(row);
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: randomUUID(), ...row }));
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    process.env.SUPABASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
    for (const k of ['CLOUDFLARE_R2_ACCESS_KEY', 'CLOUDFLARE_R2_SECRET_KEY', 'CLOUDFLARE_R2_ACCOUNT_ID', 'CLOUDFLARE_ACCOUNT_ID']) delete process.env[k];
    store = await import('./projectFiles.js');
  });
  const DRIVE_ENV = { XROGA_DRIVE_R2_ACCOUNT_ID: 'a', XROGA_DRIVE_R2_ACCESS_KEY_ID: 'k', XROGA_DRIVE_R2_SECRET_ACCESS_KEY: 's', XROGA_DRIVE_R2_BUCKET: 'd', DATABASE_URL: 'postgres://x' };
  const driveEnv = () => Object.assign(process.env, DRIVE_ENV);
  afterEach(() => { inserts.length = 0; setStorageServiceForTests(undefined); delete process.env.STORAGE_WRITE_MODE; for (const k of Object.keys(DRIVE_ENV)) delete process.env[k]; });
  after(() => { server.close(); for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); });

  it('legacy mode (default) is unchanged and never claims canonical durability', async () => {
    const h = harness(); setStorageServiceForTests(h.svc);
    const f = await store.storeProjectFile(h.alice.userId, h.aliceProject, 'a.txt', 'hi', 'text/plain', 'code');
    assert.ok(f.fileUrl.startsWith('data:'), 'legacy data-URL fallback is still what it was');
    assert.notEqual(f.canonicalDurable, true);
    assert.equal(h.repo.objects.size, 0, 'nothing written to Drive');
    assert.equal(inserts[0].storage_object_id, undefined);
  });

  it('r2 mode writes a verified private object and records only a drive:// reference', async () => {
    process.env.STORAGE_WRITE_MODE = 'r2';
    driveEnv();
    const h = harness(); setStorageServiceForTests(h.svc);
    const f = await store.storeProjectFile(h.alice.userId, h.aliceProject, 'src_app.ts', 'export const x = 1;', 'text/plain', 'code');
    assert.equal(f.canonicalDurable, true);
    assert.match(f.fileUrl, /^drive:\/\/[0-9a-f-]{36}$/);
    assert.equal(inserts[0].storage_object_id, f.storageObjectId);
    assert.equal(inserts[0].file_path, null);
    assert.ok(!String(inserts[0].file_url).startsWith('http') && !String(inserts[0].file_url).startsWith('data:'));
    assert.equal((await h.repo.getObject(f.storageObjectId!))!.state, 'READY');
  });

  it('r2 mode fails closed: provider outage means an error, no data URL, no cache, no project_files row', async () => {
    process.env.STORAGE_WRITE_MODE = 'r2';
    driveEnv();
    const h = harness(); setStorageServiceForTests(h.svc);
    h.store.failNext('put', 'throw');
    await assert.rejects(store.storeProjectFile(h.alice.userId, h.aliceProject, 'a.txt', 'hi', 'text/plain', 'code'));
    assert.equal(inserts.length, 0);
  });

  it('r2 mode with Drive unconfigured fails closed too', async () => {
    process.env.STORAGE_WRITE_MODE = 'r2';
    driveEnv();
    setStorageServiceForTests(null);
    await assert.rejects(store.storeProjectFile(randomUUID(), randomUUID(), 'a.txt', 'hi', 'text/plain', 'code'), /not configured/);
    assert.equal(inserts.length, 0);
  });

  it('dual mode records canonical success, and records (not hides) a canonical failure', async () => {
    process.env.STORAGE_WRITE_MODE = 'dual';
    driveEnv();
    const h = harness(); setStorageServiceForTests(h.svc);
    const ok = await store.storeProjectFile(h.alice.userId, h.aliceProject, 'a.txt', 'hi', 'text/plain', 'code');
    assert.equal(ok.canonicalDurable, true);
    assert.equal(inserts[0].storage_object_id, ok.storageObjectId);
    h.store.failNext('put', 'throw');
    const partial = await store.storeProjectFile(h.alice.userId, h.aliceProject, 'b.txt', 'hi', 'text/plain', 'code');
    assert.notEqual(partial.canonicalDurable, true, 'one side succeeding is not canonical durability');
    assert.equal(inserts[1].storage_object_id, undefined);
  });

  it('an invalid STORAGE_WRITE_MODE fails closed: nothing is written anywhere', async () => {
    process.env.STORAGE_WRITE_MODE = 'banana';
    const h = harness(); setStorageServiceForTests(h.svc);
    await assert.rejects(store.storeProjectFile(h.alice.userId, h.aliceProject, 'a.txt', 'hi', 'text/plain', 'code'), /invalid storage configuration/);
    assert.equal(inserts.length, 0); assert.equal(h.repo.objects.size, 0);
  });

  it('dual mode with Drive unconfigured is a configuration error, not a quiet legacy write', async () => {
    process.env.STORAGE_WRITE_MODE = 'dual';
    Object.assign(process.env, { XROGA_DRIVE_R2_ACCOUNT_ID: 'a', XROGA_DRIVE_R2_ACCESS_KEY_ID: 'k', XROGA_DRIVE_R2_SECRET_ACCESS_KEY: 's', XROGA_DRIVE_R2_BUCKET: 'd', DATABASE_URL: 'postgres://x' });
    setStorageServiceForTests(null);
    try {
      await assert.rejects(store.storeProjectFile(randomUUID(), randomUUID(), 'a.txt', 'hi', 'text/plain', 'code'), /not configured/);
      assert.equal(inserts.length, 0);
    } finally { for (const k of ['XROGA_DRIVE_R2_ACCOUNT_ID', 'XROGA_DRIVE_R2_ACCESS_KEY_ID', 'XROGA_DRIVE_R2_SECRET_ACCESS_KEY', 'XROGA_DRIVE_R2_BUCKET', 'DATABASE_URL']) delete process.env[k]; }
  });

  it('flags never override tenant authorization: another user\'s project is refused in r2 mode and nothing is written', async () => {
    process.env.STORAGE_WRITE_MODE = 'r2';
    Object.assign(process.env, { XROGA_DRIVE_R2_ACCOUNT_ID: 'a', XROGA_DRIVE_R2_ACCESS_KEY_ID: 'k', XROGA_DRIVE_R2_SECRET_ACCESS_KEY: 's', XROGA_DRIVE_R2_BUCKET: 'd', DATABASE_URL: 'postgres://x' });
    const h = harness(); setStorageServiceForTests(h.svc);
    try {
      await assert.rejects(store.storeProjectFile(h.alice.userId, h.bobProject, 'a.txt', 'hi', 'text/plain', 'code'), (e: { code?: string }) => e.code === 'NOT_FOUND');
      assert.equal(inserts.length, 0); assert.equal(h.repo.objects.size, 0);
    } finally { for (const k of ['XROGA_DRIVE_R2_ACCOUNT_ID', 'XROGA_DRIVE_R2_ACCESS_KEY_ID', 'XROGA_DRIVE_R2_SECRET_ACCESS_KEY', 'XROGA_DRIVE_R2_BUCKET', 'DATABASE_URL']) delete process.env[k]; }
  });

  it('r2 mode with valid configuration still requires the verified private write (no data URL, no cache, no public URL)', async () => {
    process.env.STORAGE_WRITE_MODE = 'r2';
    Object.assign(process.env, { XROGA_DRIVE_R2_ACCOUNT_ID: 'a', XROGA_DRIVE_R2_ACCESS_KEY_ID: 'k', XROGA_DRIVE_R2_SECRET_ACCESS_KEY: 's', XROGA_DRIVE_R2_BUCKET: 'd', DATABASE_URL: 'postgres://x' });
    const h = harness(); setStorageServiceForTests(h.svc);
    try {
      const f = await store.storeProjectFile(h.alice.userId, h.aliceProject, 'a.txt', 'verified', 'text/plain', 'code');
      assert.equal(f.canonicalDurable, true);
      assert.ok(f.fileUrl.startsWith('drive://'));
    } finally { for (const k of ['XROGA_DRIVE_R2_ACCOUNT_ID', 'XROGA_DRIVE_R2_ACCESS_KEY_ID', 'XROGA_DRIVE_R2_SECRET_ACCESS_KEY', 'XROGA_DRIVE_R2_BUCKET', 'DATABASE_URL']) delete process.env[k]; }
  });
});
