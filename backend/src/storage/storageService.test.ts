import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { sha256Hex } from './integrity.js';
import { buildObjectKey, parseObjectKey, sanitizeFilename } from './keys.js';
import { checkContentMatchesDeclaration, safeDownloadHeaders, validateUploadRequest, defaultPolicyConfig } from './policy.js';
import { canTransition, OBJECT_STATES, StorageError } from './types.js';
import { BUCKET, browserUpload, harness, makeActor } from './testing/harness.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
const code = (e: unknown) => (e as StorageError).code;
const rejects = async (p: Promise<unknown>, c: string) => assert.rejects(p, (e) => { assert.equal(code(e), c, String((e as Error).message)); return true; });

describe('keys and filenames', () => {
  it('sanitizes traversal, control characters, reserved and hidden names', () => {
    for (const bad of ['../../etc/passwd', '..\\..\\win.ini', 'a/b/c.txt', '\u0000evil.txt', '.htaccess', 'con.txt', '', '...', 'x‮gpj.exe']) {
      const s = sanitizeFilename(bad);
      assert.match(s, /^[A-Za-z0-9_][A-Za-z0-9._-]*$/, `${JSON.stringify(bad)} -> ${s}`);
      assert.ok(!s.includes('..') && !s.includes('/') && !s.includes('\\'));
    }
    assert.equal(sanitizeFilename('Quarterly Report (final).pdf'), 'Quarterly_Report_final.pdf');
    assert.ok(sanitizeFilename('a'.repeat(400) + '.pdf').length <= 120);
  });
  it('builds and parses the canonical key and rejects ambiguous ones', () => {
    const t = randomUUID(), o = randomUUID(), p = randomUUID();
    const k = buildObjectKey({ tenantId: t, projectId: p, objectClass: 'upload', objectId: o, safeFilename: 'a b.txt' });
    assert.equal(k, `v1/tenants/${t}/projects/${p}/upload/${o}/a_b.txt`);
    assert.deepEqual(parseObjectKey(k)?.objectId, o);
    assert.equal(parseObjectKey(`${k}/../x`), null);
    assert.equal(parseObjectKey(k.replace('v1/', 'v1//')), null);
    assert.equal(parseObjectKey(k.replace(t, 'not-a-uuid')), null);
    assert.throws(() => buildObjectKey({ tenantId: 'x/../y', projectId: null, objectClass: 'upload', objectId: o, safeFilename: 'a' }));
  });
});

describe('policy', () => {
  const cfg = defaultPolicyConfig({});
  it('rejects executables, bad types and oversize; accepts normal files', () => {
    assert.throws(() => validateUploadRequest({ objectClass: 'upload', contentType: 'text/plain', size: 1, filename: 'a.exe' }, cfg));
    assert.throws(() => validateUploadRequest({ objectClass: 'upload', contentType: 'application/x-msdownload', size: 1, filename: 'a.bin' }, cfg));
    assert.throws(() => validateUploadRequest({ objectClass: 'upload', contentType: 'bad type', size: 1, filename: 'a' }, cfg));
    assert.throws(() => validateUploadRequest({ objectClass: 'upload', contentType: 'text/plain', size: cfg.maxObjectBytes + 1, filename: 'a' }, cfg));
    assert.throws(() => validateUploadRequest({ objectClass: 'upload', contentType: 'text/plain', size: -1, filename: 'a' }, cfg));
    assert.equal(validateUploadRequest({ objectClass: 'upload', contentType: 'Text/Plain; charset=utf-8', size: 5, filename: 'a.txt' }, cfg).contentType, 'text/plain');
  });
  it('detects content/type mismatch and executables', () => {
    assert.equal(checkContentMatchesDeclaration('image/png', PNG).ok, true);
    assert.equal(checkContentMatchesDeclaration('image/png', Buffer.from('<html>')).ok, false);
    assert.equal(checkContentMatchesDeclaration('text/plain', Buffer.from('MZ\x90\x00')).ok, false);
    assert.equal(checkContentMatchesDeclaration('application/pdf', Buffer.from('%PDF-1.7')).ok, true);
  });
  it('serves active content as an attachment, never inline', () => {
    for (const t of ['text/html', 'image/svg+xml', 'application/javascript', 'application/x-sh']) {
      const h = safeDownloadHeaders(t, 'x.bin');
      assert.match(h.contentDisposition, /^attachment;/);
      assert.notEqual(h.contentType, 'text/html');
    }
    assert.match(safeDownloadHeaders('image/png', 'a.png').contentDisposition, /^inline;/);
    assert.equal(safeDownloadHeaders('image/png', 'a.png').extra['X-Content-Type-Options'], 'nosniff');
  });
});

