/**
 * Building and refreshing the code map from a repository TREE, fetching only the blobs that are not already known.
 *
 * The tree gives every file's blob SHA without its content. A row is derived from one blob, so a row whose blob SHA is unchanged is
 * reused as is, whether the commit moved, the branch was force-pushed or the file was renamed: reuse is by content, never by
 * ancestry, which is why branch advancement and a rewritten history are the same case here. Only new or changed blobs are fetched,
 * within an explicit budget; what the budget or a provider limit leaves out is reported as `partial`, never silently dropped.
 */
import { createHash } from 'node:crypto';
import { gitBlobSha } from '../../synthesis/repositoryIndex.js';
import type { CompleteTree } from '../treeReader.js';
import { exclusionFor, isLfsPointer, isManifest, MAX_INDEXED_FILE_BYTES } from './exclusions.js';
import { analyzeFile, isTestPath, languageOf } from './languageAdapters.js';
import {
  CODE_INDEX_SCHEMA_VERSION, EMPTY_ANALYSIS, PARSER_VERSION,
  type BuildMetrics, type CodeIndex, type CodeIndexStatus, type ExclusionReason, type FileAnalysis, type IndexedCodeFile, type PackageInfo,
} from './types.js';

export interface BlobSource {
  /** The decoded text of a blob, or null when it is unreadable or binary. Throws on a provider failure. */
  text(path: string, blobSha: string): Promise<string | null>;
}

export interface BuildLimits {
  readonly maxBlobFetches: number;
  readonly maxBytes: number;
  readonly concurrency: number;
}

export const DEFAULT_BUILD_LIMITS: BuildLimits = { maxBlobFetches: 1_500, maxBytes: 24 * 1024 * 1024, concurrency: 8 };

export const fingerprintOf = (files: readonly Pick<IndexedCodeFile, 'path' | 'blobSha'>[]): string => {
  const h = createHash('sha256').update(`${PARSER_VERSION}\n`);
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) h.update(`${f.path}\0${f.blobSha}\n`);
  return h.digest('hex');
};

const stripJsonComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1').replace(/,\s*([}\]])/g, '$1');
const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');

