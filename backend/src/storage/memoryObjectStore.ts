import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hexToBase64, sha256Hex } from './integrity.js';
import {
  ProviderUnavailableError, type CompletedPart, type HeadResult, type ObjectStore,
  type PresignGetInput, type PresignPutInput, type SignedRequest,
} from './objectStore.js';

interface Stored { body: Buffer; contentType: string; etag: string; checksumB64: string; versionId: string }
interface Upload { key: string; bucket: string; parts: Map<number, { body: Buffer; etag: string }> }

/**
 * Deterministic S3-compatible fake used by tests. It is SYNTHETIC: it models R2's signature expiry, signed-header
 * enforcement and checksum rejection closely enough to exercise our enforcement code, but it is not Cloudflare R2
 * and no evidence produced with it may be reported as provider verification.
 */
export class MemoryObjectStore implements ObjectStore {
  readonly provider = 'memory' as const;
  readonly objects = new Map<string, Stored>();
  readonly uploads = new Map<string, Upload>();
  readonly #secret = randomBytes(32);
  #now: () => number;
  /** one-shot fault injection: 'put' | 'head' | 'read' | 'delete' | 'complete' */
  #faults = new Map<string, Array<'throw' | 'after-write'>>();
  calls: string[] = [];
  /** fault injection: flip a byte in the next streamed write, as a faulty provider or network would */
  corruptNextStreamWrite = false;