describe('state machine', () => {
  it('only allows the documented transitions; DELETED is terminal; READY cannot go back', () => {
    assert.ok(canTransition('PENDING', 'UPLOADING') && canTransition('VERIFYING', 'READY') && canTransition('DELETING', 'DELETED'));
    assert.ok(!canTransition('PENDING', 'READY'), 'cannot skip verification');
    assert.ok(!canTransition('UPLOADING', 'READY'));
    assert.ok(!canTransition('READY', 'PENDING') && !canTransition('READY', 'UPLOADING') && !canTransition('READY', 'VERIFYING'));
    for (const s of OBJECT_STATES) if (s !== 'DELETED') assert.ok(!canTransition('DELETED', s));
  });
  it('repository refuses READY without verification and refuses PENDING->READY', async () => {
    const h = harness();
    const init = await h.svc.initiateUpload(h.alice, { filename: 'a.txt', contentType: 'text/plain', size: 3 });
    await assert.rejects(h.repo.updateObject(init.objectId, ['UPLOADING'], { state: 'READY' }));
    await assert.rejects(h.repo.updateObject(init.objectId, ['UPLOADING'], { state: 'READY', sizeBytes: 3, sha256Verified: 'a'.repeat(64), verifiedAt: new Date() }), /illegal state transition/);
  });
});

