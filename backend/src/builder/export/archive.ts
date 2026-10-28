import { createHash } from 'node:crypto';
import { crc32, inflateRawSync } from 'node:zlib';

import type { ProjectFile } from '../../ai/patches.js';
import { packageBuildZip } from '../../services/scaffolds/packageBuildZip.js';
import { assertSnapshotAcceptable, hashSnapshot, isSafeProjectPath } from '../snapshot.js';
import { BuilderError, type BuilderRevision, type StarterProvenance } from '../types.js';

/**
 * Verified source export.
 *
 * The archive contains the project's source at one exact revision, a manifest of per-file SHA-256
 * hashes, and setup instructions. Credentials and disposable build output are excluded and listed
 * as excluded, so completeness is checkable: every revision file is either in the archive or named
 * as excluded with the reason. The archive is then re-read and verified before it is returned.
 */

export const EXPORT_MANIFEST_PATH = 'XROGA-EXPORT.json';
export const EXPORT_SETUP_PATH = 'XROGA-SETUP.md';
export const MAX_EXPORT_BYTES = 25 * 1024 * 1024;

const EXCLUDED_PREFIXES = ['node_modules/', '.next/', '.nuxt/', '.svelte-kit/', 'dist/', 'build/', 'out/', '.turbo/', '.cache/', 'coverage/', '.vercel/', '.git/', '__pycache__/', '.pytest_cache/', 'target/'];
const EXCLUDED_EXACT = new Set(['.DS_Store', 'Thumbs.db']);
const SECRET_FILE = /(^|\/)(\.env(\..*)?|\.npmrc|id_rsa|id_ed25519|.*\.pem|.*\.p12|credentials\.json)$/i;
const ENV_EXAMPLE = /(^|\/)\.env\.(example|sample|template)$/i;

export type ExcludedReason = 'credential_file' | 'build_output_or_cache';

export interface ExportExclusion {
  readonly path: string;
  readonly reason: ExcludedReason;
}

export function classifyExportPath(path: string): ExcludedReason | null {
  if (ENV_EXAMPLE.test(path)) return null;
  if (SECRET_FILE.test(path)) return 'credential_file';
  if (EXCLUDED_EXACT.has(path.split('/').pop() ?? '') || /\.log$/.test(path)) return 'build_output_or_cache';
  const lower = path.toLowerCase();
  if (EXCLUDED_PREFIXES.some((prefix) => lower.startsWith(prefix) || lower.includes(`/${prefix}`))) return 'build_output_or_cache';
  return null;
}

export interface ExportManifest {
  readonly schema: 'xroga.source-export';
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly revisionId: string;
  readonly revisionNumber: number;
  /** Content hash of the whole revision, as stored in Xroga. */
  readonly revisionContentSha256: string;
  /** Content hash of exactly the files in this archive. */
  readonly sourceSha256: string;
  readonly files: ReadonlyArray<{ readonly path: string; readonly sha256: string; readonly bytes: number }>;
  readonly excluded: readonly ExportExclusion[];
  readonly starter: { readonly id: string; readonly version: string; readonly license: string; readonly upstream: StarterProvenance['upstream'] };
}

export interface BuiltArchive {
  readonly filename: string;
  readonly buffer: Buffer;
  readonly sha256: string;
  readonly bytes: number;
  readonly manifest: ExportManifest;
}

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

/** Setup instructions derived from the project's real files. No secret values: only variable names. */
export function setupInstructions(files: readonly ProjectFile[], title: string): string {
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  const lines = [`# ${title}: setup`, '', 'This is your project source, exported from Xroga. You own it. Nothing here contains credentials.', ''];
  const pkg = byPath.get('package.json');
  if (pkg) {
    let scripts: Record<string, string> = {};
    let usesNext = false;
    try {
      const parsed = JSON.parse(pkg) as { scripts?: Record<string, string>; dependencies?: Record<string, string> };
      scripts = parsed.scripts ?? {};
      usesNext = Boolean(parsed.dependencies?.next);
    } catch {
      lines.push('Note: package.json could not be parsed; check it before installing.', '');
    }
    lines.push('## Run it locally', '', 'Requires Node.js 20 or newer.', '', '```bash', 'npm install');
    if (byPath.has('.env.example')) lines.push('cp .env.example .env.local   # then fill in your own values');
    if (scripts.dev) lines.push('npm run dev');
    lines.push('```', '');
    if (scripts.build) lines.push('## Production build', '', '```bash', 'npm run build', scripts.start ? 'npm start' : '', '```', '');
    if (usesNext) lines.push('The app is a Next.js application. It listens on http://localhost:3000 by default.', '');
  } else if (byPath.has('index.html')) {
    lines.push('## Run it locally', '', 'This is a static website. Open `index.html` in a browser, or serve the folder:', '', '```bash', 'npx serve .', '```', '');
  }
  const env = byPath.get('.env.example');
  if (env) {
    const names = [...env.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*=/gm)].map((match) => match[1]);
    if (names.length) {
      lines.push('## Environment variables', '', 'Set these in your own environment. Xroga never exports their values:', '', ...names.map((name) => `- \`${name}\``), '');
      if (names.some((name) => name.startsWith('SUPABASE') || name.includes('SUPABASE'))) {
        lines.push('Database and sign-in use YOUR Supabase project. Create one at supabase.com, then apply the SQL files under `supabase/` if present. Never put a service-role key in client-side code.', '');
      }
    }
  }
  lines.push('## Verifying this archive', '', `\`${EXPORT_MANIFEST_PATH}\` lists the SHA-256 of every file. Recompute them to confirm nothing changed.`, '');
  return `${lines.filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n')}\n`;
}