/** Package boundaries from manifests. Tolerant: a manifest that does not parse contributes nothing. */
export function parseManifest(path: string, content: string): Partial<PackageInfo> & { kind: PackageInfo['kind']; root: string } | null {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const root = dirOf(path);
  try {
    if (base === 'package.json') {
      const j = JSON.parse(content) as { name?: unknown; scripts?: Record<string, unknown>; workspaces?: unknown };
      const ws = Array.isArray(j.workspaces) ? j.workspaces : Array.isArray((j.workspaces as { packages?: unknown })?.packages) ? (j.workspaces as { packages: unknown[] }).packages : [];
      const test = typeof j.scripts?.test === 'string' ? String(j.scripts.test).slice(0, 200) : null;
      return { kind: 'node', root, name: typeof j.name === 'string' ? j.name.slice(0, 200) : null, testCommand: test, workspaces: ws.filter((w): w is string => typeof w === 'string').slice(0, 100) };
    }
    if (base === 'tsconfig.json') {
      const j = JSON.parse(stripJsonComments(content)) as { compilerOptions?: { baseUrl?: unknown; paths?: Record<string, unknown> } };
      const baseUrl = typeof j.compilerOptions?.baseUrl === 'string' ? j.compilerOptions.baseUrl : '.';
      const aliases: Record<string, string[]> = {};
      for (const [alias, targets] of Object.entries(j.compilerOptions?.paths ?? {})) {
        if (Array.isArray(targets)) aliases[alias] = targets.filter((t): t is string => typeof t === 'string').map((t) => `${baseUrl}/${t}`.replace(/\/\.\//g, '/')).slice(0, 8);
      }
      return { kind: 'node', root, aliases };
    }
    if (base === 'go.mod') {
      const m = /^\s*module\s+(\S+)/m.exec(content);
      return m ? { kind: 'go', root, name: m[1]!, modulePath: m[1]!, testCommand: 'go test ./...' } : null;
    }
    if (base === 'pyproject.toml') {
      const name = /^\s*name\s*=\s*["']([^"']+)["']/m.exec(content)?.[1] ?? null;
      return { kind: 'python', root, name, testCommand: /pytest/.test(content) ? 'pytest' : null };
    }
    if (base === 'setup.py' || base === 'setup.cfg' || base === 'requirements.txt') return { kind: 'python', root, name: null, testCommand: /pytest/.test(content) ? 'pytest' : null };
  } catch { /* a manifest that does not parse contributes nothing */ }
  return null;
}

function mergePackages(parts: Array<Partial<PackageInfo> & { kind: PackageInfo['kind']; root: string }>): PackageInfo[] {
  const byKey = new Map<string, PackageInfo>();
  for (const p of parts) {
    const key = `${p.kind}:${p.root}`;
    const cur = byKey.get(key) ?? { root: p.root, kind: p.kind, name: null, testCommand: null, workspaces: [], aliases: {}, modulePath: null };
    byKey.set(key, {
      ...cur, name: p.name ?? cur.name, testCommand: p.testCommand ?? cur.testCommand, workspaces: p.workspaces?.length ? p.workspaces : cur.workspaces,
      aliases: { ...cur.aliases, ...(p.aliases ?? {}) }, modulePath: p.modulePath ?? cur.modulePath,
    });
  }
  return [...byKey.values()].sort((a, b) => (a.root < b.root ? -1 : a.root > b.root ? 1 : a.kind < b.kind ? -1 : 1));
}

/** Rows whose blob is already known are reused: the test flag depends on the path, so it is re-derived for a moved file. */
function reuse(row: IndexedCodeFile, path: string): IndexedCodeFile {
  const analysis: FileAnalysis = { ...row.analysis, isTest: isTestPath(path) || row.analysis.testNames.length > 0 };
  return { path, blobSha: row.blobSha, size: row.size, analysis };
}

export interface BuildInput {
  readonly commitSha: string;
  readonly treeSha: string | null;
  readonly tree: CompleteTree;
  readonly blobs: BlobSource;
  readonly prior?: CodeIndex | null;
  readonly limits?: Partial<BuildLimits>;
  readonly now?: () => Date;
  readonly clock?: () => number;
}

export async function buildCodeIndex(input: BuildInput): Promise<{ index: CodeIndex; metrics: BuildMetrics }> {
  const limits = { ...DEFAULT_BUILD_LIMITS, ...(input.limits ?? {}) };
  const clock = input.clock ?? (() => Date.now());
  const started = clock();
  const excluded: Partial<Record<ExclusionReason, number>> = {};
  const exclude = (reason: ExclusionReason) => { excluded[reason] = (excluded[reason] ?? 0) + 1; };

  const usablePrior = input.prior && input.prior.parserVersion === PARSER_VERSION && input.prior.schemaVersion === CODE_INDEX_SCHEMA_VERSION ? input.prior : null;
  const priorByBlob = new Map<string, IndexedCodeFile>();
  for (const row of usablePrior?.files ?? []) if (!priorByBlob.has(row.blobSha)) priorByBlob.set(row.blobSha, row);

  const blobEntries = input.tree.entries.filter((e) => e.type !== 'tree' && typeof e.path === 'string' && typeof e.sha === 'string');
  const wanted: Array<{ path: string; sha: string; size: number | null }> = [];
  for (const e of blobEntries) {
    const reason = exclusionFor({ path: e.path!, mode: e.mode, type: e.type, size: typeof e.size === 'number' ? e.size : null });
    if (reason) exclude(reason); else wanted.push({ path: e.path!, sha: e.sha!, size: typeof e.size === 'number' ? e.size : null });
  }
  // manifests first (package boundaries inform everything else), then shallow source before deep, so a budget cut keeps the core
  wanted.sort((a, b) => Number(isManifest(b.path)) - Number(isManifest(a.path)) || a.path.split('/').length - b.path.split('/').length || (a.path < b.path ? -1 : 1));

  const rows: IndexedCodeFile[] = [];
  const manifests: Array<Partial<PackageInfo> & { kind: PackageInfo['kind']; root: string }> = [];
  const toFetch: typeof wanted = [];
  let reused = 0;
  for (const w of wanted) {
    const prior = priorByBlob.get(w.sha);
    if (prior && languageOf(prior.path) === languageOf(w.path)) {
      rows.push(reuse(prior, w.path)); reused += 1;
      // a reused manifest still defines its package: its parse is cheap but needs content, so manifests are always refetched below only when not reused
      continue;
    }
    toFetch.push(w);
  }

  let fetches = 0; let bytes = 0; let analyzed = 0;
  let partialReason: string | undefined;
  const results = new Map<string, { text: string | null; failed?: boolean }>();
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      if (partialReason) return;
      const i = cursor++; if (i >= toFetch.length) return;
      const w = toFetch[i]!;
      if (fetches >= limits.maxBlobFetches) { partialReason = partialReason ?? 'fetch_budget'; return; }
      if (bytes >= limits.maxBytes) { partialReason = partialReason ?? 'byte_budget'; return; }
      fetches += 1;
      try {
        const text = await input.blobs.text(w.path, w.sha);
        if (text !== null) bytes += Buffer.byteLength(text, 'utf8');
        results.set(w.sha + w.path, { text });
      } catch {
        // rate limit, outage or revoked token: stop spending, keep what was read, and say the map is partial
        partialReason = partialReason ?? 'provider_unavailable';
        results.set(w.sha + w.path, { text: null, failed: true });
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, limits.concurrency) }, worker));

  for (const w of toFetch) {
    const r = results.get(w.sha + w.path);
    if (!r) { exclude('budget'); continue; }
    if (r.failed) { exclude('budget'); continue; }
    if (r.text === null) { exclude('binary'); continue; }
    if (isLfsPointer(r.text)) { exclude('lfs_pointer'); continue; }
    if (Buffer.byteLength(r.text, 'utf8') > MAX_INDEXED_FILE_BYTES) { exclude('too_large'); continue; }
    const manifest = isManifest(w.path) ? parseManifest(w.path, r.text) : null;
    if (manifest) manifests.push(manifest);
    const analysis = manifest ? { ...EMPTY_ANALYSIS, language: languageOf(w.path) } : analyzeFile(w.path, r.text);
    analyzed += 1;
    rows.push({ path: w.path, blobSha: w.sha, size: Buffer.byteLength(r.text, 'utf8'), analysis });
  }

  // package boundaries come from this build's manifests plus those of reused rows (their parse is kept in the prior packages)
  const priorPackages = usablePrior?.packages ?? [];
  const reusedRoots = new Set(rows.filter((r) => isManifest(r.path)).map((r) => dirOf(r.path)));
  const carried = priorPackages.filter((p) => reusedRoots.has(p.root) && !manifests.some((m) => m.kind === p.kind && m.root === p.root));
  const packages = mergePackages([...carried.map((p) => ({ ...p })), ...manifests]);

  rows.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const treeComplete = input.tree.complete;
  const reasons = [partialReason, treeComplete ? undefined : `tree_${input.tree.partialReason ?? 'incomplete'}`].filter((r): r is string => Boolean(r));
  const status: CodeIndexStatus = reasons.length === 0 ? 'valid' : 'partial';
  const index: CodeIndex = {
    schemaVersion: CODE_INDEX_SCHEMA_VERSION, parserVersion: PARSER_VERSION, commitSha: input.commitSha, treeSha: input.treeSha, status,
    coverage: { filesKnown: blobEntries.length, filesIndexed: rows.length, excluded, treeComplete, ...(reasons.length ? { partialReason: reasons.join(', ') } : {}) },
    files: rows, packages, contentFingerprint: fingerprintOf(rows), builtAt: (input.now ?? (() => new Date()))().toISOString(),
  };
  return {
    index,
    metrics: { kind: usablePrior ? 'incremental' : 'cold', blobFetches: fetches, bytesFetched: bytes, reusedRows: reused, analyzedRows: analyzed, durationMs: clock() - started },
  };
}