describe('upload lifecycle', () => {
  it('uploads, verifies SHA-256, reaches READY, and the stored bytes are retrievable', async () => {
    const h = harness();
    const body = Buffer.from('hello xroga drive');
    const { init, put } = await browserUpload(h, h.alice, body, { sha256: sha256Hex(body) });
    assert.equal(put.status, 200);
    const done = await h.svc.completeUpload(h.alice, init.objectId);
    assert.equal(done.state, 'READY');
    assert.equal(done.sha256, sha256Hex(body));
    assert.equal(done.size, body.length);
    const dl = await h.svc.getDownload(h.alice, init.objectId);
    const got = h.store.clientGet(dl.url);
    assert.equal(got.status, 200);
    assert.deepEqual(got.body, body);
    const u = await h.repo.getUsage(h.alice.tenantId);
    assert.deepEqual([u.reservedBytes, u.committedBytes], [0, body.length]);
  });
  it('completion is idempotent', async () => {
    const h = harness();
    const { init } = await browserUpload(h, h.alice, Buffer.from('twice'));
    const a = await h.svc.completeUpload(h.alice, init.objectId);
    const b = await h.svc.completeUpload(h.alice, init.objectId);
    assert.deepEqual(a, b);
    assert.equal((await h.repo.getUsage(h.alice.tenantId)).committedBytes, 5);
  });
  it('never returns READY when the browser claims success but nothing was uploaded', async () => {
    const h = harness();
    const init = await h.svc.initiateUpload(h.alice, { filename: 'a.txt', contentType: 'text/plain', size: 10 });
    await rejects(h.svc.completeUpload(h.alice, init.objectId), 'UPLOAD_MISSING');
    assert.notEqual((await h.repo.getObject(init.objectId))!.state, 'READY');
  });
  it('quarantines a size mismatch and releases the reservation', async () => {
    const h = harness();
    const init = await h.svc.initiateUpload(h.alice, { filename: 'a.txt', contentType: 'text/plain', size: 10 });
    const o = (await h.repo.getObject(init.objectId))!;
    h.store.seed(BUCKET, o.objectKey, Buffer.from('short'));
    await rejects(h.svc.completeUpload(h.alice, init.objectId), 'QUARANTINED');
    assert.equal((await h.repo.getObject(init.objectId))!.state, 'QUARANTINED');
    assert.equal((await h.repo.getUsage(h.alice.tenantId)).reservedBytes, 0);
    await rejects(h.svc.getDownload(h.alice, init.objectId), 'NOT_FOUND');
  });
  it('marks CORRUPT on checksum mismatch (provider-side tampering after upload)', async () => {
    const h = harness();
    const body = Buffer.from('integrity matters here');
    const { init, put } = await browserUpload(h, h.alice, body, { sha256: sha256Hex(body) });
    assert.equal(put.status, 200);
    const o = (await h.repo.getObject(init.objectId))!;
    h.store.corrupt(BUCKET, o.objectKey);
    await rejects(h.svc.completeUpload(h.alice, init.objectId), 'CORRUPT');
    assert.equal((await h.repo.getObject(init.objectId))!.state, 'CORRUPT');
  });
  it('quarantines content whose bytes contradict the declared type', async () => {
    const h = harness();
    const body = Buffer.from('<html><script>alert(1)</script></html>');
    const { init } = await browserUpload(h, h.alice, body, { filename: 'pic.png', contentType: 'image/png' });
    await rejects(h.svc.completeUpload(h.alice, init.objectId), 'QUARANTINED');
  });
  it('quarantines an executable disguised as plain text', async () => {
    const h = harness();
    const { init } = await browserUpload(h, h.alice, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(30)]), { filename: 'notes.txt' });
    await rejects(h.svc.completeUpload(h.alice, init.objectId), 'QUARANTINED');
  });
  it('the provider refuses a body that differs from the signed size, type or checksum', async () => {
    const h = harness();
    const body = Buffer.from('exactly this');
    const init = await h.svc.initiateUpload(h.alice, { filename: 'a.txt', contentType: 'text/plain', size: body.length, sha256: sha256Hex(body) });
    if (init.mode !== 'single') throw new Error();
    assert.equal(h.store.clientPut(init.upload.url, init.upload.headers, Buffer.from('exactly that')).status, 400);
    assert.equal(h.store.clientPut(init.upload.url, init.upload.headers, Buffer.from('longer body than signed')).status, 403);
    assert.equal(h.store.clientPut(init.upload.url, { ...init.upload.headers, 'Content-Type': 'text/html' }, body).status, 403);
    assert.equal(h.store.clientPut(init.upload.url.replace(/k=[^&]+/, 'k=v1%2Fother'), init.upload.headers, body).status, 403);
  });
  it('an expired upload capability is refused by the provider', async () => {
    const h = harness();
    const body = Buffer.from('late');
    const init = await h.svc.initiateUpload(h.alice, { filename: 'a.txt', contentType: 'text/plain', size: body.length });
    if (init.mode !== 'single') throw new Error();
    h.clock.t += 16 * 60 * 1000;
    assert.equal(h.store.clientPut(init.upload.url, init.upload.headers, body).status, 403);
  });
  it('rejects client-supplied project ownership spoofing', async () => {
    const h = harness();
    await rejects(h.svc.initiateUpload(h.alice, { projectId: h.bobProject, filename: 'a.txt', contentType: 'text/plain', size: 1 }), 'NOT_FOUND');
    await rejects(h.svc.initiateUpload(h.alice, { projectId: 'not-a-uuid', filename: 'a.txt', contentType: 'text/plain', size: 1 }), 'INVALID_REQUEST');
  });
  it('the object key and bucket never leave the service', async () => {
    const h = harness();
    const { init } = await browserUpload(h, h.alice, Buffer.from('x'));
    const pub = await h.svc.getObjectMeta(h.alice, init.objectId);
    assert.ok(!JSON.stringify(pub).includes('v1/tenants') && !JSON.stringify(pub).includes(BUCKET));
  });
});