export function buildSourceArchive(input: { readonly projectId: string; readonly title: string; readonly revision: BuilderRevision; readonly starter: StarterProvenance; /** Generated delivery files (for example the reviewed database migration) that are not part of the stored revision. */ readonly extraFiles?: readonly ProjectFile[] }): BuiltArchive {
  const { revision } = input;
  // Defense in depth: the same checks that guard storage are applied again before anything leaves Xroga.
  assertSnapshotAcceptable(revision.files);

  const excluded: ExportExclusion[] = [];
  const included: ProjectFile[] = [];
  for (const file of [...revision.files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const reason = classifyExportPath(file.path);
    if (reason) excluded.push({ path: file.path, reason });
    else included.push({ path: file.path, content: file.content });
  }
  const present = new Set(included.map((file) => file.path));
  for (const extra of input.extraFiles ?? []) {
    if (present.has(extra.path) || excluded.some((item) => item.path === extra.path)) continue;
    if (classifyExportPath(extra.path)) throw new BuilderError('invalid_input', `A generated delivery file is not exportable: ${extra.path}`);
    included.push({ path: extra.path, content: extra.content });
  }
  included.sort((a, b) => (a.path < b.path ? -1 : 1));
  if (included.length === 0) throw new BuilderError('invalid_input', 'There are no source files to export.');
  for (const reserved of [EXPORT_MANIFEST_PATH, EXPORT_SETUP_PATH]) {
    if (included.some((file) => file.path === reserved)) throw new BuilderError('invalid_input', `The project contains a file named ${reserved}, which is reserved for the export.`);
  }

  const manifest: ExportManifest = {
    schema: 'xroga.source-export',
    schemaVersion: 1,
    projectId: input.projectId,
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
    revisionContentSha256: revision.contentSha256,
    sourceSha256: hashSnapshot(included),
    files: included.map((file) => ({ path: file.path, sha256: sha256(file.content), bytes: Buffer.byteLength(file.content, 'utf8') })),
    excluded,
    starter: { id: input.starter.starterId, version: input.starter.starterVersion, license: input.starter.license, upstream: input.starter.upstream },
  };

  const archiveFiles: ProjectFile[] = [
    ...included,
    { path: EXPORT_SETUP_PATH, content: setupInstructions(included, input.title) },
    { path: EXPORT_MANIFEST_PATH, content: `${JSON.stringify(manifest, null, 2)}\n` },
  ];
  const buffer = packageBuildZip(archiveFiles, { include: () => true });
  if (buffer.length > MAX_EXPORT_BYTES) throw new BuilderError('too_large', 'The project is too large to export as a single archive.');
  const built: BuiltArchive = { filename: archiveName(input.title, revision.revisionNumber), buffer, sha256: sha256(buffer), bytes: buffer.length, manifest };
  // Never hand out an archive that has not been read back and verified.
  const verdict = verifyArchive(buffer, revision);
  if (!verdict.ok) throw new BuilderError('storage_failed', `The export failed verification and was not produced: ${verdict.problems[0]}`);
  return built;
}

export function archiveName(title: string, revisionNumber: number): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'xroga-project';
  return `${base}-r${revisionNumber}.zip`;
}

export interface ZipEntry {
  readonly path: string;
  readonly data: Buffer;
  readonly crcValid: boolean;
}

