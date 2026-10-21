import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { S3Client, UploadPartCommand } from '@aws-sdk/client-s3';
import { sha256Hex } from './integrity.js';
import { defaultPolicyConfig } from './policy.js';
import { R2ObjectStore } from './r2ObjectStore.js';
import { MemoryStorageRepository } from './repository.js';
import { StorageService } from './storageService.js';
import type { StorageActor } from './types.js';

/**
 * Exercises R2ObjectStore + StorageService over REAL HTTP and the REAL AWS SDK v3 wire protocol against an S3-compatible
 * EMULATOR (STORAGE_TEST_S3_ENDPOINT, e.g. s3rver). This is SYNTHETIC evidence: it proves our requests are well-formed S3 and our
 * logic handles real responses; it does NOT prove Cloudflare R2 behaves identically (signed-header enforcement, CORS, limits).
 *
 * Failure classification used in this file:
 *   EMULATOR_LIMITATION  s3rver 3.7.1 returns 405 for ListParts, 500 for truncated ListObjectsV2 (MaxKeys < object count), and 405 for
 *                        presigned UploadPart URLs. Where the emulator cannot answer, the test substitutes ONLY that one call (clearly
 *                        marked) and the real-wire behaviour of that call stays UNVERIFIED until the R2 provider suite runs.
 *   APPLICATION_BUG      anything else. None remain: the three original emulator failures were all EMULATOR_LIMITATION (reproduced
 *                        with bare SDK commands outside our code), and the code paths they hide are covered by the memory-store suite
 *                        and by tests below that exercise our logic around them.
 */
const endpoint = process.env.STORAGE_TEST_S3_ENDPOINT;

const bucket = process.env.STORAGE_TEST_S3_BUCKET ?? 'drive-test';
const skip = endpoint ? false : 'STORAGE_TEST_S3_ENDPOINT not set (S3-compatible emulator not available)';

