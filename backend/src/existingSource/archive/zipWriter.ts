/** Deterministic ZIP writer for exports (changed files only, safe relative paths, regular files, fixed timestamp). */
import { deflateRawSync } from 'node:zlib';
import { safeEntryPath } from './zipReader.js';

const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Buffer): number => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const DOS_DATE = ((2000 - 1980) << 9) | (1 << 5) | 1;

export function writeZip(files: readonly { path: string; content: string | Buffer }[]): Buffer {
  const parts: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const path = safeEntryPath(f.path);
    if (path === null) throw new Error(`Unsafe path in export: ${f.path}`);
    const name = Buffer.from(path, 'utf8'); const raw = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8');
    const deflated = deflateRawSync(raw); const useDeflate = deflated.length < raw.length; const body = useDeflate ? deflated : raw; const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(method, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(name.length, 26);
    parts.push(local, name, body);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE((3 << 8) | 20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x800, 8); cen.writeUInt16LE(method, 10); cen.writeUInt16LE(DOS_DATE, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(raw.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE((0o100644 << 16) >>> 0, 38); cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(central.length / 2, 8); eocd.writeUInt16LE(central.length / 2, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, eocd]);
}