/** Minimal, defensive ZIP reader (stored and deflate entries). Rejects unsafe paths and truncated data. */
export function readZip(buffer: Buffer): ZipEntry[] {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0 || eocd + 22 > buffer.length) throw new BuilderError('invalid_input', 'Not a valid ZIP archive.');
  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (centralOffset + centralSize > buffer.length || count > 10_000) throw new BuilderError('invalid_input', 'The ZIP directory is invalid.');
  const entries: ZipEntry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new BuilderError('invalid_input', 'The ZIP directory is corrupt.');
    const method = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const size = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const path = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!isSafeProjectPath(path)) throw new BuilderError('invalid_input', `The ZIP contains an unsafe path: ${JSON.stringify(path.slice(0, 60))}`);
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new BuilderError('invalid_input', 'A ZIP entry header is corrupt.');
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (dataStart + compressedSize > buffer.length) throw new BuilderError('invalid_input', 'A ZIP entry is truncated.');
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    let data: Buffer;
    try {
      data = method === 0 ? Buffer.from(raw) : method === 8 ? inflateRawSync(raw, { maxOutputLength: MAX_EXPORT_BYTES }) : (() => { throw new Error('method'); })();
    } catch {
      throw new BuilderError('invalid_input', `A ZIP entry could not be read: ${path}`);
    }
    entries.push({ path, data, crcValid: data.length === size && crc32(data) === crc });
  }
  return entries;
}

export interface ArchiveVerdict {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly manifest: ExportManifest | null;
  readonly fileCount: number;
}

/**
 * Verifies an archive against the revision it claims to contain: structure, CRCs, per-file hashes,
 * completeness (every revision file is included or listed as excluded) and the absence of any
 * credential file or unexpected extra entry.
 */
export function verifyArchive(buffer: Buffer, revision: Pick<BuilderRevision, 'files' | 'contentSha256' | 'id'>): ArchiveVerdict {
  const problems: string[] = [];
  let entries: ZipEntry[];
  try {
    entries = readZip(buffer);
  } catch (error) {
    return { ok: false, problems: [error instanceof Error ? error.message : 'unreadable archive'], manifest: null, fileCount: 0 };
  }
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  if (byPath.size !== entries.length) problems.push('The archive contains duplicate paths.');
  for (const entry of entries) if (!entry.crcValid) problems.push(`Checksum mismatch inside the archive: ${entry.path}`);
  const manifestEntry = byPath.get(EXPORT_MANIFEST_PATH);
  if (!manifestEntry) return { ok: false, problems: [...problems, 'The archive has no manifest.'], manifest: null, fileCount: entries.length };
  let manifest: ExportManifest;
  try {
    manifest = JSON.parse(manifestEntry.data.toString('utf8')) as ExportManifest;
  } catch {
    return { ok: false, problems: [...problems, 'The manifest is not valid JSON.'], manifest: null, fileCount: entries.length };
  }
  if (manifest.revisionId !== revision.id) problems.push('The manifest names a different revision.');
  if (manifest.revisionContentSha256 !== revision.contentSha256) problems.push('The manifest does not match the revision content hash.');
  const sourceEntries: ProjectFile[] = [];
  for (const declared of manifest.files) {
    const entry = byPath.get(declared.path);
    if (!entry) {
      problems.push(`Declared file is missing from the archive: ${declared.path}`);
      continue;
    }
    if (sha256(entry.data) !== declared.sha256 || entry.data.length !== declared.bytes) problems.push(`File hash does not match the manifest: ${declared.path}`);
    sourceEntries.push({ path: declared.path, content: entry.data.toString('utf8') });
  }
  if (hashSnapshot(sourceEntries) !== manifest.sourceSha256) problems.push('The archive source hash does not match the manifest.');
  const declaredPaths = new Set(manifest.files.map((file) => file.path));
  for (const entry of entries) {
    if (entry.path === EXPORT_MANIFEST_PATH || entry.path === EXPORT_SETUP_PATH) continue;
    if (!declaredPaths.has(entry.path)) problems.push(`Unexpected file in the archive: ${entry.path}`);
    if (classifyExportPath(entry.path) !== null) problems.push(`A credential or build-output file is in the archive: ${entry.path}`);
  }
  if (!byPath.has(EXPORT_SETUP_PATH)) problems.push('The archive has no setup instructions.');
  // Completeness against the revision itself.
  const excludedPaths = new Set(manifest.excluded.map((item) => item.path));
  for (const file of revision.files) {
    if (!declaredPaths.has(file.path) && !excludedPaths.has(file.path)) problems.push(`A source file is neither exported nor listed as excluded: ${file.path}`);
    if (declaredPaths.has(file.path)) {
      const exported = byPath.get(file.path);
      if (exported && exported.data.toString('utf8') !== file.content) problems.push(`Exported content differs from the revision: ${file.path}`);
    }
  }
  for (const item of manifest.excluded) if (classifyExportPath(item.path) === null) problems.push(`A file was excluded without a valid reason: ${item.path}`);
  return { ok: problems.length === 0, problems, manifest, fileCount: entries.length };
}