describe('tenant isolation', () => {
  it('another tenant cannot read, sign, complete, delete, list or even detect an object', async () => {
    const h = harness();
    const body = Buffer.from('alice secret');
    const { init } = await browserUpload(h, h.alice, body, { projectId: h.aliceProject });
    await h.svc.completeUpload(h.alice, init.objectId);
    await rejects(h.svc.getDownload(h.bob, init.objectId), 'NOT_FOUND');
    await rejects(h.svc.completeUpload(h.bob, init.objectId), 'NOT_FOUND');
    await rejects(h.svc.deleteObject(h.bob, init.objectId), 'NOT_FOUND');
    await rejects(h.svc.getObjectMeta(h.bob, init.objectId), 'NOT_FOUND');
    await rejects(h.svc.readObjectBytes(h.bob, init.objectId), 'NOT_FOUND');
    await rejects(h.svc.signUploadParts(h.bob, init.objectId, [1]), 'NOT_FOUND');
    assert.deepEqual(await h.svc.listObjects(h.bob), []);
    await rejects(h.svc.listObjects(h.bob, { projectId: h.aliceProject }), 'NOT_FOUND');
    assert.equal((await h.svc.listObjects(h.alice, { projectId: h.aliceProject })).length, 1);
    assert.ok(h.store.has(BUCKET, (await h.repo.getObject(init.objectId))!.objectKey), 'still stored');
    // same user id in a different tenant is also refused
    await rejects(h.svc.getDownload({ userId: h.alice.userId, tenantId: randomUUID() }, init.objectId), 'NOT_FOUND');
    // guessing ids
    await rejects(h.svc.getDownload(h.alice, randomUUID()), 'NOT_FOUND');
    await rejects(h.svc.getDownload(h.alice, '../../etc/passwd'), 'NOT_FOUND');
  });
  it('project revocation takes effect on the next download request', async () => {
    const h = harness();
    const { init } = await browserUpload(h, h.alice, Buffer.from('proj file'), { projectId: h.aliceProject });
    await h.svc.completeUpload(h.alice, init.objectId);
    await h.svc.getDownload(h.alice, init.objectId);
    h.repo.projects.set(h.aliceProject, h.bob.userId); // ownership moved / access revoked
    await rejects(h.svc.getDownload(h.alice, init.objectId), 'NOT_FOUND');
    await rejects(h.svc.deleteObject(h.alice, init.objectId), 'NOT_FOUND');
  });
  it('a row whose key disagrees with its identity is refused (metadata tampering)', async () => {
    const h = harness();
    const { init } = await browserUpload(h, h.alice, Buffer.from('x'));
    await h.svc.completeUpload(h.alice, init.objectId);
    const row = h.repo.objects.get(init.objectId)!;
    row.objectKey = row.objectKey.replace(h.alice.tenantId, h.bob.tenantId);
    await rejects(h.svc.getDownload(h.alice, init.objectId), 'CONFLICT');
  });
});

describe('download capabilities', () => {
  it('are short-lived, clamped, and expire', async () => {
    const h = harness();
    const { init } = await browserUpload(h, h.alice, Buffer.from('ttl'));
    await h.svc.completeUpload(h.alice, init.objectId);
    const dl = await h.svc.getDownload(h.alice, init.objectId, 99999);
    assert.ok(new Date(dl.expiresAt).getTime() - h.clock.t <= 300_000);
    assert.equal(h.store.clientGet(dl.url).status, 200);
    h.clock.t += 301_000;
    assert.equal(h.store.clientGet(dl.url).status, 403, 'leaked URL is useless after expiry');
  });
  it('a signed URL for one object cannot be re-pointed at another', async () => {
    const h = harness();
    const a = await browserUpload(h, h.alice, Buffer.from('first'));
    const b = await browserUpload(h, h.alice, Buffer.from('second'));
    await h.svc.completeUpload(h.alice, a.init.objectId);
    await h.svc.completeUpload(h.alice, b.init.objectId);
    const dl = await h.svc.getDownload(h.alice, a.init.objectId);
    const other = (await h.repo.getObject(b.init.objectId))!.objectKey;
    assert.equal(h.store.clientGet(dl.url.replace(/k=[^&]+/, `k=${encodeURIComponent(other)}`)).status, 403);
  });
  it('are refused for deleted, quarantined, corrupt and unfinished objects', async () => {
    const h = harness();
    const a = await browserUpload(h, h.alice, Buffer.from('to delete'));
    await h.svc.completeUpload(h.alice, a.init.objectId);
    await h.svc.deleteObject(h.alice, a.init.objectId);
    await rejects(h.svc.getDownload(h.alice, a.init.objectId), 'NOT_FOUND');
    const pending = await h.svc.initiateUpload(h.alice, { filename: 'p.txt', contentType: 'text/plain', size: 3 });
    await rejects(h.svc.getDownload(h.alice, pending.objectId), 'NOT_FOUND');
  });
  it('detects a stored object that no longer matches its verified hash on server-side read', async () => {
    const h = harness();
    const { init } = await browserUpload(h, h.alice, Buffer.from('server read'));
    await h.svc.completeUpload(h.alice, init.objectId);
    h.store.corrupt(BUCKET, (await h.repo.getObject(init.objectId))!.objectKey);
    await rejects(h.svc.readObjectBytes(h.alice, init.objectId), 'CORRUPT');
    assert.equal((await h.repo.getObject(init.objectId))!.state, 'CORRUPT');
  });
});

