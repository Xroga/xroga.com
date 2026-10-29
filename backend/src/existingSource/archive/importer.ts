/**
 * Turns an uploaded ZIP into an archive record: validated paths, one wrapper directory removed, text kept, and everything that must
 * never be kept (credentials, binaries, vendored and generated trees, oversize files) listed by name but stored without content.
 */
import { exclusionFor } from '../intelligence/exclusions.js';
import { isSensitivePath } from '../sensitivePaths.js';
import { ExistingSourceError } from '../types.js';
import { archiveDigest, type ArchiveFile } from './archivePort.js';
import { DEFAULT_ZIP_LIMITS, readZip, type ZipLimits } from './zipReader.js';

export const MAX_KEPT_BYTES = 8 * 1024 * 1024;
export const MAX_KEPT_FILE_BYTES = 512 * 1024;

export interface ImportedArchive {
  readonly name: string;
  readonly digest: string;
  readonly files: ArchiveFile[];
  readonly report: { readonly entries: number; readonly kept: number; readonly keptBytes: number; readonly listedOnly: number; readonly refused: Record<string, number> };
}

const decodeText = (data: Buffer): string | null => {
  if (data.subarray(0, 8192).includes(0)) return null;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { return null; }
};

export function importArchive(zip: Buffer, displayName: string, limits: ZipLimits = DEFAULT_ZIP_LIMITS): ImportedArchive {
  const name = String(displayName ?? '').replace(/\.zip$/i, '').replace(/[^A-Za-z0-9._ -]/g, '').trim().slice(0, 80) || 'project';
  const { files: raw, skipped } = readZip(zip, limits);
  if (raw.length === 0) throw new ExistingSourceError('INVALID_ARCHIVE', 'The archive contains no files.');
  const tops = new Set(raw.map((f) => f.path.split('/')[0]));
  const strip = tops.size === 1 && raw.every((f) => f.path.includes('/'));
  const refused: Record<string, number> = {};
  for (const s of skipped) refused[s.reason] = (refused[s.reason] ?? 0) + 1;
  const files: ArchiveFile[] = []; let kept = 0; let keptBytes = 0; let listedOnly = 0;
  for (const f of raw) {
    const path = strip ? f.path.slice(f.path.indexOf('/') + 1) : f.path;
    const keep = !isSensitivePath(path) && exclusionFor({ path, mode: '100644', type: 'blob', size: f.data.length }) === null && f.data.length <= MAX_KEPT_FILE_BYTES;
    const text = keep ? decodeText(f.data) : null;
    if (text === null) { files.push({ path, text: null, size: f.data.length }); listedOnly++; continue; }
    keptBytes += f.data.length;
    if (keptBytes > MAX_KEPT_BYTES) throw new ExistingSourceError('INVALID_ARCHIVE', `The source text is larger than ${MAX_KEPT_BYTES / 1048576} MB. Import a smaller project or link it from GitHub.`);
    files.push({ path, text, size: f.data.length }); kept++;
  }
  return { name, digest: archiveDigest(files), files, report: { entries: raw.length, kept, keptBytes, listedOnly, refused } };
}
