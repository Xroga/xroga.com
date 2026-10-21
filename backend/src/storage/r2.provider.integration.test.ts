import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { describe, it, after } from 'node:test';
import { sha256Hex } from './integrity.js';
import { defaultPolicyConfig } from './policy.js';
import { R2ObjectStore, r2ConfigFromEnv } from './r2ObjectStore.js';
import { MemoryStorageRepository } from './repository.js';
import { StorageService } from './storageService.js';
import type { StorageActor } from './types.js';

/**
 * REAL Cloudflare R2 provider suite. It has NEVER been executed: no authorised R2 test resource existed when it was written.
 * It runs only when ALL of these are set, and refuses otherwise (SKIP is reported as SKIP, never as PASS):
 *   XROGA_DRIVE_R2_ACCOUNT_ID / _ACCESS_KEY_ID / _SECRET_ACCESS_KEY / _BUCKET   an ISOLATED PRIVATE test bucket (name must contain test|staging|sandbox)
 *   XROGA_DRIVE_R2_TEST_CONFIRM=isolated-private-bucket-zero-incremental-cost    the operator's recorded confirmation
 *   XROGA_DRIVE_R2_TEST_ORIGIN=https://…                                         an origin the bucket's CORS policy is meant to allow
 * Everything it creates lives under one random synthetic tenant prefix and is deleted at the end by exact key; nothing else is touched.
 * Requests ids and statuses are written to PROVIDER_REPORT_OUT (default ./r2-provider-report.json) with signatures stripped.
 */
const env = process.env;
const cfg = (() => { try { return r2ConfigFromEnv(env); } catch { return null; } })();
const confirmed = env.XROGA_DRIVE_R2_TEST_CONFIRM === 'isolated-private-bucket-zero-incremental-cost';
const origin = env.XROGA_DRIVE_R2_TEST_ORIGIN;
const nameOk = !!cfg && /test|staging|sandbox/i.test(cfg.bucket);
const skip = cfg && confirmed && origin && nameOk ? false : 'R2 provider suite not authorised: needs XROGA_DRIVE_R2_* for an isolated test bucket (name contains test|staging|sandbox), XROGA_DRIVE_R2_TEST_CONFIRM and XROGA_DRIVE_R2_TEST_ORIGIN';

const report: { startedAt: string; observations: Array<Record<string, unknown>> } = { startedAt: new Date().toISOString(), observations: [] };
const redactUrl = (u: string) => u.replace(/X-Amz-(Signature|Credential|Security-Token)=[^&]+/gi, 'X-Amz-$1=[redacted]');
const note = (o: Record<string, unknown>) => report.observations.push(o);
const ids = (r: Response) => ({ status: r.status, requestId: r.headers.get('x-amz-request-id'), cfRay: r.headers.get('cf-ray') });