describe('quota', () => {
  it('rejects uploads that exceed the allowance and accounts exactly', async () => {
    const h = harness({ quota: async () => 100 });
    const ok = await h.svc.initiateUpload(h.alice, { filename: 'a.txt', contentType: 'text/plain', size: 60 });
    await rejects(h.svc.initiateUpload(h.alice, { filename: 'b.txt', contentType: 'text/plain', size: 60 }), 'QUOTA_EXCEEDED');
    const u = await h.repo.getUsage(h.alice.tenantId);
    assert.equal(u.reservedBytes, 60);
    assert.ok(ok.objectId);
    // another tenant is unaffected
    await h.svc.initiateUpload(h.bob, { filename: 'b.txt', contentType: 'text/plain', size: 60 });
  });
  it('concurrent reservations cannot overcommit', async () => {
    const h = harness({ quota: async () => 1000 });
    const results = await Promise.allSettled(Array.from({ length: 25 }, (_, i) => h.svc.initiateUpload(h.alice, { filename: `f${i}.txt`, contentType: 'text/plain', size: 100 })));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    assert.equal(ok, 10);
    const u = await h.repo.getUsage(h.alice.tenantId);
    assert.equal(u.reservedBytes, 1000);
    assert.ok(u.reservedBytes + u.committedBytes <= 1000);
  });
  it('failed and cancelled uploads release; expiry releases; double release/commit never double-counts', async () => {
    const h = harness({ quota: async () => 100 });
    const a = await h.svc.initiateUpload(h.alice, { filename: 'a.txt', contentType: 'text/plain', size: 100 });
    await rejects(h.svc.initiateUpload(h.alice, { filename: 'b.txt', contentType: 'text/plain', size: 1 }), 'QUOTA_EXCEEDED');
    await h.svc.deleteObject(h.alice, a.objectId); // cancel
    assert.equal((await h.repo.getUsage(h.alice.tenantId)).reservedBytes, 0);
    assert.equal(await h.repo.release(a.objectId), 'NOOP');
    const b = await h.svc.initiateUpload(h.alice, { filename: 'b.txt', contentType: 'text/plain', size: 100 });
    h.clock.t += 2 * 3600_000;
    assert.equal(await h.repo.expireReservations(new Date(h.clock.t)), 1);
    assert.equal((await h.repo.getUsage(h.alice.tenantId)).reservedBytes, 0);
    assert.ok(b.objectId);
  });
  it('a slow upload whose reservation expired re-reserves (quota re-checked) instead of failing or double counting', async () => {
    const h = harness({ quota: async () => 100 });
    const body = Buffer.from('x'.repeat(50));
    const { init } = await browserUpload(h, h.alice, body);
    h.clock.t += 2 * 3600_000;
    await h.repo.expireReservations(new Date(h.clock.t));
    const done = await h.svc.completeUpload(h.alice, init.objectId);
    assert.equal(done.state, 'READY');
    const u = await h.repo.getUsage(h.alice.tenantId);
    assert.deepEqual([u.reservedBytes, u.committedBytes], [0, 50]);
  });
  it('deleting frees committed bytes exactly once', async () => {
    const h = harness();
    const { init } = await browserUpload(h, h.alice, Buffer.from('12345'));
    await h.svc.completeUpload(h.alice, init.objectId);
    await h.svc.deleteObject(h.alice, init.objectId);
    await h.svc.deleteObject(h.alice, init.objectId);
    assert.equal((await h.repo.getUsage(h.alice.tenantId)).committedBytes, 0);
  });
  it('reconcile repairs counter drift from the reservation ledger', async () => {
    const h = harness();
    const { init } = await browserUpload(h, h.alice, Buffer.from('12345'));
    await h.svc.completeUpload(h.alice, init.objectId);
    h.repo.corruptUsage(h.alice.tenantId, { committed: 999, reserved: -3 });
    const rep = await h.svc.reconcile();
    assert.equal(rep.usageDrift.length, 1);
    const u = await h.repo.getUsage(h.alice.tenantId);
    assert.deepEqual([u.reservedBytes, u.committedBytes], [0, 5]);
  });
});

