/** Builds ZIP bytes for tests, including hostile ones (the reader must handle what a real attacker can produce). */
import { deflateRawSync } from 'node:zlib';

export interface BuildEntry {
  name: string;
  data?: Buffer | string;
  /** unix file mode, e.g. 0o100644 or 0o120000 (symlink). Default regular file. */
  mode?: number;
  store?: boolean;
  encrypted?: boolean;
  method?: number;
  /** Lie about the uncompressed size in both headers. */
  declaredSize?: number;
}

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer): number => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

export function buildZip(entries: BuildEntry[], options: { comment?: string; diskNumber?: number; zip64Marker?: boolean } = {}): Buffer {
  const parts: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const isDir = e.name.endsWith('/');
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data ?? '', 'utf8');
    const method = e.method ?? (e.store || isDir || raw.length === 0 ? 0 : 8);
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const size = e.declaredSize ?? raw.length;
    const flags = 0x800 | (e.encrypted ? 1 : 0);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26);
    parts.push(local, name, body);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE((3 << 8) | 20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(flags, 8); cen.writeUInt16LE(method, 10);
    cen.writeUInt32LE(crc32(raw), 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(size, 24); cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(((e.mode ?? (isDir ? 0o040755 : 0o100644)) << 16) >>> 0, 38); cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const comment = Buffer.from(options.comment ?? '', 'utf8');
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(options.diskNumber ?? 0, 4);
  eocd.writeUInt16LE(options.zip64Marker ? 0xffff : entries.length, 8); eocd.writeUInt16LE(options.zip64Marker ? 0xffff : entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...parts, cd, eocd, comment]);
}
