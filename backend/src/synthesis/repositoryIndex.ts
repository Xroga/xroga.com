/**
 * A derived index over a repository, and the rules that stop it lying.
 *
 * GitHub is canonical. This is an acceleration layer and nothing more, which sounds like a
 * caveat and is actually the entire design constraint. A cache over source control has one
 * catastrophic failure mode: answering a question about `main` with data from a commit
 * that is no longer `main`. The answer looks authoritative, cites real file paths, and
 * describes code that no longer exists — and a model handed that will confidently edit
 * files that moved three commits ago.
 *
 * So the index is keyed by `indexedCommitSha` and every read goes through a HEAD check.
 * `readIndex` cannot return data without being told the current HEAD, because an optional
 * freshness check is one someone eventually forgets to pass.
 *
 * When HEAD has moved the index does not guess. It reports `stale` along with the commit
 * it actually holds, and the caller either refreshes it or falls through to canonical
 * GitHub. §7's rule is that index failure must never become fabricated repository
 * knowledge, and the shape of this API is what enforces it: the stale path has no branch
 * that returns rows.
 *
 * Storage is behind `RepositoryIndexStore` so this module has no database dependency. M15
 * supplies the Supabase implementation; the in-memory one here is what the tests use and
 * what a deployment without persistence configured falls back to.
 */

import { createHash } from 'node:crypto';
import type { ProjectFile } from '../ai/patches.js';
import { detectComposition, componentForPath } from './runtime/registry.js';
import { dirOf } from './runtime/adapterContract.js';

export const REPOSITORY_INDEX_SCHEMA_VERSION = '1.0.0' as const;

/** Exactly which repository, branch and commit an index row describes. */
export interface RepositoryIdentity {
  readonly repositoryId: string;
  readonly repositoryOwner: string;
  readonly repositoryName: string;
  readonly projectId: string;
  readonly branch: string;
}

export interface IndexedFile {
  readonly filePath: string;
  readonly blobSha: string;
  readonly language: string | null;
  readonly size: number;
  readonly binary: boolean;
  /** Component root that owns this file, from the runtime adapters. */
  readonly componentRoot: string | null;
  readonly componentAdapterId: string | null;
  readonly workspaceRoot: string | null;
  readonly symbols: readonly string[];
  readonly imports: readonly string[];
  readonly exports: readonly string[];
  readonly summary: string | null;
  readonly embeddingRef: string | null;
  readonly updatedAt: string;
}

export interface RepositoryIndex {
  readonly schemaVersion: string;
  readonly identity: RepositoryIdentity;
  /** The commit these rows were built from. The whole correctness argument rests on it. */
  readonly indexedCommitSha: string;
  readonly treeSha: string | null;
  readonly files: readonly IndexedFile[];
  readonly updatedAt: string;
}

export interface RepositoryIndexStore {
  load(identity: RepositoryIdentity): Promise<RepositoryIndex | null>;
  save(index: RepositoryIndex): Promise<void>;
  delete(identity: RepositoryIdentity): Promise<void>;
}

/** Default store. Real persistence arrives in M15 and implements the same interface. */
export class InMemoryRepositoryIndexStore implements RepositoryIndexStore {
  private readonly rows = new Map<string, RepositoryIndex>();

  private key(identity: RepositoryIdentity): string {
    // Project id is part of the key, not just the repository. Two projects may point at
    // the same repository and must never read each other's rows.
    return `${identity.projectId}::${identity.repositoryId}::${identity.branch}`;
  }

  async load(identity: RepositoryIdentity): Promise<RepositoryIndex | null> {
    return this.rows.get(this.key(identity)) ?? null;
  }

  async save(index: RepositoryIndex): Promise<void> {
    this.rows.set(this.key(index.identity), index);
  }

  async delete(identity: RepositoryIdentity): Promise<void> {
    this.rows.delete(this.key(identity));
  }
}

/**
 * Git's blob SHA for a file's contents.
 *
 * The same value GitHub reports, computed the same way — `blob <bytes>\0` then SHA-1 — so
 * a row can be compared against a tree listing without fetching the file. Using a
 * different hash would make the index unable to answer "has this file changed" without a
 * download, which is most of the point.
 */