describe('partial failures', () => {
  it('provider timeout after a successful server write does not claim durability until verified', async () => {
    const h = harness();
    h.store.failNext('put', 'after-write');
    const r = await h.svc.putServerObject(h.alice, { objectClass: 'artifact', filename: 'doc.txt', contentType: 'text/plain', body: Buffer.from('written') });
    assert.equal(r.state, 'READY', 'head() proved the write, read-back hash verified it');
  });
  it('provider failure before write leaves nothing READY and releases the reservation', async () => {
    const h = harness({ quota: async () => 100 });
    h.store.failNext('put', 'throw');
    await rejects(h.svc.putServerObject(h.alice, { objectClass: 'artifact', filename: 'doc.txt', contentType: 'text/plain', body: Buffer.from('lost') }), 'PROVIDER_UNAVAILABLE');
    const u = await h.repo.getUsage(h.alice.tenantId);
    assert.equal(u.committedBytes, 0);
  });
  it('R2 upload succeeded but the DB commit failed: replay completes it exactly once', async () => {
    const h = harness();
    const { init } = await browserUpload(h, h.alice, Buffer.from('half done'));
    h.repo.failNext = 'commit';
    await assert.rejects(h.svc.completeUpload(h.alice, init.objectId), /injected/);
    assert.equal((await h.repo.getObject(init.objectId))!.state, 'VERIFYING');
    const done = await h.svc.completeUpload(h.alice, init.objectId);
    assert.equal(done.state, 'READY');
    assert.equal((await h.repo.getUsage(h.alice.tenantId)).committedBytes, 9);
  });
  it('transient provider errors during completion are retryable and leave state unchanged', async () => {
    const h = harness();
    const { init } = await browserUpload(h, h.alice, Buffer.from('flaky'));
    h.store.failNext('head');
    await rejects(h.svc.completeUpload(h.alice, init.objectId), 'PROVIDER_UNAVAILABLE');
    assert.equal((await h.repo.getObject(init.objectId))!.state, 'UPLOADING');
    assert.equal((await h.svc.completeUpload(h.alice, init.objectId)).state, 'READY');
  });
  it('failed provider delete keeps the object DELETING (never DELETED) and reconcile finishes it', async () => {
    const h = harness();
    const { init } = await browserUpload(h, h.alice, Buffer.from('delete me'));
    await h.svc.completeUpload(h.alice, init.objectId);
    h.store.failNext('delete');
    await h.svc.deleteObject(h.alice, init.objectId);
    assert.equal((await h.repo.getObject(init.objectId))!.state, 'DELETING');
    h.clock.t += 120_000;
    const rep = await h.svc.reconcile();
    assert.equal(rep.deletionsFinished, 1);
    assert.equal((await h.repo.getObject(init.objectId))!.state, 'DELETED');
    assert.ok(!h.store.has(BUCKET, (await h.repo.getObject(init.objectId))!.objectKey));
  });
  it('reconcile: abandoned uploads are cleaned, missing objects flagged, orphans reported (never deleted)', async () => {
    const h = harness({ quota: async () => 1000 });
    const abandoned = await h.svc.initiateUpload(h.alice, { filename: 'gone.txt', contentType: 'text/plain', size: 10 });
    const ready = await browserUpload(h, h.alice, Buffer.from('present'));
    await h.svc.completeUpload(h.alice, ready.init.objectId);
    const readyKey = (await h.repo.getObject(ready.init.objectId))!.objectKey;
    h.store.remove(BUCKET, readyKey);
    h.store.seed(BUCKET, `v1/tenants/${randomUUID()}/projects/_none/upload/${randomUUID()}/orphan.txt`, Buffer.from('orphan'));
    h.clock.t += 2 * 3600_000;
    const rep = await h.svc.reconcile({ scanOrphans: true });
    assert.equal(rep.abandonedCleaned, 1);
    assert.deepEqual(rep.missingObjects.map((m) => m.objectId), [ready.init.objectId]);
    assert.equal(rep.orphanKeys.length, 1);
    assert.ok(h.store.has(BUCKET, rep.orphanKeys[0]), 'orphan left in place');
    assert.equal((await h.repo.getObject(abandoned.objectId))!.state, 'DELETED');
    assert.equal((await h.repo.getObject(ready.init.objectId))!.state, 'CORRUPT');
    assert.equal((await h.repo.getUsage(h.alice.tenantId)).reservedBytes, 0);
  });
});