describe('Cloudflare R2 provider verification (REAL endpoint)', { skip }, () => {
  const store = new R2ObjectStore(cfg as NonNullable<typeof cfg>);
  const bucket = (cfg as NonNullable<typeof cfg>).bucket;
  const repo = new MemoryStorageRepository();
  const policy = { ...defaultPolicyConfig({}), singlePutMaxBytes: 6 * 1024 * 1024, multipartPartBytes: 5 * 1024 * 1024 };
  const svc = new StorageService({ repo, store, bucket, policy });
  const me: StorageActor = (() => { const id = randomUUID(); return { userId: id, tenantId: id }; })();
  const other: StorageActor = (() => { const id = randomUUID(); return { userId: id, tenantId: id }; })();
  const created: string[] = [];

  after(async () => {
    for (const key of created) await store.delete(bucket, key).catch(() => undefined);
    const left = await store.list(bucket, `v1/tenants/${me.tenantId}/`);
    note({ step: 'cleanup', createdKeys: created.length, leftInPrefix: left.keys.length });
    writeFileSync(env.PROVIDER_REPORT_OUT ?? 'r2-provider-report.json', JSON.stringify({ ...report, finishedAt: new Date().toISOString(), bucketNameHash: createHash('sha256').update(bucket).digest('hex').slice(0, 12) }, null, 2));
    assert.equal(left.keys.length, 0, 'cleanup removed exactly what the suite created');
  });

  const track = async (id: string) => { const o = await repo.getObject(id); if (o) created.push(o.objectKey); return o; };

  it('1-3. small upload through a presigned PUT, existence, independent read-back SHA-256, authenticated download', async () => {
    const body = Buffer.from(`r2 provider test ${randomUUID()}`);
    const init = await svc.initiateUpload(me, { filename: 'small.txt', contentType: 'text/plain', size: body.length, sha256: sha256Hex(body) });
    if (init.mode !== 'single') throw new Error();
    await track(init.objectId);
    const put = await fetch(init.upload.url, { method: 'PUT', headers: init.upload.headers, body });
    note({ step: 'presigned-put', ...ids(put), url: redactUrl(init.upload.url) });
    assert.equal(put.status, 200, await put.text());
    const done = await svc.completeUpload(me, init.objectId);
    assert.equal(done.state, 'READY'); assert.equal(done.sha256, sha256Hex(body));
    const dl = await svc.getDownload(me, init.objectId);
    const got = await fetch(dl.url);
    note({ step: 'presigned-get', ...ids(got) });
    assert.equal(got.status, 200);
    assert.equal(sha256Hex(Buffer.from(await got.arrayBuffer())), sha256Hex(body), 'bytes fetched over HTTP hash to the verified value');
    assert.match(got.headers.get('content-disposition') ?? '', /inline|attachment/);
  });

  it('4-5. unauthorised access is denied: no signature, tampered signature, other tenant, and no public URL exists', async () => {
    const body = Buffer.from('private');
    const init = await svc.initiateUpload(me, { filename: 'p.txt', contentType: 'text/plain', size: body.length });
    if (init.mode !== 'single') throw new Error();
    const row = await track(init.objectId);
    await fetch(init.upload.url, { method: 'PUT', headers: init.upload.headers, body });
    await svc.completeUpload(me, init.objectId);
    const dl = await svc.getDownload(me, init.objectId);
    const bare = dl.url.split('?')[0];
    const noSig = await fetch(bare); note({ step: 'get-without-signature', ...ids(noSig) });
    assert.ok([401, 403].includes(noSig.status));
    const tampered = await fetch(dl.url.replace(/X-Amz-Signature=[0-9a-f]+/, 'X-Amz-Signature=' + '0'.repeat(64))); note({ step: 'get-tampered-signature', ...ids(tampered) });
    assert.equal(tampered.status, 403);
    await assert.rejects(svc.getDownload(other, init.objectId), (e: { code: string }) => e.code === 'NOT_FOUND');
    const pub = await fetch(`https://${bucket}.r2.dev/${row!.objectKey}`).catch(() => null); note({ step: 'public-r2dev-url', status: pub?.status ?? 'unreachable' });
    assert.ok(!pub || pub.status !== 200, 'the object must not be reachable on a public r2.dev URL');
  });

  it('6. signed URL expiry is enforced by the provider', async () => {
    const init = await svc.initiateUpload(me, { filename: 'e.txt', contentType: 'text/plain', size: 3 });
    if (init.mode !== 'single') throw new Error();
    await track(init.objectId);
    await fetch(init.upload.url, { method: 'PUT', headers: init.upload.headers, body: Buffer.from('abc') });
    await svc.completeUpload(me, init.objectId);
    const row = (await repo.getObject(init.objectId))!;
    const short = await store.presignGet({ bucket, key: row.objectKey, ttlSeconds: 2, contentType: 'text/plain', contentDisposition: 'attachment; filename="e.txt"' });
    assert.equal((await fetch(short.url)).status, 200);
    await new Promise((r) => setTimeout(r, 4000));
    const late = await fetch(short.url); note({ step: 'expired-url', ...ids(late) });
    assert.equal(late.status, 403);
  });

  it('7. CORS: the configured origin may PUT with the needed headers; another origin is not granted', async () => {
    const init = await svc.initiateUpload(me, { filename: 'c.txt', contentType: 'text/plain', size: 2, sha256: sha256Hex(Buffer.from('hi')) });
    if (init.mode !== 'single') throw new Error();
    await track(init.objectId);
    const pre = (o: string) => fetch(init.upload.url, { method: 'OPTIONS', headers: { Origin: o, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type,x-amz-checksum-sha256' } });
    const ok = await pre(origin as string); note({ step: 'cors-allowed-origin', ...ids(ok), allowOrigin: ok.headers.get('access-control-allow-origin'), allowHeaders: ok.headers.get('access-control-allow-headers'), expose: ok.headers.get('access-control-expose-headers') });
    assert.equal(ok.headers.get('access-control-allow-origin'), origin);
    const bad = await pre('https://evil.example'); note({ step: 'cors-foreign-origin', ...ids(bad), allowOrigin: bad.headers.get('access-control-allow-origin') });
    assert.notEqual(bad.headers.get('access-control-allow-origin'), 'https://evil.example');
    assert.notEqual(bad.headers.get('access-control-allow-origin'), '*');
  });

  it('8. provider enforcement of signed constraints is OBSERVED; whatever it lets through can never become READY', async () => {
    const body = Buffer.from('exactly this payload');
    const init = await svc.initiateUpload(me, { filename: 't.txt', contentType: 'text/plain', size: body.length, sha256: sha256Hex(body) });
    if (init.mode !== 'single') throw new Error();
    await track(init.objectId);
    const wrongChecksum = await fetch(init.upload.url, { method: 'PUT', headers: init.upload.headers, body: Buffer.from('exactly that payload') });
    const wrongType = await fetch(init.upload.url, { method: 'PUT', headers: { ...init.upload.headers, 'Content-Type': 'text/html' }, body });
    const longer = await fetch(init.upload.url, { method: 'PUT', headers: init.upload.headers, body: Buffer.concat([body, Buffer.from(' plus extra')]) });
    note({ step: 'tamper-enforcement', wrongChecksum: wrongChecksum.status, wrongContentType: wrongType.status, longerBody: longer.status, signedContentLength: env.XROGA_DRIVE_PRESIGN_SIGN_LENGTH !== '0' });
    const head = await store.head(bucket, (await repo.getObject(init.objectId))!.objectKey);
    note({ step: 'tamper-result', objectExistsAfterTamperAttempts: !!head, size: head?.size });
    if (head) {
      await assert.rejects(svc.completeUpload(me, init.objectId), (e: { code: string }) => ['QUARANTINED', 'CORRUPT'].includes(e.code));
    }
    assert.notEqual((await repo.getObject(init.objectId))!.state, 'READY');
  });

  it('9-10. multipart through real presigned part URLs: ListParts, completion, whole-object SHA-256, persistence from a fresh client', async () => {
    const body = Buffer.alloc(11 * 1024 * 1024, 7);
    const init = await svc.initiateUpload(me, { filename: 'big.bin', contentType: 'application/octet-stream', size: body.length, sha256: sha256Hex(body) });
    if (init.mode !== 'multipart') throw new Error('expected multipart');
    await track(init.objectId);
    const signed = await svc.signUploadParts(me, init.objectId, Array.from({ length: init.parts }, (_, i) => i + 1));
    const parts = [];
    for (const s of signed) {
      const start = (s.partNumber - 1) * init.partSize;
      const r = await fetch(s.url, { method: 'PUT', body: body.subarray(start, start + s.contentLength) });
      note({ step: `part-${s.partNumber}`, ...ids(r) });
      assert.equal(r.status, 200, await r.text());
      parts.push({ partNumber: s.partNumber, etag: r.headers.get('etag') as string });
    }
    const done = await svc.completeUpload(me, init.objectId, { parts });
    assert.equal(done.state, 'READY'); assert.equal(done.sha256, sha256Hex(body));
    const fresh = new StorageService({ repo, store: new R2ObjectStore(cfg as NonNullable<typeof cfg>), bucket, policy });
    assert.equal((await fresh.readObjectBytes(me, init.objectId, 20 * 1024 * 1024)).bytes.length, body.length, 'a different process/client reads what the writer stored');
  });

  it('11. listing: prefix filtering and pagination return every created object exactly once', async () => {
    const prefix = `v1/tenants/${me.tenantId}/projects/_none/artifact/`;
    for (let i = 0; i < 5; i++) { const b = Buffer.from(`list ${i}`); const k = `${prefix}${randomUUID()}/l${i}.txt`; await store.put(bucket, k, b, 'text/plain', sha256Hex(b)); created.push(k); }
    const seen = new Set<string>(); let cursor: string | undefined; let pages = 0;
    do { const p = await store.list(bucket, prefix, cursor, 2); p.keys.forEach((k) => seen.add(k.key)); cursor = p.next; pages++; } while (cursor);
    note({ step: 'list-pagination', pages, seen: seen.size });
    assert.equal(seen.size, 5); assert.ok(pages >= 3);
    assert.equal((await store.list(bucket, `v1/tenants/${randomUUID()}/`)).keys.length, 0);
  });

  it('12. interruption: an abandoned multipart upload is aborted by reconcile and leaves no object', async () => {
    const init = await svc.initiateUpload(me, { filename: 'abandon.bin', contentType: 'application/octet-stream', size: 7 * 1024 * 1024 });
    if (init.mode !== 'multipart') throw new Error();
    const row = (await track(init.objectId))!;
    const clock = Date.now() + 25 * 3600_000;
    const later = new StorageService({ repo, store, bucket, policy, now: () => new Date(clock) });
    const rep = await later.reconcile();
    assert.ok(rep.abandonedCleaned >= 1);
    assert.equal(await store.head(bucket, row.objectKey), null);
  });
});