export function gitBlobSha(content: string): string {
  const bytes = Buffer.from(content, 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rs: 'rust', go: 'go', java: 'java', kt: 'kotlin', cs: 'csharp',
  fs: 'fsharp', rb: 'ruby', php: 'php', swift: 'swift', dart: 'dart', ex: 'elixir',
  exs: 'elixir', erl: 'erlang', zig: 'zig', scala: 'scala', jl: 'julia', lua: 'lua',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp', sol: 'solidity', tf: 'terraform',
  sh: 'shell', ps1: 'powershell', sql: 'sql', json: 'json', yaml: 'yaml', yml: 'yaml',
  toml: 'toml', md: 'markdown', html: 'html', css: 'css', scss: 'scss', vue: 'vue',
  svelte: 'svelte', nim: 'nim', hs: 'haskell',
};

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff', 'pdf', 'zip', 'gz', 'tar',
  'bz2', 'xz', '7z', 'rar', 'exe', 'dll', 'so', 'dylib', 'bin', 'wasm', 'class', 'jar',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'mp3', 'mp4', 'wav', 'avi', 'mov', 'webm', 'db',
  'sqlite', 'pyc', 'o', 'a', 'lib', 'node',
]);

function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

/**
 * Whether a file is binary.
 *
 * Extension first, then a NUL-byte scan, because extensions are wrong often enough to
 * matter and a NUL in the first few KB is decisive. Getting this right is not cosmetic:
 * §7 requires binary metadata *without* injecting binaries into model context, and a
 * misclassified PNG becomes several thousand tokens of mojibake in a prompt.
 */
export function isBinary(path: string, content: string): boolean {
  if (BINARY_EXTENSIONS.has(extensionOf(path))) return true;
  return content.slice(0, 8000).includes('\0');
}

/**
 * Symbols a file declares.
 *
 * Regex rather than a parser, deliberately: this has to work across every language the
 * adapters cover plus ones they do not, and a per-language AST parser for twenty
 * ecosystems is a project of its own. The cost is under-detection on unusual syntax, which
 * is the safe direction — a missing symbol makes retrieval slightly worse, while a wrong
 * one sends a model to the wrong file.
 */
export function extractSymbols(path: string, content: string): readonly string[] {
  if (isBinary(path, content)) return [];
  const symbols = new Set<string>();
  const patterns: readonly RegExp[] = [
    // TypeScript / JavaScript
    /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?\(/g,
    // Python
    /(?:^|\n)\s*def\s+([A-Za-z_]\w*)/g,
    /(?:^|\n)\s*class\s+([A-Za-z_]\w*)/g,
    // Rust
    /(?:^|\n)\s*(?:pub\s+)?fn\s+([A-Za-z_]\w*)/g,
    /(?:^|\n)\s*(?:pub\s+)?(?:struct|enum|trait|impl)\s+([A-Za-z_]\w*)/g,
    // Go
    /(?:^|\n)\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/g,
    /(?:^|\n)\s*type\s+([A-Za-z_]\w*)\s+(?:struct|interface)/g,
    // JVM / C# / PHP
    /(?:^|\n)\s*(?:public|private|protected|internal)?\s*(?:static\s+)?(?:final\s+)?(?:class|interface|record|enum)\s+([A-Za-z_]\w*)/g,
    // Solidity
    /(?:^|\n)\s*(?:contract|library|interface)\s+([A-Za-z_]\w*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1] && match[1].length > 1) symbols.add(match[1]);
    }
  }
  return [...symbols].sort().slice(0, 200);
}

/** Modules a file imports, normalised across the syntaxes that express it. */
export function extractImports(path: string, content: string): readonly string[] {
  if (isBinary(path, content)) return [];
  const imports = new Set<string>();
  const patterns: readonly RegExp[] = [
    /(?:^|\n)\s*import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g,
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /(?:^|\n)\s*from\s+([\w.]+)\s+import\s/g,
    /(?:^|\n)\s*import\s+([\w.]+)(?:\s|$)/g,
    /(?:^|\n)\s*use\s+([\w:]+)/g,
    /(?:^|\n)\s*#include\s+[<"]([^>"]+)[>"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) imports.add(match[1]);
    }
  }
  return [...imports].sort().slice(0, 200);
}

