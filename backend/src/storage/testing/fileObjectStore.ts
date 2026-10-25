import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { ProviderUnavailableError, type CompletedPart, type HeadResult, type ObjectStore } from '../objectStore.js';

/**
 * Disk-backed SYNTHETIC store for multi-GiB tests: parts and objects live in a temp directory, so a 1 GiB copy does not need
 * 1 GiB of RAM in the *test* either. Not a provider; no evidence from it is provider verification.
 */
export class FileObjectStore implements ObjectStore {
  readonly provider = 'memory' as const;
  readonly uploads = new Map<string, { bucket: string; key: string; parts: Map<number, { file: string; size: number; etag: string }> }>();
  partCalls = 0;
  constructor(readonly root: string) {}
  // short hashed name: a hex-encoded key exceeds the Windows MAX_PATH limit
  #obj(b: string, k: string) { return path.join(this.root, 'obj', createHash('sha256').update(`${b}\0${k}`).digest('hex')); }
  async cleanup() { await rm(this.root, { recursive: true, force: true }); }

  async head(b: string, k: string): Promise<HeadResult | null> {
    const st = await stat(this.#obj(b, k)).catch(() => null);
    return st ? { size: st.size, etag: null, versionId: null, contentType: 'application/octet-stream', checksumSha256: null } : null;
  }
  async readRange(b: string, k: string, start: number, length: number) {
    const fh = await open(this.#obj(b, k), 'r');
    try { const buf = Buffer.alloc(length); const { bytesRead } = await fh.read(buf, 0, length, start); return buf.subarray(0, bytesRead); } finally { await fh.close(); }
  }
  async openRead(b: string, k: string): Promise<AsyncIterable<Uint8Array>> { return createReadStream(this.#obj(b, k), { highWaterMark: 1 << 20 }); }
  async createMultipart(b: string, k: string) {
    const uploadId = randomBytes(8).toString('hex');
    this.uploads.set(uploadId, { bucket: b, key: k, parts: new Map() });
    return { uploadId };
  }
  async uploadPart(_b: string, _k: string, uploadId: string, n: number, body: Buffer) {
    this.partCalls++;
    const up = this.uploads.get(uploadId);
    if (!up) throw Object.assign(new Error('NoSuchUpload'), { name: 'NoSuchUpload' });
    const file = path.join(this.root, 'parts', `${uploadId}-${n}`);
    await mkdir(path.dirname(file), { recursive: true });
    const fh = await open(file, 'w');
    try { await fh.writeFile(body); } finally { await fh.close(); }
    const etag = `"${createHash('md5').update(body).digest('hex')}"`;
    up.parts.set(n, { file, size: body.length, etag });
    return { etag };
  }
  async listParts(_b: string, _k: string, uploadId: string) {
    const up = this.uploads.get(uploadId);
    if (!up) throw Object.assign(new Error('NoSuchUpload'), { name: 'NoSuchUpload' });
    return [...up.parts.entries()].sort((a, b) => a[0] - b[0]).map(([partNumber, p]) => ({ partNumber, size: p.size, etag: p.etag }));
  }
  async completeMultipart(b: string, k: string, uploadId: string, parts: CompletedPart[]) {
    const up = this.uploads.get(uploadId);
    if (!up) throw Object.assign(new Error('NoSuchUpload'), { name: 'NoSuchUpload' });
    const dest = this.#obj(b, k);
    await mkdir(path.dirname(dest), { recursive: true });
    const out = createWriteStream(dest);
    const outFailed = new Promise<never>((_, rej) => out.once('error', rej));
    outFailed.catch(() => undefined);
    for (const p of [...parts].sort((x, y) => x.partNumber - y.partNumber)) {
      const s = up.parts.get(p.partNumber);
      if (!s || s.etag !== p.etag) { out.destroy(); throw new Error('InvalidPart'); }
      await Promise.race([outFailed, new Promise<void>((res, rej) => { const r = createReadStream(s.file); r.on('error', rej); r.on('end', res); r.pipe(out, { end: false }); })]);
    }
    await Promise.race([outFailed, new Promise<void>((res) => out.end(res))]);
    for (const s of up.parts.values()) await rm(s.file, { force: true });
    this.uploads.delete(uploadId);
    return { etag: null, versionId: null };
  }
  async abortMultipart(_b: string, _k: string, uploadId: string) {
    const up = this.uploads.get(uploadId);
    if (up) for (const s of up.parts.values()) await rm(s.file, { force: true });
    this.uploads.delete(uploadId);
  }
  async delete(b: string, k: string) { await rm(this.#obj(b, k), { force: true }); }
  async list(): Promise<{ keys: Array<{ key: string; size: number }> }> { return { keys: [] }; }
  async put(): Promise<never> { throw new ProviderUnavailableError('not supported by FileObjectStore'); }
  async putStream(b: string, k: string, body: AsyncIterable<Uint8Array>) {
    const dest = this.#obj(b, k); await mkdir(path.dirname(dest), { recursive: true });
    const { Readable } = await import('node:stream');
    await pipeline(Readable.from(body), createWriteStream(dest));
    return { etag: null, versionId: null };
  }
  async presignPut(): Promise<never> { throw new Error('not supported'); }
  async presignGet(): Promise<never> { throw new Error('not supported'); }
  async presignPart(): Promise<never> { throw new Error('not supported'); }
}
