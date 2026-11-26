// A ZIP reader for the files that are zip containers (docx, xlsx, pptx, epub, odt, ods, odp, plain zip). It reads the
// central directory, inflates members with the built-in DecompressionStream and refuses archives that would blow up
// in memory: the member count, the size of one member and the total are all bounded before anything is inflated.
// Idea of the bounds: the EPUB reader of Docling (MIT); written fresh, no code copied.

export interface ZipEntry {
  name: string;
  /** Uncompressed size from the central directory. */
  size: number;
  compressed: number;
  method: number;
  offset: number;
  isDirectory: boolean;
}

export interface ZipLimits {
  maxMembers: number;
  maxMemberBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = { maxMembers: 5000, maxMemberBytes: 80 * 1024 * 1024, maxTotalBytes: 400 * 1024 * 1024 };

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export class ZipError extends Error {}

/** Lists the members. Throws ZipError for a file that is not a zip, is truncated, or exceeds the limits. */
export function listZip(bytes: Uint8Array, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipEntry[] {
  if (bytes.length < 22) throw new ZipError('the file is too small to be a zip container');
  // The end-of-central-directory record is within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 5 && bytes[i + 3] === 6) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('this is not a zip container (no central directory found)');
  const count = u16(bytes, eocd + 10);
  const dirSize = u32(bytes, eocd + 12);
  const dirOffset = u32(bytes, eocd + 16);
  if (count === 0xffff || dirOffset === 0xffffffff || dirSize === 0xffffffff) throw new ZipError('zip64 archives are not supported');
  if (count > limits.maxMembers) throw new ZipError(`the archive has ${count} members, more than the limit of ${limits.maxMembers}`);
  if (dirOffset + dirSize > bytes.length) throw new ZipError('the central directory points outside the file (the file is cut off)');
  const decoder = new TextDecoder('utf-8');
  const entries: ZipEntry[] = [];
  let total = 0;
  let p = dirOffset;
  for (let n = 0; n < count; n++) {
    if (u32(bytes, p) !== 0x02014b50) throw new ZipError('the central directory is damaged');
    const method = u16(bytes, p + 10);
    const compressed = u32(bytes, p + 20);
    const size = u32(bytes, p + 24);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 30);
    const commentLen = u16(bytes, p + 32);
    const offset = u32(bytes, p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (size > limits.maxMemberBytes) throw new ZipError(`member ${name} is ${size} bytes uncompressed, more than the limit of ${limits.maxMemberBytes}`);
    total += size;
    if (total > limits.maxTotalBytes) throw new ZipError(`the archive is more than ${limits.maxTotalBytes} bytes uncompressed`);
    entries.push({ name, size, compressed, method, offset, isDirectory: name.endsWith('/') });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflateRaw(data: Uint8Array, expected: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    // The declared size is not trusted: a member that inflates beyond it is stopped.
    if (length > expected + 1024) {
      await reader.cancel();
      throw new ZipError('a member inflates beyond its declared size (not read)');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** The bytes of one member. */
export async function readZipMember(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  if (u32(bytes, entry.offset) !== 0x04034b50) throw new ZipError(`member ${entry.name} has a damaged header`);
  const nameLen = u16(bytes, entry.offset + 26);
  const extraLen = u16(bytes, entry.offset + 28);
  const start = entry.offset + 30 + nameLen + extraLen;
  const raw = bytes.subarray(start, start + entry.compressed);
  if (entry.method === 0) return raw;
  if (entry.method === 8) return inflateRaw(raw, entry.size);
  throw new ZipError(`member ${entry.name} uses compression method ${entry.method}, which is not supported`);
}

/** A reader over one archive: member lookup by name (case-insensitive fallback) and text decoding. */
export class ZipFile {
  readonly entries: ZipEntry[];
  readonly #bytes: Uint8Array;
  readonly #byName = new Map<string, ZipEntry>();
  constructor(bytes: Uint8Array, limits?: ZipLimits) {
    this.#bytes = bytes;
    this.entries = listZip(bytes, limits);
    for (const e of this.entries) this.#byName.set(e.name.toLowerCase(), e);
  }
  has(name: string): boolean {
    return this.#byName.has(name.replace(/^\//, '').toLowerCase());
  }
  async bytes(name: string): Promise<Uint8Array | undefined> {
    const e = this.#byName.get(name.replace(/^\//, '').toLowerCase());
    return e ? readZipMember(this.#bytes, e) : undefined;
  }
  async text(name: string): Promise<string | undefined> {
    const b = await this.bytes(name);
    return b ? decodeText(b) : undefined;
  }
}

/** UTF-8 (with or without a byte order mark) or UTF-16 by its mark; anything else as UTF-8 with replacement. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const body = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  const strict = new TextDecoder('utf-8', { fatal: true });
  try {
    return strict.decode(body);
  } catch {
    // Not valid UTF-8: the common legacy encoding of spreadsheets and exports.
    return new TextDecoder('windows-1252').decode(body);
  }
}