/** Symbols a file exports, where the language marks them explicitly. */
export function extractExports(path: string, content: string): readonly string[] {
  if (isBinary(path, content)) return [];
  const exports = new Set<string>();
  for (const match of content.matchAll(
    /(?:^|\n)\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
  )) {
    exports.add(match[1]);
  }
  for (const match of content.matchAll(/(?:^|\n)\s*pub\s+(?:fn|struct|enum|trait|mod)\s+([A-Za-z_]\w*)/g)) {
    exports.add(match[1]);
  }
  for (const match of content.matchAll(/__all__\s*=\s*\[([^\]]*)\]/g)) {
    for (const name of match[1].matchAll(/['"]([^'"]+)['"]/g)) exports.add(name[1]);
  }
  return [...exports].sort().slice(0, 200);
}

/**
 * Builds a full index at one exact commit.
 *
 * Component ownership comes from the runtime adapters rather than a second path-guessing
 * implementation here, so a file's owner is the same whichever layer is asked. Two answers
 * to that question would eventually disagree, and the disagreement would be invisible.
 */
export function buildIndex(input: {
  identity: RepositoryIdentity;
  commitSha: string;
  treeSha?: string | null;
  files: readonly ProjectFile[];
  now?: Date;
}): RepositoryIndex {
  const timestamp = (input.now ?? new Date()).toISOString();
  const composition = detectComposition(input.files);

  const indexed: IndexedFile[] = input.files.map((file) => {
    const binary = isBinary(file.path, file.content);
    const component = componentForPath(composition, file.path);
    const workspace = component?.inspection.workspaces.find(
      (root) => file.path === root || file.path.startsWith(`${root}/`),
    );

    return {
      filePath: file.path,
      blobSha: gitBlobSha(file.content),
      language: LANGUAGE_BY_EXTENSION[extensionOf(file.path)] ?? null,
      size: Buffer.byteLength(file.content, 'utf8'),
      binary,
      componentRoot: component?.root ?? null,
      componentAdapterId: component?.adapterId ?? null,
      workspaceRoot: workspace ?? null,
      // Binary files get metadata and nothing else. §7 is explicit that their contents must
      // not reach model context, and the cheapest way to guarantee that is to never extract
      // anything from them.
      symbols: binary ? [] : extractSymbols(file.path, file.content),
      imports: binary ? [] : extractImports(file.path, file.content),
      exports: binary ? [] : extractExports(file.path, file.content),
      summary: binary ? `binary file, ${Buffer.byteLength(file.content, 'utf8')} bytes` : null,
      embeddingRef: null,
      updatedAt: timestamp,
    };
  });

  return {
    schemaVersion: REPOSITORY_INDEX_SCHEMA_VERSION,
    identity: input.identity,
    indexedCommitSha: input.commitSha,
    treeSha: input.treeSha ?? null,
    files: indexed.sort((a, b) => a.filePath.localeCompare(b.filePath)),
    updatedAt: timestamp,
  };
}

export type IndexFreshness = 'fresh' | 'stale' | 'absent';

export interface IndexReadResult {
  readonly freshness: IndexFreshness;
  /** Present only when fresh. A stale index yields no rows, by construction. */
  readonly index: RepositoryIndex | null;
  readonly indexedCommitSha: string | null;
  readonly currentHeadSha: string;
  readonly reason: string;
}

/**
 * Reads the index, refusing to answer from a commit that is no longer HEAD.
 *
 * `currentHeadSha` is required rather than optional. An optional freshness check is one a
 * caller eventually forgets, and the failure it produces — confident answers about deleted
 * code — is silent. Making it a parameter means the compiler asks the question.
 *
 * A stale result carries `index: null`. There is deliberately no path here that hands back
 * rows the caller might use anyway "just this once".
 */
