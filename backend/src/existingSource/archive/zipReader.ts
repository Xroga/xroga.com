/**
 * A small, bounded, read-only ZIP reader for importing an EXISTING project as an archive.
 *
 * It never writes to disk and never trusts the archive: every entry name is validated as a relative, normalised path inside the
 * project; encrypted, multi-disk, ZIP64 and unknown-method entries, symlinks and device files are refused or skipped with a recorded
 * reason; the number of entries, each entry's declared and actual size, the total expanded size and the compression ratio are
 * bounded, so a ZIP bomb is rejected before it is expanded. Overlapping or lying headers are caught by checking the real inflated
 * length against the declared one.
 */
import { inflateRawSync } from 'node:zlib';
import { ExistingSourceError } from '../types.js';

export interface ZipLimits {
  readonly maxArchiveBytes: number;
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxTotalBytes: number;
  readonly maxRatio: number;
  readonly maxPathLength: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxArchiveBytes: 10 * 1024 * 1024, maxEntries: 5_000, maxEntryBytes: 2 * 1024 * 1024, maxTotalBytes: 40 * 1024 * 1024, maxRatio: 100, maxPathLength: 260,
};

export interface ZipFile { readonly path: string; readonly data: Buffer }
export interface ZipSkip { readonly path: string; readonly reason: 'symlink' | 'encrypted' | 'unsupported_method' | 'too_large' | 'unsafe_path' | 'special_file' }
export interface ZipContents { readonly files: ZipFile[]; readonly skipped: ZipSkip[]; readonly directories: number; readonly expandedBytes: number }

const bad = (message: string): never => { throw new ExistingSourceError('INVALID_ARCHIVE', message); };

/** The normalised in-project path, or null when the name is unsafe (absolute, drive, traversal, backslash tricks, NUL, control, .git). */
export function safeEntryPath(raw: string, maxLength = DEFAULT_ZIP_LIMITS.maxPathLength): string | null {
  if (!raw || raw.length > maxLength || /[\0-\x1f\x7f]/.test(raw)) return null;
  if (raw.includes('\\') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) return null;
  const parts = raw.replace(/\/+$/, '').split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..' || p.toLowerCase() === '.git')) return null;
  return parts.join('/');
}

const EOCD = 0x06054b50; const CEN = 0x02014b50; const LOC = 0x04034b50;

export function readZip(buffer: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ZipContents {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) bad('That is not a ZIP archive.');
  if (buffer.length > limits.maxArchiveBytes) bad(`The archive is larger than ${Math.round(limits.maxArchiveBytes / 1048576)} MB.`);
  // the end-of-central-directory record: search backwards across the allowed comment length
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) if (buffer.readUInt32LE(i) === EOCD) { eocd = i; break; }
  if (eocd < 0) return bad('That is not a ZIP archive.');
  const disk = buffer.readUInt16LE(eocd + 4); const cdDisk = buffer.readUInt16LE(eocd + 6);
  const entriesHere = buffer.readUInt16LE(eocd + 8); const total = buffer.readUInt16LE(eocd + 10);
  const cdSize = buffer.readUInt32LE(eocd + 12); const cdOffset = buffer.readUInt32LE(eocd + 16);
  if (disk !== 0 || cdDisk !== 0 || entriesHere !== total) bad('Multi-part archives are not supported.');
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) bad('ZIP64 archives are not supported.');
  if (total > limits.maxEntries) bad(`The archive has more than ${limits.maxEntries} entries.`);
  if (cdOffset + cdSize > eocd) bad('The archive directory is damaged.');

  const files: ZipFile[] = []; const skipped: ZipSkip[] = []; const seen = new Set<string>();
  let directories = 0; let expanded = 0; let pos = cdOffset;
  for (let n = 0; n < total; n++) {
    if (pos + 46 > eocd || buffer.readUInt32LE(pos) !== CEN) bad('The archive directory is damaged.');
    const versionMadeBy = buffer.readUInt16LE(pos + 4);
    const flags = buffer.readUInt16LE(pos + 8); const method = buffer.readUInt16LE(pos + 10);
    const compressed = buffer.readUInt32LE(pos + 20); const size = buffer.readUInt32LE(pos + 24);
    const nameLen = buffer.readUInt16LE(pos + 28); const extraLen = buffer.readUInt16LE(pos + 30); const commentLen = buffer.readUInt16LE(pos + 32);
    const externalAttrs = buffer.readUInt32LE(pos + 38); const localOffset = buffer.readUInt32LE(pos + 42);
    if (pos + 46 + nameLen + extraLen + commentLen > eocd) bad('The archive directory is damaged.');
    const utf8 = (flags & 0x800) !== 0;
    const rawName = buffer.subarray(pos + 46, pos + 46 + nameLen).toString(utf8 ? 'utf8' : 'latin1');
    pos += 46 + nameLen + extraLen + commentLen;

    if (rawName.endsWith('/')) {
      if (safeEntryPath(rawName, limits.maxPathLength) === null) skipped.push({ path: rawName.slice(0, 120), reason: 'unsafe_path' }); else directories++;
      continue;
    }
    const path = safeEntryPath(rawName, limits.maxPathLength);
    if (path === null) { skipped.push({ path: rawName.slice(0, 120), reason: 'unsafe_path' }); continue; }
    if (seen.has(path.toLowerCase())) bad('The archive contains the same path twice.');
    seen.add(path.toLowerCase());
    // unix mode lives in the high 16 bits when the archive was made on a unix host
    const unixMode = (versionMadeBy >> 8) === 3 ? (externalAttrs >>> 16) & 0xffff : 0;
    const type = unixMode & 0o170000;
    if (type === 0o120000) { skipped.push({ path, reason: 'symlink' }); continue; }
    if (type !== 0 && type !== 0o100000) { skipped.push({ path, reason: 'special_file' }); continue; }
    if ((flags & 0x1) !== 0) { skipped.push({ path, reason: 'encrypted' }); continue; }
    if (method !== 0 && method !== 8) { skipped.push({ path, reason: 'unsupported_method' }); continue; }
    if (size > limits.maxEntryBytes) { skipped.push({ path, reason: 'too_large' }); continue; }
    if (compressed > 0 && size / compressed > limits.maxRatio && size > 1024) bad('The archive compresses suspiciously well and was refused.');
    expanded += size;
    if (expanded > limits.maxTotalBytes) bad(`The archive expands to more than ${Math.round(limits.maxTotalBytes / 1048576)} MB.`);

    if (localOffset + 30 > cdOffset || buffer.readUInt32LE(localOffset) !== LOC) bad('The archive directory is damaged.');
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (dataStart + compressed > cdOffset) bad('The archive directory is damaged.');
    const raw = buffer.subarray(dataStart, dataStart + compressed);
    let data: Buffer;
    try { data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw, { maxOutputLength: Math.min(limits.maxEntryBytes, size + 1) }); } catch { return bad('An entry in the archive is damaged or larger than it declares.'); }
    if (data.length !== size) bad('An entry in the archive does not match its declared size.');
    files.push({ path, data });
  }
  return { files, skipped, directories, expandedBytes: expanded };
}
