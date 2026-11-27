// Writing a ZIP archive (the container of .xlsx, .docx and .pptx): entries stored as they are, or deflated when the caller supplies a deflater (the browser's CompressionStream does).
// Pure bytes, no browser needed, so it is tested by reading the result back with the reader the extension already has and with an independent one.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]!) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Path inside the archive, with forward slashes. */
  name: string;
  data: Uint8Array;
}

/** Turns bytes into raw deflate (no header): CompressionStream where there is one, else undefined and the entry is stored. */
export async function deflateRaw(data: Uint8Array): Promise<Uint8Array | undefined> {
  const C = (globalThis as unknown as { CompressionStream?: new (f: string) => { writable: WritableStream; readable: ReadableStream } }).CompressionStream;
  if (!C) return undefined;
  const stream = new C('deflate-raw');
  const writer = stream.writable.getWriter();
  void writer.write(data as unknown as BufferSource as never);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const u16 = (v: number) => [v & 255, (v >>> 8) & 255];
const u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];

/** The ZIP bytes for these entries. With `deflate`, entries that get smaller are deflated; the rest stay stored. Order is kept (a .docx wants [Content_Types].xml first). */
export async function buildZip(entries: readonly ZipEntry[], options: { deflate?: (d: Uint8Array) => Promise<Uint8Array | undefined>; date?: Date } = {}): Promise<Uint8Array> {
  const when = options.date ?? new Date(2026, 0, 1, 0, 0, 0);
  const dosTime = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const dosDate = (Math.max(0, when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: number[] = [];
  let offset = 0;
  const push = (b: ArrayLike<number>) => {
    const arr = b instanceof Uint8Array ? b : Uint8Array.from(b);
    parts.push(arr);
    offset += arr.length;
  };
  for (const entry of entries) {
    if (entry.name.length > 65535 || entry.name.startsWith('/') || entry.name.includes('..')) throw new Error('bad entry name: ' + entry.name);
    const name = enc.encode(entry.name);
    const crc = crc32(entry.data);
    let method = 0;
    let body = entry.data;
    if (options.deflate && entry.data.length > 64) {
      const packed = await options.deflate(entry.data);
      if (packed && packed.length < entry.data.length) {
        method = 8;
        body = packed;
      }
    }
    if (body.length >= 0xffffffff || entries.length >= 0xffff) throw new Error('the archive is too large for a plain ZIP');
    const start = offset;
    push([0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0x0800), ...u16(method), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(body.length), ...u32(entry.data.length), ...u16(name.length), ...u16(0)]);
    push(name);
    push(body);
    central.push(0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(method), ...u16(dosTime), ...u16(dosDate), ...u32(crc), ...u32(body.length), ...u32(entry.data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(start));
    for (const b of name) central.push(b);
  }
  const centralStart = offset;
  push(central);
  push([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(offset - centralStart), ...u32(centralStart), ...u16(0)]);
  const out = new Uint8Array(offset);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