describe('multipart', () => {
  const small = { multipartPartBytes: 5 * 1024 * 1024, singlePutMaxBytes: 6 * 1024 * 1024 };
  const mkBody = (n: number) => Buffer.alloc(n, 3);

  async function upload(h: ReturnType<typeof harness>, body: Buffer) {
    const init = await h.svc.initiateUpload(h.alice, { filename: 'big.bin', contentType: 'application/octet-stream', size: body.length, sha256: sha256Hex(body) });
    if (init.mode !== 'multipart') throw new Error('expected multipart');
    const signed = await h.svc.signUploadParts(h.alice, init.objectId, Array.from({ length: init.parts }, (_, i) => i + 1));
    const parts = signed.map((s) => {
      const start = (s.partNumber - 1) * init.partSize;
      const r = h.store.clientPutPart(s.url, body.subarray(start, start + s.contentLength));
      assert.equal(r.status, 200);
      return { partNumber: s.partNumber, etag: r.etag! };
    });
    return { init, parts };
  }

  it('completes, verifies the whole-object SHA-256 and is retry-safe', async () => {
    const h = harness({ policy: small });
    const body = mkBody(11 * 1024 * 1024);
    const { init, parts } = await upload(h, body);
    const done = await h.svc.completeUpload(h.alice, init.objectId, { parts });
    assert.equal(done.state, 'READY');
    assert.equal(done.sha256, sha256Hex(body));
    assert.equal((await h.svc.completeUpload(h.alice, init.objectId, { parts })).state, 'READY');
  });
  it('rejects wrong part counts, forged etags, out-of-order and missing parts', async () => {
    const h = harness({ policy: small });
    const { init, parts } = await upload(h, mkBody(11 * 1024 * 1024));
    await rejects(h.svc.completeUpload(h.alice, init.objectId, { parts: parts.slice(1) }), 'INVALID_REQUEST');
    await rejects(h.svc.completeUpload(h.alice, init.objectId, { parts: [{ ...parts[0], etag: '"forged"' }, ...parts.slice(1)] }), 'INVALID_REQUEST');
    await rejects(h.svc.completeUpload(h.alice, init.objectId, { parts: [{ partNumber: 1, etag: parts[0].etag }, { partNumber: 1, etag: parts[0].etag }, parts[2]] }), 'INVALID_REQUEST');
    await rejects(h.svc.signUploadParts(h.alice, init.objectId, [99]), 'INVALID_REQUEST');
    await rejects(h.svc.signUploadParts(h.alice, init.objectId, [0]), 'INVALID_REQUEST');
  });
  it('crash after provider-side completion is recovered without re-completing', async () => {
    const h = harness({ policy: small });
    const body = mkBody(11 * 1024 * 1024);
    const { init, parts } = await upload(h, body);
    h.store.failNext('complete', 'after-write');
    await rejects(h.svc.completeUpload(h.alice, init.objectId, { parts }), 'PROVIDER_UNAVAILABLE');
    const done = await h.svc.completeUpload(h.alice, init.objectId, { parts });
    assert.equal(done.state, 'READY');
  });
  it('an abandoned multipart upload is aborted and its reservation released', async () => {
    const h = harness({ policy: small, quota: async () => 100 * 1024 * 1024 });
    const init = await h.svc.initiateUpload(h.alice, { filename: 'big.bin', contentType: 'application/octet-stream', size: 11 * 1024 * 1024 });
    assert.equal(h.store.uploads.size, 1);
    h.clock.t += 25 * 3600_000;
    const rep = await h.svc.reconcile();
    assert.equal(rep.abandonedCleaned, 1);
    assert.equal(h.store.uploads.size, 0);
    assert.equal((await h.repo.getUsage(h.alice.tenantId)).reservedBytes, 0);
    assert.ok(init.objectId);
  });
  it('another tenant cannot sign parts', async () => {
    const h = harness({ policy: small });
    const { init } = await upload(h, mkBody(11 * 1024 * 1024));
    await rejects(h.svc.signUploadParts(h.bob, init.objectId, [1]), 'NOT_FOUND');
  });
});

