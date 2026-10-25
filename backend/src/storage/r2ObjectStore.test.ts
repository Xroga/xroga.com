import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hexToBase64, sha256Hex } from './integrity.js';
import { R2ObjectStore, r2ConfigFromEnv } from './r2ObjectStore.js';

/**
 * These tests inspect what the real AWS SDK v3 presigner produces for the R2 endpoint. They need no network and prove what we
 * ASK the provider to enforce. They do not prove Cloudflare R2 enforces it: that is the provider-verification gate (BLOCKED
 * until authorised R2 test credentials exist; see docs/infra/batch-1.5/evidence/).
 */
const store = new R2ObjectStore({ accountId: 'acct123', accessKeyId: 'AKIAEXAMPLEKEY', secretAccessKey: 'example-secret-do-not-use', bucket: 'xroga-drive-test' });
const q = (u: string) => new URL(u).searchParams;

describe('R2ObjectStore presigned requests (SDK-generated, offline)', () => {
  it('presigned PUT signs host, content-type, content-length and the SHA-256 checksum header, and expires', async () => {
    const sha = sha256Hex(Buffer.from('payload'));
    const s = await store.presignPut({ bucket: 'xroga-drive-test', key: 'v1/tenants/t/projects/_none/upload/o/a.txt', contentType: 'text/plain', size: 7, sha256Hex: sha, ttlSeconds: 900 });
    const u = new URL(s.url);
    assert.ok(u.host.endsWith('acct123.r2.cloudflarestorage.com'));
    const signed = (q(s.url).get('X-Amz-SignedHeaders') ?? '').split(';');
    for (const h of ['host', 'content-type', 'content-length', 'x-amz-checksum-sha256']) assert.ok(signed.includes(h), `${h} must be signed; got ${signed}`);
    assert.equal(q(s.url).get('X-Amz-Expires'), '900');
    assert.equal(s.headers['x-amz-checksum-sha256'], hexToBase64(sha));
    assert.equal(s.headers['Content-Type'], 'text/plain');
    assert.ok(!s.url.includes('example-secret-do-not-use'));
  });
  it('without a declared SHA-256 the checksum header is not required', async () => {
    const s = await store.presignPut({ bucket: 'b', key: 'k', contentType: 'text/plain', size: 1, ttlSeconds: 60 });
    assert.ok(!(q(s.url).get('X-Amz-SignedHeaders') ?? '').includes('x-amz-checksum-sha256'));
  });
  it('presigned GET carries a forced content type/disposition and a no-store cache header, and a short expiry', async () => {
    const s = await store.presignGet({ bucket: 'b', key: 'k', ttlSeconds: 60, contentType: 'application/octet-stream', contentDisposition: 'attachment; filename="a.html"' });
    assert.equal(q(s.url).get('response-content-type'), 'application/octet-stream');
    assert.match(q(s.url).get('response-content-disposition') ?? '', /^attachment/);
    assert.equal(q(s.url).get('response-cache-control'), 'private, no-store');
    assert.equal(q(s.url).get('X-Amz-Expires'), '60');
  });
  it('multipart part URLs sign the content length', async () => {
    const s = await store.presignPart('b', 'k', 'upload-1', 3, 900, 5 * 1024 * 1024);
    assert.ok((q(s.url).get('X-Amz-SignedHeaders') ?? '').includes('content-length'));
    assert.equal(q(s.url).get('partNumber'), '3');
    assert.equal(q(s.url).get('uploadId'), 'upload-1');
  });
  it('the canonical bucket may never be the legacy public assets bucket, and secrets are never in the config object', () => {
    const base = { XROGA_DRIVE_R2_ACCOUNT_ID: 'a', XROGA_DRIVE_R2_ACCESS_KEY_ID: 'k', XROGA_DRIVE_R2_SECRET_ACCESS_KEY: 's' };
    assert.throws(() => r2ConfigFromEnv({ ...base, XROGA_DRIVE_R2_BUCKET: 'xroga-assets' } as never), /dedicated private bucket/);
    assert.throws(() => r2ConfigFromEnv({ ...base, XROGA_DRIVE_R2_BUCKET: 'shared', CLOUDFLARE_R2_BUCKET: 'shared' } as never), /dedicated private bucket/);
    assert.equal(r2ConfigFromEnv({} as never), null);
    assert.equal(r2ConfigFromEnv({ ...base, XROGA_DRIVE_R2_BUCKET: 'xroga-drive' } as never)?.bucket, 'xroga-drive');
  });
});

describe('transient error classification', () => {
  it('network errors are transient whether the code is on the error or its cause; definitive answers are not', async () => {
    const { isTransient } = await import('./r2ObjectStore.js');
    assert.equal(isTransient(Object.assign(new Error('x'), { code: 'ECONNREFUSED' })), true);
    assert.equal(isTransient(Object.assign(new Error('x'), { cause: { code: 'ETIMEDOUT' } })), true);
    assert.equal(isTransient(Object.assign(new Error('x'), { name: 'TimeoutError' })), true);
    assert.equal(isTransient(Object.assign(new Error('x'), { $metadata: { httpStatusCode: 503 } })), true);
    assert.equal(isTransient(Object.assign(new Error('x'), { $metadata: { httpStatusCode: 429 } })), true);
    assert.equal(isTransient(Object.assign(new Error('x'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })), false);
    assert.equal(isTransient(Object.assign(new Error('x'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } })), false);
    assert.equal(isTransient(new Error('plain')), false);
  });
});