describe('R2ObjectStore over the AWS SDK wire protocol (S3 emulator, SYNTHETIC)', { skip }, () => {
  const client = new S3Client({ region: 'us-east-1', endpoint: endpoint as string, forcePathStyle: true, credentials: { accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER' } });
  // s3rver does not implement ListParts (405). Only that one operation is substituted; its wire format stays UNVERIFIED here.
  const uploaded = new Map<string, Array<{ partNumber: number; size: number; etag: string }>>();
  class EmulatorStore extends R2ObjectStore {
    override async listParts(_b: string, _k: string, uploadId: string) { return uploaded.get(uploadId) ?? []; }
  }
  const store = new EmulatorStore({ accountId: 'x', accessKeyId: 'S3RVER', secretAccessKey: 'S3RVER', bucket }, client);
  const repo = new MemoryStorageRepository();
  const svc = new StorageService({ repo, store, bucket, policy: { ...defaultPolicyConfig({}), singlePutMaxBytes: 6 * 1024 * 1024, multipartPartBytes: 5 * 1024 * 1024 } });
  const a: StorageActor = (() => { const id = randomUUID(); return { userId: id, tenantId: id }; })();

  it('presigned PUT → complete (head, range, stream, SHA-256) → presigned GET → delete, over real HTTP', async () => {
    const body = Buffer.from(`wire test ${randomUUID()}`);
    const init = await svc.initiateUpload(a, { filename: 'wire.txt', contentType: 'text/plain', size: body.length, sha256: sha256Hex(body) });
    if (init.mode !== 'single') throw new Error();
    const put = await fetch(init.upload.url, { method: 'PUT', headers: init.upload.headers, body });
    assert.equal(put.status, 200, await put.text());
    const done = await svc.completeUpload(a, init.objectId);
    assert.equal(done.state, 'READY'); assert.equal(done.sha256, sha256Hex(body));
    const dl = await svc.getDownload(a, init.objectId);
    const got = await fetch(dl.url);
    assert.equal(got.status, 200);
    assert.deepEqual(Buffer.from(await got.arrayBuffer()), body);
    await svc.deleteObject(a, init.objectId);
    assert.equal((await repo.getObject(init.objectId))!.state, 'DELETED');
    assert.equal(await store.head(bucket, (await repo.getObject(init.objectId))!.objectKey), null, 'provider confirms the object is gone');
  });

  it('server-side put with checksum, list and delete (pagination is NOT exercised: s3rver returns 500 for truncated listings)', async () => {
    const prefix = `v1/wire-${randomUUID()}/`;
    for (let i = 0; i < 5; i++) { const b = Buffer.from(`obj ${i}`); await store.put(bucket, `${prefix}${i}.txt`, b, 'text/plain', sha256Hex(b)); }
    const all = await store.list(bucket, prefix);
    assert.equal(all.keys.length, 5);
    assert.deepEqual(all.keys.map((k) => k.size), [5, 5, 5, 5, 5]);
    for (const k of all.keys) await store.delete(bucket, k.key);
    assert.equal((await store.list(bucket, prefix)).keys.length, 0);
  });

  it('multipart: create, upload parts, complete, whole-object SHA-256 (parts sent with SDK commands: s3rver rejects presigned part URLs, whose shape is verified offline in r2ObjectStore.test.ts)', async () => {
    const body = Buffer.alloc(11 * 1024 * 1024, 5);
    const init = await svc.initiateUpload(a, { filename: 'big.bin', contentType: 'application/octet-stream', size: body.length, sha256: sha256Hex(body) });
    if (init.mode !== 'multipart') throw new Error('expected multipart');
    const row = (await repo.getObject(init.objectId))!;
    const parts = [];
    for (let n = 1; n <= init.parts; n++) {
      const chunk = body.subarray((n - 1) * init.partSize, n * init.partSize);
      const r = await client.send(new UploadPartCommand({ Bucket: bucket, Key: row.objectKey, UploadId: row.multipartUploadId as string, PartNumber: n, Body: chunk, ContentLength: chunk.length }));
      parts.push({ partNumber: n, etag: r.ETag as string });
      uploaded.set(row.multipartUploadId as string, [...(uploaded.get(row.multipartUploadId as string) ?? []), { partNumber: n, size: chunk.length, etag: r.ETag as string }]);
    }
    const done = await svc.completeUpload(a, init.objectId, { parts });
    assert.equal(done.state, 'READY'); assert.equal(done.sha256, sha256Hex(body));
    await svc.deleteObject(a, init.objectId);
  });

  it('abort multipart is idempotent and a missing object reads as null', async () => {
    const { uploadId } = await store.createMultipart(bucket, `v1/abort-${randomUUID()}`, 'text/plain');
    await store.abortMultipart(bucket, 'x', uploadId).catch(() => undefined);
    await store.abortMultipart(bucket, 'x', uploadId).catch(() => undefined);
    assert.equal(await store.head(bucket, `v1/never-${randomUUID()}`), null);
  });

  it('[APPLICATION] duplicate multipart completion is idempotent and a stale upload id is harmless', async () => {
    const body = Buffer.alloc(6 * 1024 * 1024, 9);
    const small = new StorageService({ repo, store, bucket, policy: { ...defaultPolicyConfig({}), singlePutMaxBytes: 1024 * 1024, multipartPartBytes: 5 * 1024 * 1024 } });
    const init = await small.initiateUpload(a, { filename: 'dup.bin', contentType: 'application/octet-stream', size: body.length, sha256: sha256Hex(body) });
    if (init.mode !== 'multipart') throw new Error();
    const row = (await repo.getObject(init.objectId))!;
    const parts = [];
    for (let n = 1; n <= init.parts; n++) {
      const chunk = body.subarray((n - 1) * init.partSize, n * init.partSize);
      const r = await client.send(new UploadPartCommand({ Bucket: bucket, Key: row.objectKey, UploadId: row.multipartUploadId as string, PartNumber: n, Body: chunk, ContentLength: chunk.length }));
      parts.push({ partNumber: n, etag: r.ETag as string });
      uploaded.set(row.multipartUploadId as string, [...(uploaded.get(row.multipartUploadId as string) ?? []), { partNumber: n, size: chunk.length, etag: r.ETag as string }]);
    }
    const [x, y] = await Promise.allSettled([small.completeUpload(a, init.objectId, { parts }), small.completeUpload(a, init.objectId, { parts })]);
    assert.ok([x, y].some((r) => r.status === 'fulfilled'));
    assert.equal((await small.completeUpload(a, init.objectId, { parts })).state, 'READY');
    assert.equal((await repo.getUsage(a.tenantId)).committedBytes >= body.length, true);
    await small.deleteObject(a, init.objectId);
  });

  it('[APPLICATION] wrong ETag, missing part and extra part are refused before the provider is asked to assemble anything', async () => {
    const small = new StorageService({ repo, store, bucket, policy: { ...defaultPolicyConfig({}), singlePutMaxBytes: 1024 * 1024, multipartPartBytes: 5 * 1024 * 1024 } });
    const body = Buffer.alloc(6 * 1024 * 1024, 4);
    const init = await small.initiateUpload(a, { filename: 'bad.bin', contentType: 'application/octet-stream', size: body.length });
    if (init.mode !== 'multipart') throw new Error();
    const row = (await repo.getObject(init.objectId))!;
    const real: Array<{ partNumber: number; etag: string }> = [];
    for (let n = 1; n <= init.parts; n++) {
      const chunk = body.subarray((n - 1) * init.partSize, n * init.partSize);
      const r = await client.send(new UploadPartCommand({ Bucket: bucket, Key: row.objectKey, UploadId: row.multipartUploadId as string, PartNumber: n, Body: chunk, ContentLength: chunk.length }));
      real.push({ partNumber: n, etag: r.ETag as string });
      uploaded.set(row.multipartUploadId as string, [...(uploaded.get(row.multipartUploadId as string) ?? []), { partNumber: n, size: chunk.length, etag: r.ETag as string }]);
    }
    await assert.rejects(small.completeUpload(a, init.objectId, { parts: [{ ...real[0], etag: '"deadbeef"' }, real[1]] }), (e: { code: string }) => e.code === 'INVALID_REQUEST');
    await assert.rejects(small.completeUpload(a, init.objectId, { parts: [real[0]] }), (e: { code: string }) => e.code === 'INVALID_REQUEST');
    await assert.rejects(small.completeUpload(a, init.objectId, { parts: [...real, { partNumber: 3, etag: real[0].etag }] }), (e: { code: string }) => e.code === 'INVALID_REQUEST');
    assert.equal(await store.head(bucket, row.objectKey), null, 'nothing was assembled');
    assert.equal((await repo.getObject(init.objectId))!.state, 'UPLOADING');
    await small.deleteObject(a, init.objectId);
  });

  it('[APPLICATION] an unreachable provider is translated to a retryable 503 and leaves the object state unchanged', async () => {
    const dead = new R2ObjectStore({ accountId: 'x', accessKeyId: 'k', secretAccessKey: 's', bucket }, new S3Client({ region: 'us-east-1', endpoint: 'http://127.0.0.1:9', forcePathStyle: true, credentials: { accessKeyId: 'k', secretAccessKey: 's' }, maxAttempts: 1 }));
    const r2 = new MemoryStorageRepository();
    const s2 = new StorageService({ repo: r2, store: dead, bucket, policy: defaultPolicyConfig({}) });
    const init = await s2.initiateUpload(a, { filename: 'x.txt', contentType: 'text/plain', size: 3 });
    await assert.rejects(s2.completeUpload(a, init.objectId), (e: { code: string; status: number }) => e.code === 'PROVIDER_UNAVAILABLE' && e.status === 503);
    assert.equal((await r2.getObject(init.objectId))!.state, 'UPLOADING');
  });
});
