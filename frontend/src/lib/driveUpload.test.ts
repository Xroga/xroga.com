import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DriveObject, InitiatedUpload, SignedPart } from './driveApi';
import { uploadFile, UploadError, type UploaderDeps } from './driveUpload';

const object = (over: Partial<DriveObject> = {}): DriveObject => ({ id: 'obj-1', projectId: null, objectClass: 'upload', filename: 'a.txt', contentType: 'text/plain', size: 5, sha256: 'x', state: 'READY', createdAt: '2026-10-26T00:00:00Z', ...over });
const file = (size: number, name = 'a.txt') => new File([new Uint8Array(size).fill(7)], name, { type: 'text/plain' });

/** A faithful stand-in for the storage endpoint: records what it received, returns an ETag per part. */
function storage(options: { failFirstAttemptsOf?: Set<number>; noEtag?: boolean; status?: number } = {}) {
  const received: Array<{ url: string; bytes: number; headers: Record<string, string> }> = [];
  const attempts = new Map<string, number>();
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const n = (attempts.get(url) ?? 0) + 1; attempts.set(url, n);
    const part = Number(/part=(\d+)/.exec(url)?.[1] ?? 0);
    if (options.failFirstAttemptsOf?.has(part) && n === 1) return new Response('', { status: 503 });
    if (options.status) return new Response('', { status: options.status });
    const body = init.body as Blob;
    received.push({ url, bytes: body.size, headers: init.headers as Record<string, string> });
    return new Response('', { status: 200, headers: options.noEtag ? {} : { etag: `"etag-${part || 'single'}"` } });
  }) as unknown as typeof fetch;
  return { fetchImpl, received, attempts };
}

function deps(plan: InitiatedUpload, store: ReturnType<typeof storage>, calls: string[] = [], extra: Partial<UploaderDeps> = {}): UploaderDeps {
  return {
    fetch: store.fetchImpl, sleep: async () => undefined, sha256: async () => 'a'.repeat(64),
    api: {
      initiateUpload: async (input) => { calls.push(`initiate:${input.filename}:${input.size}:${input.contentType}:${input.sha256 ? 'hash' : 'nohash'}`); return plan; },
      signParts: async (_id, numbers) => { calls.push(`sign:${numbers.join(',')}`); return { parts: numbers.map((n): SignedPart => ({ partNumber: n, method: 'PUT', url: `https://r2.example/obj?part=${n}`, headers: { 'x-part': String(n) }, expiresAt: '2030-01-01T00:00:00Z', contentLength: n < (plan as { parts: number }).parts ? (plan as { partSize: number }).partSize : 0 })) }; },
      completeUpload: async (_id, parts) => { calls.push(`complete:${parts ? parts.map((p) => `${p.partNumber}=${p.etag}`).join('|') : 'none'}`); return object(); },
    },
    ...extra,
  };
}