export async function readIndex(
  store: RepositoryIndexStore,
  identity: RepositoryIdentity,
  currentHeadSha: string,
): Promise<IndexReadResult> {
  const stored = await store.load(identity);
  if (!stored) {
    return {
      freshness: 'absent', index: null, indexedCommitSha: null, currentHeadSha,
      reason: 'no index exists for this repository and branch; read canonical GitHub content instead',
    };
  }
  if (stored.indexedCommitSha !== currentHeadSha) {
    return {
      freshness: 'stale', index: null, indexedCommitSha: stored.indexedCommitSha, currentHeadSha,
      reason:
        `the index was built at ${stored.indexedCommitSha} and HEAD is now ${currentHeadSha}; ` +
        'it cannot describe the current tree and was not returned',
    };
  }
  return {
    freshness: 'fresh', index: stored, indexedCommitSha: stored.indexedCommitSha, currentHeadSha,
    reason: `the index matches HEAD at ${currentHeadSha}`,
  };
}

export interface IndexUpdatePlan {
  readonly added: readonly string[];
  readonly modified: readonly string[];
  readonly deleted: readonly string[];
  readonly unchanged: readonly string[];
  readonly renamed: ReadonlyArray<{ from: string; to: string }>;
}

/**
 * What changed between an index and a new tree.
 *
 * Renames are detected by identical blob SHA at a different path — a content-addressed
 * identity, so it is exact rather than heuristic. It matters because a rename detected as
 * delete-plus-add discards symbols and imports that did not change, and re-extracting them
 * is the expensive part of indexing.
 */
export function planUpdate(
  index: RepositoryIndex,
  files: readonly ProjectFile[],
): IndexUpdatePlan {
  const currentByPath = new Map(index.files.map((file) => [file.filePath, file]));
  const nextByPath = new Map(files.map((file) => [file.path, gitBlobSha(file.content)]));

  const added: string[] = [];
  const modified: string[] = [];
  const unchanged: string[] = [];
  const deleted: string[] = [];

  for (const [path, sha] of nextByPath) {
    const existing = currentByPath.get(path);
    if (!existing) added.push(path);
    else if (existing.blobSha !== sha) modified.push(path);
    else unchanged.push(path);
  }
  for (const file of index.files) {
    if (!nextByPath.has(file.filePath)) deleted.push(file.filePath);
  }

  // A deleted path whose exact content reappears elsewhere is a rename, not a deletion.
  const renamed: Array<{ from: string; to: string }> = [];
  const addedBySha = new Map<string, string>();
  for (const path of added) {
    const sha = nextByPath.get(path)!;
    if (!addedBySha.has(sha)) addedBySha.set(sha, path);
  }
  for (const from of [...deleted]) {
    const sha = currentByPath.get(from)!.blobSha;
    const to = addedBySha.get(sha);
    if (!to) continue;
    renamed.push({ from, to });
    deleted.splice(deleted.indexOf(from), 1);
    added.splice(added.indexOf(to), 1);
    addedBySha.delete(sha);
  }

  return {
    added: added.sort(), modified: modified.sort(), deleted: deleted.sort(),
    unchanged: unchanged.sort(), renamed,
  };
}

/**
 * Applies an incremental update.
 *
 * Only added, modified and renamed files are re-extracted; unchanged rows are carried
 * across untouched. A rename keeps the extracted symbols and imports and changes only the
 * path, since the content is identical by definition.
 */