/** Whether a stored map may be returned for this exact commit: same commit, same extraction, and a fingerprint that still matches its rows. */
export function isCurrentFor(index: CodeIndex, commitSha: string): boolean {
  return index.commitSha === commitSha && index.parserVersion === PARSER_VERSION && index.schemaVersion === CODE_INDEX_SCHEMA_VERSION
    && index.contentFingerprint === fingerprintOf(index.files);
}

// ----------------------------------------------------------------------------------------------------------------- overlay

export interface OverlayFile { readonly path: string; /** null means the file is deleted in the working tree */ readonly content: string | null }

export interface CodeIndexView {
  readonly base: CodeIndex;
  /** The map as the working tree is now: overlay files re-analysed, deleted files removed. Equals `base.files` with no overlay. */
  readonly files: readonly IndexedCodeFile[];
  readonly packages: readonly PackageInfo[];
  /** Empty when there is no overlay. A different value means the view differs from the committed map. */
  readonly overlayFingerprint: string;
  readonly overlayPaths: readonly string[];
}

export const overlayFingerprintOf = (overlay: readonly OverlayFile[]): string => {
  if (overlay.length === 0) return '';
  const h = createHash('sha256');
  for (const o of [...overlay].sort((a, b) => (a.path < b.path ? -1 : 1))) h.update(`${o.path}\0${o.content === null ? 'deleted' : gitBlobSha(o.content)}\n`);
  return h.digest('hex');
};

