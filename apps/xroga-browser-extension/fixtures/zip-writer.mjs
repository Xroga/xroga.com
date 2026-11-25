// A tiny zip writer for fixtures and tests (stored or deflated members). Not used by the extension.
import { deflateRawSync } from 'node:zlib';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const le = (n, bytes) => Buffer.from(Array.from({ length: bytes }, (_, i) => (n >>> (8 * i)) & 0xff));

/** files: { 'path': string | Buffer }, options.store: array of paths that are stored without compression. */
export function makeZip(files, options = {}) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const stored = options.store?.includes(name);
    const packed = stored ? data : deflateRawSync(data);
    const nameBuf = Buffer.from(name, 'utf8');
    const header = Buffer.concat([le(0x04034b50, 4), le(20, 2), le(0x0800, 2), le(stored ? 0 : 8, 2), le(0, 2), le(0x21, 2), le(crc32(data), 4), le(packed.length, 4), le(data.length, 4), le(nameBuf.length, 2), le(0, 2), nameBuf]);
    parts.push(header, packed);
    central.push(Buffer.concat([le(0x02014b50, 4), le(20, 2), le(20, 2), le(0x0800, 2), le(stored ? 0 : 8, 2), le(0, 2), le(0x21, 2), le(crc32(data), 4), le(packed.length, 4), le(data.length, 4), le(nameBuf.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(offset, 4), nameBuf]));
    offset += header.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.concat([le(0x06054b50, 4), le(0, 2), le(0, 2), le(central.length, 2), le(central.length, 2), le(dir.length, 4), le(offset, 4), le(0, 2)]);
  return Buffer.concat([...parts, dir, end]);
}