  constructor(now: () => number = Date.now) { this.#now = now; }

  setClock(now: () => number) { this.#now = now; }
  failNext(op: string, mode: 'throw' | 'after-write' = 'throw') {
    const q = this.#faults.get(op) ?? [];
    q.push(mode);
    this.#faults.set(op, q);
  }
  #fault(op: string): 'throw' | 'after-write' | undefined { return this.#faults.get(op)?.shift(); }
  #k(bucket: string, key: string) { return `${bucket}\u0000${key}`; }

  #sign(parts: Array<string | number>): string {
    return createHmac('sha256', this.#secret).update(parts.join('|')).digest('hex');
  }

  async presignPut(i: PresignPutInput): Promise<SignedRequest> {
    const exp = this.#now() + i.ttlSeconds * 1000;
    const sig = this.#sign(['PUT', i.bucket, i.key, exp, i.contentType, i.size, i.sha256Hex ?? '']);
    const u = new URL('https://memory.invalid/o');
    u.search = new URLSearchParams({ b: i.bucket, k: i.key, exp: String(exp), ct: i.contentType, sz: String(i.size), sha: i.sha256Hex ?? '', sig }).toString();
    const headers: Record<string, string> = { 'Content-Type': i.contentType };
    if (i.sha256Hex) headers['x-amz-checksum-sha256'] = hexToBase64(i.sha256Hex);
    return { url: u.toString(), method: 'PUT', headers, expiresAt: new Date(exp) };
  }

  async presignGet(i: PresignGetInput): Promise<SignedRequest> {
    const exp = this.#now() + i.ttlSeconds * 1000;
    const sig = this.#sign(['GET', i.bucket, i.key, exp, i.contentType, i.contentDisposition]);
    const u = new URL('https://memory.invalid/o');
    u.search = new URLSearchParams({ b: i.bucket, k: i.key, exp: String(exp), ct: i.contentType, cd: i.contentDisposition, sig }).toString();
    return { url: u.toString(), method: 'GET', headers: {}, expiresAt: new Date(exp) };
  }

  /** Simulates the browser calling a presigned PUT. Mirrors R2: signature, expiry, signed headers, checksum. */
  clientPut(url: string, headers: Record<string, string>, body: Buffer): { status: number; etag?: string } {
    const q = new URL(url).searchParams;
    const p = (n: string) => q.get(n) ?? '';
    const expected = this.#sign(['PUT', p('b'), p('k'), p('exp'), p('ct'), p('sz'), p('sha')]);
    if (!safeEq(expected, p('sig'))) return { status: 403 };
    if (this.#now() > Number(p('exp'))) return { status: 403 };
    const h = lower(headers);
    if (h['content-type'] !== p('ct')) return { status: 403 };
    if (body.length !== Number(p('sz'))) return { status: 403 };
    if (p('sha') && h['x-amz-checksum-sha256'] !== hexToBase64(p('sha'))) return { status: 403 };
    if (p('sha') && sha256Hex(body) !== p('sha')) return { status: 400 }; // BadDigest
    return { status: 200, etag: this.#store(p('b'), p('k'), body, p('ct')).etag };
  }

  clientGet(url: string): { status: number; body?: Buffer; contentType?: string; contentDisposition?: string } {
    const q = new URL(url).searchParams;
    const p = (n: string) => q.get(n) ?? '';
    const expected = this.#sign(['GET', p('b'), p('k'), p('exp'), p('ct'), p('cd')]);
    if (!safeEq(expected, p('sig')) || this.#now() > Number(p('exp'))) return { status: 403 };
    const o = this.objects.get(this.#k(p('b'), p('k')));
    if (!o) return { status: 404 };
    return { status: 200, body: o.body, contentType: p('ct'), contentDisposition: p('cd') };
  }

  clientPutPart(url: string, body: Buffer): { status: number; etag?: string } {
    const q = new URL(url).searchParams;
    const p = (n: string) => q.get(n) ?? '';
    const expected = this.#sign(['PART', p('b'), p('k'), p('u'), p('n'), p('exp'), p('len')]);
    if (!safeEq(expected, p('sig')) || this.#now() > Number(p('exp'))) return { status: 403 };
    if (body.length !== Number(p('len'))) return { status: 403 };
    const up = this.uploads.get(p('u'));
    if (!up) return { status: 404 };
    const etag = `"${sha256Hex(body).slice(0, 32)}"`;
    up.parts.set(Number(p('n')), { body, etag });
    return { status: 200, etag };
  }

  #store(bucket: string, key: string, body: Buffer, contentType: string): Stored {
    const s: Stored = {
      body, contentType, etag: `"${sha256Hex(body).slice(0, 32)}"`,
      checksumB64: hexToBase64(sha256Hex(body)), versionId: randomBytes(6).toString('hex'),
    };
    this.objects.set(this.#k(bucket, key), s);
    return s;
  }

  async head(bucket: string, key: string): Promise<HeadResult | null> {
    this.calls.push('head');
    if (this.#fault('head')) throw new ProviderUnavailableError('injected head failure');
    const o = this.objects.get(this.#k(bucket, key));
    return o ? { size: o.body.length, etag: o.etag, versionId: o.versionId, contentType: o.contentType, checksumSha256: o.checksumB64 } : null;
  }

  async readRange(bucket: string, key: string, start: number, length: number): Promise<Uint8Array> {
    const o = this.objects.get(this.#k(bucket, key));
    if (!o) throw new Error('NoSuchKey');
    return o.body.subarray(start, start + length);
  }

  async openRead(bucket: string, key: string): Promise<AsyncIterable<Uint8Array>> {
    this.calls.push('read');
    if (this.#fault('read')) throw new ProviderUnavailableError('injected read failure');
    const o = this.objects.get(this.#k(bucket, key));
    if (!o) throw new Error('NoSuchKey');
    const body = o.body;
    return (async function* () {
      for (let i = 0; i < body.length; i += 64 * 1024) yield body.subarray(i, i + 64 * 1024);
    })();
  }

  async put(bucket: string, key: string, body: Buffer, contentType: string, sha: string) {
    this.calls.push('put');
    const f = this.#fault('put');
    if (f === 'throw') throw new ProviderUnavailableError('injected put failure');
    if (sha256Hex(body) !== sha) throw new Error('BadDigest');
    const s = this.#store(bucket, key, body, contentType);
    if (f === 'after-write') throw new ProviderUnavailableError('timeout after write');
    return { etag: s.etag, versionId: s.versionId };
  }

  async putStream(bucket: string, key: string, body: AsyncIterable<Uint8Array>, size: number, contentType: string) {
    this.calls.push('putStream');
    const f = this.#fault('put');
    if (f === 'throw') throw new ProviderUnavailableError('injected put failure');
    const chunks: Buffer[] = [];
    for await (const c of body) chunks.push(Buffer.from(c));
    const buf = Buffer.concat(chunks);
    if (buf.length !== size) throw new Error('IncompleteBody');
    if (this.corruptNextStreamWrite) { this.corruptNextStreamWrite = false; buf[0] = buf[0] ^ 0xff; }
    const s = this.#store(bucket, key, buf, contentType);
    if (f === 'after-write') throw new ProviderUnavailableError('timeout after write');
    return { etag: s.etag, versionId: s.versionId };
  }

  async delete(bucket: string, key: string) {
    this.calls.push('delete');
    if (this.#fault('delete')) throw new ProviderUnavailableError('injected delete failure');
    this.objects.delete(this.#k(bucket, key));
  }

  async createMultipart(bucket: string, key: string, _contentType: string) {
    const uploadId = randomBytes(8).toString('hex');
    this.uploads.set(uploadId, { key, bucket, parts: new Map() });
    return { uploadId };
  }

  async presignPart(bucket: string, key: string, uploadId: string, partNumber: number, ttlSeconds: number, contentLength: number): Promise<SignedRequest> {
    const exp = this.#now() + ttlSeconds * 1000;
    const sig = this.#sign(['PART', bucket, key, uploadId, partNumber, exp, contentLength]);
    const u = new URL('https://memory.invalid/p');
    u.search = new URLSearchParams({ b: bucket, k: key, u: uploadId, n: String(partNumber), exp: String(exp), len: String(contentLength), sig }).toString();
    return { url: u.toString(), method: 'PUT', headers: {}, expiresAt: new Date(exp) };
  }

  async listParts(_b: string, _k: string, uploadId: string) {
    const up = this.uploads.get(uploadId);
    if (!up) return [];
    return [...up.parts.entries()].sort((a, b) => a[0] - b[0]).map(([partNumber, p]) => ({ partNumber, size: p.body.length, etag: p.etag }));
  }

  async completeMultipart(bucket: string, key: string, uploadId: string, parts: CompletedPart[]) {
    this.calls.push('complete');
    const f = this.#fault('complete');
    if (f === 'throw') throw new ProviderUnavailableError('injected complete failure');
    const up = this.uploads.get(uploadId);
    if (!up) throw Object.assign(new Error('NoSuchUpload'), { name: 'NoSuchUpload' });
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    ordered.forEach((p, i) => { if (p.partNumber !== i + 1) throw new Error('InvalidPartOrder'); });
    const bufs = ordered.map((p) => {
      const stored = up.parts.get(p.partNumber);
      if (!stored || stored.etag !== p.etag) throw new Error('InvalidPart');
      return stored.body;
    });
    const s = this.#store(bucket, key, Buffer.concat(bufs), 'application/octet-stream');
    this.uploads.delete(uploadId);
    if (f === 'after-write') throw new ProviderUnavailableError('timeout after write');
    return { etag: s.etag, versionId: s.versionId };
  }

  async abortMultipart(_b: string, _k: string, uploadId: string) { this.uploads.delete(uploadId); }

  async list(bucket: string, prefix: string, cursor?: string, limit = 1000) {
    const all = [...this.objects.entries()]
      .map(([k, v]) => ({ k, v }))
      .filter(({ k }) => k.startsWith(`${bucket}\u0000${prefix}`))
      .map(({ k, v }) => ({ key: k.slice(bucket.length + 1), size: v.body.length, etag: v.etag }))
      .sort((a, b) => a.key.localeCompare(b.key));
    const start = cursor ? all.findIndex((o) => o.key > cursor) : 0;
    if (start < 0) return { keys: [] };
    const page = all.slice(start, start + limit);
    return { keys: page, next: start + limit < all.length ? page[page.length - 1]?.key : undefined };
  }

  /** test helpers */
  corrupt(bucket: string, key: string) {
    const o = this.objects.get(this.#k(bucket, key));
    if (o) { const b = Buffer.from(o.body); b[0] = b[0] ^ 0xff; o.body = b; }
  }
  remove(bucket: string, key: string) { this.objects.delete(this.#k(bucket, key)); }
  has(bucket: string, key: string) { return this.objects.has(this.#k(bucket, key)); }
  seed(bucket: string, key: string, body: Buffer, contentType = 'application/octet-stream') { this.#store(bucket, key, body, contentType); }
}

const lower = (h: Record<string, string>) => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));
const safeEq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
