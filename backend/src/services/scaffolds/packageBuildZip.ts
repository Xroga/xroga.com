import { deflateRawSync } from 'node:zlib';
import type { ProjectFile } from '../integrations/githubDeploy.js';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function u16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

/**
 * Build an in-memory ZIP (deflate) from ProjectFile[].
 * Used for Chrome extension sideload packages and other downloadable artifacts.
 */
export function packageBuildZip(
  files: ProjectFile[],
  opts?: { include?: (path: string) => boolean },
): Buffer {
  const include =
    opts?.include ??
    ((p: string) =>
      !p.startsWith('node_modules/') &&
      !p.endsWith('package-lock.json') &&
      !p.startsWith('.git/'));

  const selected = files.filter((f) => include(f.path) && f.content != null);
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const f of selected) {
    const data = Buffer.from(f.content, 'utf8');
    const nameBuf = Buffer.from(f.path.replace(/^\/+/, ''), 'utf8');
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const localHeader = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      compressed,
    ]);
    localParts.push(localHeader);
    const central = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      u16(20),
      u16(20),
      u16(0),
      u16(8),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ]);
    centralParts.push(central);
    offset += localHeader.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(selected.length),
    u16(selected.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...localParts, centralDir, end]);
}

/** Paths that belong in a Chrome extension zip (not preview/docs). */
export function chromeExtensionZipFilter(path: string): boolean {
  if (path === 'index.html' || path === 'package.json') return false;
  if (path.endsWith('.md')) return false;
  if (path.startsWith('scripts/')) return false;
  if (path.startsWith('dist/')) return false;
  return true;
}

/**
 * Electron portable project zip — npm install && npm start locally.
 * Excludes preview story page noise and huge lockfiles; includes package.json + main/renderer.
 */
export function electronPortableZipFilter(path: string): boolean {
  if (path === 'index.html') return false; // web story preview only
  if (path.endsWith('.md') && path !== 'README.md') return false;
  if (path.startsWith('release/') || path.startsWith('dist/')) return false;
  if (path.startsWith('node_modules/')) return false;
  if (path.endsWith('package-lock.json')) return false;
  if (path.startsWith('.github/')) return false;
  return true;
}