/**
 * The map as the WORKING TREE is: committed rows, with every overlay file re-analysed from its current content and every deleted
 * file removed. An index of the committed commit alone never describes uncommitted edits, so callers that have edits must ask for
 * the view, and a symbol that an edit removed or renamed cannot be returned from the old row.
 */
export function applyOverlay(base: CodeIndex, overlay: readonly OverlayFile[]): CodeIndexView {
  if (overlay.length === 0) return { base, files: base.files, packages: base.packages, overlayFingerprint: '', overlayPaths: [] };
  const byPath = new Map(base.files.map((f) => [f.path, f]));
  const manifests: Array<Partial<PackageInfo> & { kind: PackageInfo['kind']; root: string }> = [];
  for (const o of overlay) {
    if (o.content === null) { byPath.delete(o.path); continue; }
    if (exclusionFor({ path: o.path, size: Buffer.byteLength(o.content, 'utf8') })) { byPath.delete(o.path); continue; }
    const manifest = isManifest(o.path) ? parseManifest(o.path, o.content) : null;
    if (manifest) manifests.push(manifest);
    byPath.set(o.path, { path: o.path, blobSha: gitBlobSha(o.content), size: Buffer.byteLength(o.content, 'utf8'), analysis: manifest ? { ...EMPTY_ANALYSIS, language: languageOf(o.path) } : analyzeFile(o.path, o.content) });
  }
  const kindOf = (path: string): PackageInfo['kind'] | null => {
    const b = path.slice(path.lastIndexOf('/') + 1);
    return b === 'package.json' || b === 'tsconfig.json' ? 'node' : b === 'go.mod' ? 'go' : ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt'].includes(b) ? 'python' : null;
  };
  // a deleted manifest takes its package with it, unless another manifest of that kind remains at the same root
  const deletedRoots = overlay.filter((o) => o.content === null && isManifest(o.path)).map((o) => ({ root: dirOf(o.path), kind: kindOf(o.path) }));
  const packages = base.packages.filter((p) => !deletedRoots.some((d) => d.root === p.root && d.kind === p.kind)
    || [...byPath.keys()].some((k) => isManifest(k) && dirOf(k) === p.root && kindOf(k) === p.kind));
  return {
    base, files: [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : 1)), packages: mergePackages([...packages.map((p) => ({ ...p })), ...manifests]),
    overlayFingerprint: overlayFingerprintOf(overlay), overlayPaths: overlay.map((o) => o.path).sort(),
  };
}