export function applyUpdate(input: {
  index: RepositoryIndex;
  files: readonly ProjectFile[];
  commitSha: string;
  treeSha?: string | null;
  now?: Date;
}): RepositoryIndex {
  const timestamp = (input.now ?? new Date()).toISOString();
  const plan = planUpdate(input.index, input.files);
  const byPath = new Map(input.index.files.map((file) => [file.filePath, file]));
  const nextFiles = new Map(input.files.map((file) => [file.path, file]));

  const rebuilt = buildIndex({
    identity: input.index.identity,
    commitSha: input.commitSha,
    treeSha: input.treeSha ?? input.index.treeSha,
    files: input.files.filter(
      (file) => plan.added.includes(file.path) || plan.modified.includes(file.path),
    ),
    now: input.now,
  });
  const rebuiltByPath = new Map(rebuilt.files.map((file) => [file.filePath, file]));

  const result: IndexedFile[] = [];
  for (const path of plan.unchanged) {
    const existing = byPath.get(path);
    if (existing) result.push(existing);
  }
  for (const { from, to } of plan.renamed) {
    const existing = byPath.get(from);
    if (!existing) continue;
    // Identical content, so nothing extracted needs recomputing — only the path moves.
    result.push({ ...existing, filePath: to, updatedAt: timestamp });
  }
  for (const path of [...plan.added, ...plan.modified]) {
    const row = rebuiltByPath.get(path);
    if (row) result.push(row);
    else if (nextFiles.has(path)) {
      const file = nextFiles.get(path)!;
      result.push({
        filePath: file.path, blobSha: gitBlobSha(file.content),
        language: LANGUAGE_BY_EXTENSION[extensionOf(file.path)] ?? null,
        size: Buffer.byteLength(file.content, 'utf8'), binary: isBinary(file.path, file.content),
        componentRoot: null, componentAdapterId: null, workspaceRoot: null,
        symbols: [], imports: [], exports: [], summary: null, embeddingRef: null,
        updatedAt: timestamp,
      });
    }
  }
  // Deleted paths are simply absent from `result`, which is what removal means here.

  return {
    schemaVersion: REPOSITORY_INDEX_SCHEMA_VERSION,
    identity: input.index.identity,
    indexedCommitSha: input.commitSha,
    treeSha: input.treeSha ?? input.index.treeSha,
    files: result.sort((a, b) => a.filePath.localeCompare(b.filePath)),
    updatedAt: timestamp,
  };
}

/**
 * Brings the index to `currentHeadSha`, or reports that it cannot.
 *
 * `fetchFiles` is supplied by the caller so this module never talks to GitHub directly. If
 * it throws — rate limit, network, revoked token — the result is `refreshed: false` with
 * the reason, and the caller reads canonical content directly. What must not happen is a
 * failed refresh leaving a stale index that a later read treats as current, so the stored
 * row is only replaced once the new one is fully built.
 */
export async function refreshIndex(input: {
  store: RepositoryIndexStore;
  identity: RepositoryIdentity;
  currentHeadSha: string;
  treeSha?: string | null;
  fetchFiles: () => Promise<readonly ProjectFile[]>;
  now?: Date;
}): Promise<{ refreshed: boolean; index: RepositoryIndex | null; reason: string }> {
  let files: readonly ProjectFile[];
  try {
    files = await input.fetchFiles();
  } catch (error) {
    return {
      refreshed: false, index: null,
      reason:
        `could not fetch canonical content to refresh the index: ${error instanceof Error ? error.message : String(error)}. ` +
        'The stale index was left in place and must not be read; use canonical GitHub content directly.',
    };
  }

  const existing = await input.store.load(input.identity);
  const next = existing
    ? applyUpdate({ index: existing, files, commitSha: input.currentHeadSha, treeSha: input.treeSha, now: input.now })
    : buildIndex({ identity: input.identity, commitSha: input.currentHeadSha, treeSha: input.treeSha, files, now: input.now });

  await input.store.save(next);
  return { refreshed: true, index: next, reason: `index rebuilt at ${input.currentHeadSha}` };
}

/** Files matching a language, component or symbol. Retrieval, not whole-tree injection. */
export function queryIndex(
  index: RepositoryIndex,
  query: { language?: string; componentRoot?: string; symbol?: string; importsModule?: string; pathPrefix?: string },
): readonly IndexedFile[] {
  return index.files.filter((file) => {
    if (query.language && file.language !== query.language) return false;
    if (query.componentRoot !== undefined && file.componentRoot !== query.componentRoot) return false;
    if (query.symbol && !file.symbols.includes(query.symbol)) return false;
    if (query.importsModule && !file.imports.includes(query.importsModule)) return false;
    if (query.pathPrefix && !file.filePath.startsWith(query.pathPrefix)) return false;
    return true;
  });
}