describe('Drive upload', () => {
  it('single mode: one signed PUT with the signed headers, then complete; the recorded object is what comes back', async () => {
    const store = storage(); const calls: string[] = [];
    const plan: InitiatedUpload = { objectId: 'obj-1', mode: 'single', upload: { method: 'PUT', url: 'https://r2.example/obj', headers: { 'content-type': 'text/plain' }, expiresAt: '2030-01-01T00:00:00Z' } };
    const progress: number[] = [];
    const result = await uploadFile(file(5), deps(plan, store, calls), { onProgress: (p) => progress.push(p.sentBytes) });
    assert.equal(result.state, 'READY');
    assert.deepEqual(calls, ['initiate:a.txt:5:text/plain:hash', 'complete:none']);
    assert.deepEqual(store.received.map((r) => [r.bytes, r.headers['content-type']]), [[5, 'text/plain']]);
    assert.deepEqual(progress, [5]);
  });

  it('single mode: a storage refusal is an error and the object is never completed', async () => {
    const store = storage({ status: 403 }); const calls: string[] = [];
    const plan: InitiatedUpload = { objectId: 'obj-1', mode: 'single', upload: { method: 'PUT', url: 'https://r2.example/obj', headers: {}, expiresAt: '2030-01-01T00:00:00Z' } };
    await assert.rejects(uploadFile(file(5), deps(plan, store, calls)), (e) => e instanceof UploadError && e.code === 'PUT_FAILED');
    assert.ok(!calls.some((c) => c.startsWith('complete')), 'never completed');
  });

  it('multipart: signs in batches of at most 100 just before use, sends each slice, and completes with the ETags in part order', async () => {
    const store = storage(); const calls: string[] = [];
    const plan: InitiatedUpload = { objectId: 'obj-1', mode: 'multipart', partSize: 4, parts: 3, expiresAt: '2030-01-01T00:00:00Z' };
    // 3 parts of 4 bytes; the last part is the remainder (the stand-in signer reports its length as 0, the real one reports the remainder)
    const d = deps(plan, store, calls);
    const realSign = d.api.signParts;
    d.api.signParts = async (id, numbers) => ({ parts: (await realSign(id, numbers)).parts.map((p) => ({ ...p, contentLength: p.partNumber < 3 ? 4 : 2 })) });
    await uploadFile(file(10), d, {});
    assert.deepEqual(store.received.map((r) => r.bytes).sort(), [2, 4, 4]);
    assert.equal(calls.filter((c) => c.startsWith('sign')).length, 1);
    assert.equal(calls.at(-1), 'complete:1="etag-1"|2="etag-2"|3="etag-3"');
  });

  it('multipart: more than 100 parts are signed in more than one batch', async () => {
    const store = storage(); const calls: string[] = [];
    const plan: InitiatedUpload = { objectId: 'obj-1', mode: 'multipart', partSize: 1, parts: 130, expiresAt: '2030-01-01T00:00:00Z' };
    const d = deps(plan, store, calls);
    const realSign = d.api.signParts;
    d.api.signParts = async (id, numbers) => ({ parts: (await realSign(id, numbers)).parts.map((p) => ({ ...p, contentLength: 1 })) });
    await uploadFile(file(130), d);
    assert.deepEqual(calls.filter((c) => c.startsWith('sign')).map((c) => c.split(',').length), [100, 30]);
    assert.equal(store.received.length, 130);
  });

  it('multipart: a part that fails is retried on its own and the others are not resent', async () => {
    const store = storage({ failFirstAttemptsOf: new Set([2]) });
    const plan: InitiatedUpload = { objectId: 'obj-1', mode: 'multipart', partSize: 4, parts: 3, expiresAt: '2030-01-01T00:00:00Z' };
    const d = deps(plan, store);
    const realSign = d.api.signParts;
    d.api.signParts = async (id, numbers) => ({ parts: (await realSign(id, numbers)).parts.map((p) => ({ ...p, contentLength: 4 })) });
    await uploadFile(file(12), d);
    assert.equal(store.attempts.get('https://r2.example/obj?part=2'), 2);
    assert.equal(store.attempts.get('https://r2.example/obj?part=1'), 1);
    assert.equal(store.attempts.get('https://r2.example/obj?part=3'), 1);
  });

  it('multipart: gives up after the attempt limit and never completes a partial upload', async () => {
    const store = storage({ status: 500 }); const calls: string[] = [];
    const plan: InitiatedUpload = { objectId: 'obj-1', mode: 'multipart', partSize: 4, parts: 2, expiresAt: '2030-01-01T00:00:00Z' };
    const d = deps(plan, store, calls, { maxPartAttempts: 2 });
    const realSign = d.api.signParts;
    d.api.signParts = async (id, numbers) => ({ parts: (await realSign(id, numbers)).parts.map((p) => ({ ...p, contentLength: 4 })) });
    await assert.rejects(uploadFile(file(8), d), (e) => e instanceof UploadError && e.code === 'PUT_FAILED');
    assert.ok(!calls.some((c) => c.startsWith('complete')));
  });

  it('multipart: a bucket that does not expose ETag is reported as a configuration problem, not retried forever', async () => {
    const store = storage({ noEtag: true });
    const plan: InitiatedUpload = { objectId: 'obj-1', mode: 'multipart', partSize: 4, parts: 1, expiresAt: '2030-01-01T00:00:00Z' };
    const d = deps(plan, store);
    const realSign = d.api.signParts;
    d.api.signParts = async (id, numbers) => ({ parts: (await realSign(id, numbers)).parts.map((p) => ({ ...p, contentLength: 4 })) });
    await assert.rejects(uploadFile(file(4), d), (e) => e instanceof UploadError && e.code === 'ETAG_UNREADABLE' && /CORS/.test(e.message));
    assert.equal(store.attempts.size, 1, 'one attempt, no retry');
  });

  it('a cancelled upload sends nothing more and is reported as aborted', async () => {
    const store = storage(); const controller = new AbortController(); controller.abort();
    const plan: InitiatedUpload = { objectId: 'obj-1', mode: 'single', upload: { method: 'PUT', url: 'https://r2.example/obj', headers: {}, expiresAt: '2030-01-01T00:00:00Z' } };
    await assert.rejects(uploadFile(file(5), deps(plan, store), { signal: controller.signal }), (e) => e instanceof UploadError && e.code === 'ABORTED');
    assert.equal(store.received.length, 0);
  });

  it('sends no hash when the file is too large to hash in the browser, and a generic type when none is known', async () => {
    const store = storage(); const calls: string[] = [];
    const plan: InitiatedUpload = { objectId: 'obj-1', mode: 'single', upload: { method: 'PUT', url: 'https://r2.example/obj', headers: {}, expiresAt: '2030-01-01T00:00:00Z' } };
    await uploadFile(new File([new Uint8Array(3)], 'blob.bin'), deps(plan, store, calls, { sha256: async () => null }));
    assert.equal(calls[0], 'initiate:blob.bin:3:application/octet-stream:nohash');
  });
});

it('multipart authorization denial is terminal and does not retry or complete',async()=>{
 const store=storage({status:403}),calls:string[]=[];
 const plan:InitiatedUpload={objectId:'obj-1',mode:'multipart',partSize:5,parts:1,expiresAt:'2030-01-01T00:00:00Z'};
 await assert.rejects(uploadFile(file(5),deps(plan,store,calls,{partConcurrency:1})));
 assert.equal([...store.attempts.values()][0],1);assert.ok(!calls.some(c=>c.startsWith('complete')));
});