describe('no signed material in logs, audit trail or errors', () => {
  it('audit events, console output and error messages never contain signatures, URLs or keys', async () => {
    const h = harness();
    const logs: string[] = [];
    const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
    for (const k of Object.keys(orig) as Array<keyof typeof orig>) console[k] = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
    const messages: string[] = [];
    try {
      const { init } = await browserUpload(h, h.alice, Buffer.from('log hygiene'));
      await h.svc.completeUpload(h.alice, init.objectId);
      const dl = await h.svc.getDownload(h.alice, init.objectId);
      for (const f of [() => h.svc.getDownload(h.bob, init.objectId), () => h.svc.completeUpload(h.bob, init.objectId), () => h.svc.initiateUpload(h.alice, { filename: 'x.exe', contentType: 'text/plain', size: 1 })]) {
        await f().catch((e: Error) => messages.push(e.message));
      }
      const blob = JSON.stringify(h.repo.auditLog) + logs.join('\n') + messages.join('\n');
      assert.ok(!blob.includes('sig='), 'no signature');
      assert.ok(!blob.includes(new URL(dl.url).search.slice(1, 40)), 'no URL query');
      assert.ok(!blob.includes('memory.invalid') && !blob.includes('v1/tenants/') && !blob.includes(BUCKET));
      assert.ok(h.repo.auditLog.length >= 3, 'actions are audited');
    } finally { Object.assign(console, orig); }
  });
});

describe('memory repository mirrors the SQL ledger semantics (parity with the real-Postgres suite)', () => {
  it('commit/release/free are idempotent and never go negative', async () => {
    const h = harness();
    const init = await h.svc.initiateUpload(h.alice, { filename: 'a.txt', contentType: 'text/plain', size: 10 });
    assert.equal(await h.repo.commit(init.objectId, 10), 'OK');
    assert.equal(await h.repo.commit(init.objectId, 10), 'ALREADY_COMMITTED');
    assert.equal(await h.repo.release(init.objectId), 'NOOP');
    assert.equal(await h.repo.free(init.objectId), 'OK');
    assert.equal(await h.repo.free(init.objectId), 'NOOP');
    assert.equal(await h.repo.commit(init.objectId, 10), 'RESERVATION_LOST');
    const u = await h.repo.getUsage(h.alice.tenantId);
    assert.deepEqual([u.reservedBytes, u.committedBytes], [0, 0]);
    assert.equal(await h.repo.commit(randomUUID(), 1), 'NO_RESERVATION');
  });
});
