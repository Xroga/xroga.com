/**
 * The repository tool suite.
 *
 * Before this, model context came from hydrating a repository into memory and then
 * ranking what had been hydrated. That has two consequences the command calls out
 * directly: the whole tree must be fetched before anything can be read, and a file that
 * the hydration step did not happen to carry is invisible no matter how relevant it is.
 * A file at a deep, unusual path is exactly the case that fails.
 *
 * These tools invert that. Nothing is fetched until a tool asks for it, every read is
 * pinned to one exact commit, and every call is recorded as evidence. The suite is scoped
 * to a single authorised repository at construction; a tool call naming any other
 * repository is refused rather than served, which is what keeps one tenant's agent from
 * reading another tenant's code.
 *
 * Writes here are *proposals*. Nothing in this file mutates a remote branch — staged
 * mutations are handed to the transactional workspace, which is the only thing that
 * applies them. That separation is deliberate: a tool that both decides and commits has
 * no point at which a proposal can be inspected before it becomes real.
 */

import { createHash } from 'node:crypto';
import { redactModelContext } from './contextPreparation.js';
import type { RawTreeEntry, RawTreeResponse, TreeApi } from '../services/integrations/githubTreeSnapshot.js';

/** Hard ceilings. A tool that can return unbounded output is a way to blow the context window. */
export const LIMITS = {
  /** Largest single blob a read tool will return, before redaction. */
  maxFileBytes: 256 * 1024,
  /** Largest slice `read_file_range` will hand back. */
  maxRangeLines: 800,
  /** Most entries `list_tree` will list in one call. */
  maxTreeEntries: 2_000,
  /** Most matches any search tool will return. */
  maxMatches: 100,
  /** Most characters any single tool result may contain. */
  maxResultChars: 60_000,
  /** Most blobs one session will fetch, so a runaway loop cannot drain the API quota. */
  maxBlobFetches: 400,
} as const;

export type RepositoryToolName =
  | 'list_tree'
  | 'search_code'
  | 'search_symbol'
  | 'read_file'
  | 'read_file_range'
  | 'read_imports'
  | 'read_git_diff'
  | 'read_test_failure'
  | 'inspect_blob_sha'
  | 'write_file'
  | 'apply_patch'
  | 'propose_delete'
  | 'inspect_resulting_diff';

export const REPOSITORY_TOOL_NAMES: readonly RepositoryToolName[] = [
  'list_tree',
  'search_code',
  'search_symbol',
  'read_file',
  'read_file_range',
  'read_imports',
  'read_git_diff',
  'read_test_failure',
  'inspect_blob_sha',
  'write_file',
  'apply_patch',
  'propose_delete',
  'inspect_resulting_diff',
];

export type ToolRefusal =
  | 'unauthorized_repository'
  | 'invalid_path'
  | 'git_internal_path'
  | 'symlink_path'
  | 'submodule_path'
  | 'not_found'
  | 'too_large'
  | 'binary_content'
  | 'stale_base'
  | 'missing_expected_sha'
  | 'budget_exhausted'
  | 'tree_truncated'
  | 'unsupported';

export class RepositoryToolError extends Error {
  readonly code = 'REPOSITORY_TOOL_REFUSED';
  readonly refusal: ToolRefusal;
  readonly tool: RepositoryToolName;

  constructor(tool: RepositoryToolName, refusal: ToolRefusal, message: string) {
    super(message);
    this.name = 'RepositoryToolError';
    this.tool = tool;
    this.refusal = refusal;
  }
}

/** The repository and commit every tool in a session is pinned to. */
export interface RepositoryScope {
  owner: string;
  repo: string;
  /** The exact commit all reads resolve against. Never a branch name. */
  commitSha: string;
  /** The ref the commit came from, recorded for evidence only. Reads never use it. */
  ref?: string;
}

export interface BlobPayload {
  content: string;
  encoding: 'utf-8' | 'base64';
  size: number;
}

/**
 * Transport surface. Extends the tree reader already proven in the atomic-write work
 * rather than introducing a second way to talk to GitHub.
 */
export interface RepositoryToolTransport extends TreeApi {
  getBlob(sha: string): Promise<BlobPayload | null>;
  /** Used only to detect that the branch moved under us. Optional; absence disables that check. */
  getRefCommitSha?(ref: string): Promise<string | null>;
  /** Unified diff between two commits. Optional; `read_git_diff` refuses when absent. */
  compareCommits?(baseSha: string, headSha: string): Promise<string | null>;
}

/** One recorded tool call. This is the evidence a result is later justified with. */
export interface ToolEvidence {
  tool: RepositoryToolName;
  /** Short, non-secret description of what was asked for. */
  target: string;
  commitSha: string;
  ok: boolean;
  refusal?: ToolRefusal;
  /** Characters returned to the model after redaction and truncation. */
  bytesReturned: number;
  /** Secrets removed from this result before it was returned. */
  redactions: number;
  truncated: boolean;
}

export interface StagedMutation {
  path: string;
  operation: 'create' | 'update' | 'delete';
  /** The blob SHA this mutation was computed against. `null` when creating. */
  baseBlobSha: string | null;
  /** Absent for deletes. */
  content?: string;
  /** SHA-256 of `content`, so the workspace can prove it applied what was proposed. */
  contentHash?: string;
}

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

/**
 * A repository-relative path that is safe to read or write.
 *
 * `.git` is rejected outright. Writing into it is not a file edit — it is a way to
 * rewrite history, move refs or install a hook that executes on the next operation, so it
 * is refused before any transport sees it. Traversal and absolute paths are rejected for
 * the ordinary reason: they address things outside the repository.
 */
export function validateRepositoryPath(
  tool: RepositoryToolName,
  rawPath: unknown,
): string {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new RepositoryToolError(tool, 'invalid_path', 'A repository path is required.');
  }
  // Normalise Windows separators first so `.git\config` cannot slip past a `/`-only check.
  const path = rawPath.trim().replace(/\\/g, '/');

  if (path.includes('\0')) {
    throw new RepositoryToolError(tool, 'invalid_path', 'Path contains a NUL byte.');
  }
  if (path.startsWith('/') || /^[a-zA-Z]:\//.test(path)) {
    throw new RepositoryToolError(tool, 'invalid_path', `Path must be repository-relative: ${path}`);
  }
  const segments = path.split('/');
  if (segments.some((segment) => segment === '..')) {
    throw new RepositoryToolError(tool, 'invalid_path', `Path escapes the repository: ${path}`);
  }
  if (segments.some((segment) => segment === '.git')) {
    throw new RepositoryToolError(
      tool,
      'git_internal_path',
      `Refusing to touch git internals: ${path}`,
    );
  }
  if (segments.some((segment) => segment === '')) {
    throw new RepositoryToolError(tool, 'invalid_path', `Path has an empty segment: ${path}`);
  }
  return path;
}

function looksBinary(content: string): boolean {
  // A NUL byte in the first few KB is the usual signal, and it is enough here: the cost of
  // a false negative is a garbled read, not a safety failure.
  return content.slice(0, 4096).includes('\0');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

export interface ToolResult<T> {
  ok: true;
  data: T;
  evidence: ToolEvidence;
}

/**
 * A tool session bound to one repository at one commit.
 *
 * Construct one per agent run. The scope cannot be changed afterwards, which is what makes
 * "this agent can only see this repository" a property of the object rather than a rule
 * every call site has to remember.
 */
export class RepositoryToolSession {
  private readonly transport: RepositoryToolTransport;
  private readonly scope: RepositoryScope;
  private readonly evidenceLog: ToolEvidence[] = [];
  private readonly staged = new Map<string, StagedMutation>();
  private readonly blobCache = new Map<string, string>();
  private treeCache: Map<string, RawTreeEntry> | null = null;
  private blobFetches = 0;

  constructor(transport: RepositoryToolTransport, scope: RepositoryScope) {
    if (!scope.owner || !scope.repo) throw new Error('A repository scope requires an owner and repo.');
    if (!scope.commitSha) throw new Error('A repository scope requires an exact commit SHA.');
    this.transport = transport;
    this.scope = { ...scope };
  }

  get commitSha(): string {
    return this.scope.commitSha;
  }

  /** Every tool call made in this session, in order. */
  get evidence(): readonly ToolEvidence[] {
    return this.evidenceLog;
  }

  /** Mutations proposed so far. The workspace applies these; this session never does. */
  get stagedMutations(): readonly StagedMutation[] {
    return [...this.staged.values()];
  }

  /**
   * Refuses any call that names a repository other than the authorised one.
   *
   * Callers normally omit owner/repo and inherit the scope. Passing them is only useful for
   * a caller that believes it is addressing a specific repository — which is exactly the
   * case worth checking.
   */
  assertScope(tool: RepositoryToolName, owner?: string, repo?: string): void {
    if (owner !== undefined && owner !== this.scope.owner) {
      throw new RepositoryToolError(
        tool,
        'unauthorized_repository',
        `This session is scoped to ${this.scope.owner}/${this.scope.repo}.`,
      );
    }
    if (repo !== undefined && repo !== this.scope.repo) {
      throw new RepositoryToolError(
        tool,
        'unauthorized_repository',
        `This session is scoped to ${this.scope.owner}/${this.scope.repo}.`,
      );
    }
  }

  private record(entry: ToolEvidence): ToolEvidence {
    this.evidenceLog.push(entry);
    return entry;
  }

  private refuse(tool: RepositoryToolName, target: string, error: RepositoryToolError): never {
    this.record({
      tool,
      target,
      commitSha: this.scope.commitSha,
      ok: false,
      refusal: error.refusal,
      bytesReturned: 0,
      redactions: 0,
      truncated: false,
    });
    throw error;
  }

  /** Redacts, bounds and records one successful result. */
  private deliver<T>(
    tool: RepositoryToolName,
    target: string,
    text: string,
    build: (redacted: string, truncated: boolean) => T,
    /**
     * Redactions already performed by the caller. A tool that builds structured data must
     * redact its input *before* building, because only the rendered string passes through
     * here — anything the tool put in `data` would otherwise escape unredacted.
     */
    priorRedactions = 0,
  ): ToolResult<T> {
    const { value, count } = redactModelContext(text);
    const truncated = value.length > LIMITS.maxResultChars;
    const bounded = truncated ? `${value.slice(0, LIMITS.maxResultChars)}\n… truncated` : value;
    const evidence = this.record({
      tool,
      target,
      commitSha: this.scope.commitSha,
      ok: true,
      bytesReturned: bounded.length,
      redactions: count + priorRedactions,
      truncated,
    });
    return { ok: true, data: build(bounded, truncated), evidence };
  }

  /** The commit's tree, fetched once per session. */
  private async tree(tool: RepositoryToolName): Promise<Map<string, RawTreeEntry>> {
    if (this.treeCache) return this.treeCache;

    const treeSha = await this.transport.getCommitTreeSha(this.scope.commitSha);
    if (!treeSha) {
      throw new RepositoryToolError(tool, 'not_found', `Commit ${this.scope.commitSha} is unreadable.`);
    }
    const raw: RawTreeResponse | null = await this.transport.getTree(treeSha);
    if (!raw || !Array.isArray(raw.tree)) {
      throw new RepositoryToolError(tool, 'not_found', 'The repository tree is unreadable.');
    }
    if (raw.truncated) {
      // A truncated tree is a partial snapshot. Treating it as canonical is how an agent
      // concludes a file does not exist when it does, then recreates it somewhere else.
      throw new RepositoryToolError(
        tool,
        'tree_truncated',
        'GitHub truncated the tree listing; this snapshot is incomplete and cannot be treated as canonical.',
      );
    }

    const map = new Map<string, RawTreeEntry>();
    for (const entry of raw.tree) {
      if (typeof entry.path === 'string' && entry.path) map.set(entry.path, entry);
    }
    this.treeCache = map;
    return map;
  }

  private async entryFor(tool: RepositoryToolName, path: string): Promise<RawTreeEntry> {
    const tree = await this.tree(tool);
    const entry = tree.get(path);
    if (!entry) throw new RepositoryToolError(tool, 'not_found', `${path} does not exist at this commit.`);
    if (entry.mode === '120000') {
      // A symlink's blob is its target path. Following it would let a proposal address a
      // file the path check already decided was out of bounds.
      throw new RepositoryToolError(tool, 'symlink_path', `${path} is a symlink and is not followed.`);
    }
    if (entry.type === 'commit') {
      throw new RepositoryToolError(tool, 'submodule_path', `${path} is a submodule, not a file.`);
    }
    if (entry.type !== 'blob') {
      throw new RepositoryToolError(tool, 'not_found', `${path} is not a file.`);
    }
    return entry;
  }

  /** Blob text, fetched on demand and cached for the session. */
  private async blob(tool: RepositoryToolName, entry: RawTreeEntry, path: string): Promise<string> {
    const sha = entry.sha!;
    const cached = this.blobCache.get(sha);
    if (cached !== undefined) return cached;

    if (this.blobFetches >= LIMITS.maxBlobFetches) {
      throw new RepositoryToolError(
        tool,
        'budget_exhausted',
        `This session has already fetched ${LIMITS.maxBlobFetches} files.`,
      );
    }
    this.blobFetches += 1;

    const payload = await this.transport.getBlob(sha);
    if (!payload) throw new RepositoryToolError(tool, 'not_found', `Blob for ${path} is unreadable.`);
    if (payload.size > LIMITS.maxFileBytes) {
      throw new RepositoryToolError(
        tool,
        'too_large',
        `${path} is ${payload.size} bytes, over the ${LIMITS.maxFileBytes}-byte read limit.`,
      );
    }

    const text =
      payload.encoding === 'base64'
        ? Buffer.from(payload.content, 'base64').toString('utf8')
        : payload.content;
    if (looksBinary(text)) {
      throw new RepositoryToolError(tool, 'binary_content', `${path} is binary and is not read as text.`);
    }
    this.blobCache.set(sha, text);
    return text;
  }

  // -------------------------------------------------------------------------
  // Read tools
  // -------------------------------------------------------------------------

  /** Lists paths at this commit. `prefix` narrows; it does not whitelist. */
  async listTree(options: { prefix?: string; owner?: string; repo?: string } = {}): Promise<
    ToolResult<{ paths: string[]; total: number; truncated: boolean }>
  > {
    const tool: RepositoryToolName = 'list_tree';
    this.assertScope(tool, options.owner, options.repo);
    const prefix = options.prefix ? validateRepositoryPath(tool, options.prefix) : '';
    try {
      const tree = await this.tree(tool);
      const all = [...tree.values()]
        .filter((entry) => entry.type === 'blob' && typeof entry.path === 'string')
        .map((entry) => entry.path!)
        .filter((path) => (prefix ? path === prefix || path.startsWith(`${prefix}/`) : true))
        .sort();
      const paths = all.slice(0, LIMITS.maxTreeEntries);
      return this.deliver(tool, prefix || '(root)', paths.join('\n'), (_text, truncated) => ({
        paths,
        total: all.length,
        truncated: truncated || all.length > paths.length,
      }));
    } catch (error) {
      this.refuse(tool, prefix || '(root)', asToolError(tool, error));
    }
  }

  /**
   * Searches file contents at this commit.
   *
   * Candidate files are narrowed by path/extension before any blob is fetched, so a search
   * costs a bounded number of reads rather than the whole repository.
   */
  async searchCode(options: {
    query: string;
    /** Restrict to paths containing this substring. */
    pathContains?: string;
    extensions?: string[];
    regex?: boolean;
    maxFiles?: number;
    owner?: string;
    repo?: string;
  }): Promise<ToolResult<{ matches: { path: string; line: number; text: string }[]; filesSearched: number }>> {
    const tool: RepositoryToolName = 'search_code';
    this.assertScope(tool, options.owner, options.repo);
    const target = `"${options.query}"`;
    try {
      if (!options.query) {
        throw new RepositoryToolError(tool, 'invalid_path', 'A search query is required.');
      }
      const matcher = options.regex
        ? new RegExp(options.query)
        : { test: (line: string) => line.includes(options.query) };

      const tree = await this.tree(tool);
      const candidates = [...tree.values()]
        .filter((entry) => entry.type === 'blob' && entry.mode !== '120000' && typeof entry.path === 'string')
        .map((entry) => entry.path!)
        .filter((path) => (options.pathContains ? path.includes(options.pathContains) : true))
        .filter((path) =>
          options.extensions?.length
            ? options.extensions.some((extension) => path.endsWith(extension))
            : true,
        )
        .sort()
        .slice(0, options.maxFiles ?? 300);

      const matches: { path: string; line: number; text: string }[] = [];
      let filesSearched = 0;
      for (const path of candidates) {
        if (matches.length >= LIMITS.maxMatches) break;
        let text: string;
        try {
          text = await this.blob(tool, tree.get(path)!, path);
        } catch {
          // A binary or oversized file is not a search failure; skip it and keep going.
          continue;
        }
        filesSearched += 1;
        const lines = text.split('\n');
        for (let i = 0; i < lines.length && matches.length < LIMITS.maxMatches; i += 1) {
          if (matcher.test(lines[i])) {
            matches.push({ path, line: i + 1, text: lines[i].slice(0, 400) });
          }
        }
      }
      const rendered = matches.map((m) => `${m.path}:${m.line}: ${m.text}`).join('\n');
      return this.deliver(tool, target, rendered, () => ({ matches, filesSearched }));
    } catch (error) {
      this.refuse(tool, target, asToolError(tool, error));
    }
  }

  /** Finds where a symbol is declared, rather than every line that mentions it. */
  async searchSymbol(options: {
    symbol: string;
    owner?: string;
    repo?: string;
  }): Promise<ToolResult<{ declarations: { path: string; line: number; text: string }[] }>> {
    const tool: RepositoryToolName = 'search_symbol';
    this.assertScope(tool, options.owner, options.repo);
    const symbol = options.symbol;
    if (!symbol || !/^[A-Za-z_$][\w$]*$/.test(symbol)) {
      this.refuse(
        tool,
        String(symbol),
        new RepositoryToolError(tool, 'invalid_path', 'A symbol name is required.'),
      );
    }
    const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Declaration forms across the languages this repository actually generates.
    const pattern = new RegExp(
      `(?:\\b(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?(?:function|class|const|let|var|interface|type|enum|struct|def|fn)\\s+${escaped}\\b)` +
        `|(?:\\b${escaped}\\s*[:=]\\s*(?:async\\s*)?(?:function\\b|\\())`,
    );
    const result = await this.searchCode({ query: pattern.source, regex: true });
    return {
      ok: true,
      data: { declarations: result.data.matches },
      evidence: result.evidence,
    };
  }

  /** Reads one file at this commit. */
  async readFile(options: { path: string; owner?: string; repo?: string }): Promise<
    ToolResult<{ path: string; content: string; blobSha: string; truncated: boolean }>
  > {
    const tool: RepositoryToolName = 'read_file';
    this.assertScope(tool, options.owner, options.repo);
    let path = '';
    try {
      path = validateRepositoryPath(tool, options.path);
      const entry = await this.entryFor(tool, path);
      const text = await this.blob(tool, entry, path);
      return this.deliver(tool, path, text, (content, truncated) => ({
        path,
        content,
        blobSha: entry.sha!,
        truncated,
      }));
    } catch (error) {
      this.refuse(tool, path || String(options.path), asToolError(tool, error));
    }
  }

  /** Reads a line range, so a large file costs a slice rather than the whole thing. */
  async readFileRange(options: {
    path: string;
    startLine: number;
    endLine: number;
    owner?: string;
    repo?: string;
  }): Promise<ToolResult<{ path: string; startLine: number; endLine: number; content: string; blobSha: string }>> {
    const tool: RepositoryToolName = 'read_file_range';
    this.assertScope(tool, options.owner, options.repo);
    let path = '';
    try {
      path = validateRepositoryPath(tool, options.path);
      const start = Math.max(1, Math.floor(options.startLine));
      const end = Math.max(start, Math.floor(options.endLine));
      if (end - start + 1 > LIMITS.maxRangeLines) {
        throw new RepositoryToolError(
          tool,
          'too_large',
          `Requested ${end - start + 1} lines; the limit is ${LIMITS.maxRangeLines}.`,
        );
      }
      const entry = await this.entryFor(tool, path);
      const lines = (await this.blob(tool, entry, path)).split('\n');
      const slice = lines.slice(start - 1, end).join('\n');
      return this.deliver(tool, `${path}:${start}-${end}`, slice, (content) => ({
        path,
        startLine: start,
        endLine: Math.min(end, lines.length),
        content,
        blobSha: entry.sha!,
      }));
    } catch (error) {
      this.refuse(tool, path || String(options.path), asToolError(tool, error));
    }
  }

  /** Extracts a file's imports, so dependencies can be followed without reading everything. */
  async readImports(options: { path: string; owner?: string; repo?: string }): Promise<
    ToolResult<{ path: string; imports: string[] }>
  > {
    const tool: RepositoryToolName = 'read_imports';
    this.assertScope(tool, options.owner, options.repo);
    let path = '';
    try {
      path = validateRepositoryPath(tool, options.path);
      const entry = await this.entryFor(tool, path);
      const text = await this.blob(tool, entry, path);
      const imports = new Set<string>();
      for (const pattern of [
        /import\s[\s\S]*?from\s+['"]([^'"]+)['"]/g,
        /import\s+['"]([^'"]+)['"]/g,
        /require\(\s*['"]([^'"]+)['"]\s*\)/g,
        /^\s*from\s+([\w.]+)\s+import\s/gm,
      ]) {
        for (const match of text.matchAll(pattern)) imports.add(match[1]);
      }
      const list = [...imports].sort();
      return this.deliver(tool, path, list.join('\n'), () => ({ path, imports: list }));
    } catch (error) {
      this.refuse(tool, path || String(options.path), asToolError(tool, error));
    }
  }

  /** The diff between another commit and this session's commit. */
  async readGitDiff(options: { baseSha: string; owner?: string; repo?: string }): Promise<
    ToolResult<{ baseSha: string; headSha: string; diff: string }>
  > {
    const tool: RepositoryToolName = 'read_git_diff';
    this.assertScope(tool, options.owner, options.repo);
    const target = `${options.baseSha}..${this.scope.commitSha}`;
    try {
      if (!this.transport.compareCommits) {
        throw new RepositoryToolError(tool, 'unsupported', 'This transport cannot compare commits.');
      }
      const diff = await this.transport.compareCommits(options.baseSha, this.scope.commitSha);
      if (diff === null) throw new RepositoryToolError(tool, 'not_found', `Cannot compare ${target}.`);
      return this.deliver(tool, target, diff, (text) => ({
        baseSha: options.baseSha,
        headSha: this.scope.commitSha,
        diff: text,
      }));
    } catch (error) {
      this.refuse(tool, target, asToolError(tool, error));
    }
  }

  /**
   * Reduces a test log to the parts worth reading.
   *
   * Test output is mostly noise — passing lines and stack frames from the runner. Handing
   * all of it to a model wastes the budget that should go to the failing assertion.
   */
  async readTestFailure(options: { log: string; maxFailures?: number }): Promise<
    ToolResult<{ failures: { header: string; detail: string }[]; total: number }>
  > {
    const tool: RepositoryToolName = 'read_test_failure';
    const lines = options.log.replace(/\r\n/g, '\n').split('\n');
    const failures: { header: string; detail: string }[] = [];
    const limit = options.maxFailures ?? 10;
    // A runner announces a failure once and then explains it. `✖ name` is the announcement;
    // the `AssertionError:` beneath it is part of that same failure's explanation, not a
    // second failure. Counting both reports twice as many failures as actually occurred.
    const announcement = /(^|\s)(?:✖|✗|×|FAIL\b|not ok\b)/;
    const explanation = /\b(?:AssertionError|[A-Za-z]*Error:)/;
    let detailEndsAt = -1;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/^\s*at\s/.test(line)) continue;
      const isAnnouncement = announcement.test(line);
      // An explanation only starts a failure of its own when no announcement owns it.
      if (!isAnnouncement && !(explanation.test(line) && i > detailEndsAt)) continue;

      const window = lines.slice(i + 1, i + 12);
      // A following announcement belongs to the next failure, so this one's detail ends there.
      const nextAnnouncement = window.findIndex((next) => announcement.test(next));
      detailEndsAt = nextAnnouncement === -1 ? i + 11 : i + nextAnnouncement;
      const detail = (nextAnnouncement === -1 ? window : window.slice(0, nextAnnouncement))
        // Runner frames say where the harness is, not where the product broke.
        .filter((next) => !/^\s*at\s+(?:node:internal|Test\.|async\s)/.test(next))
        .join('\n')
        .trimEnd();
      failures.push({ header: line.trim(), detail });
      if (failures.length >= limit) break;
    }

    const rendered = failures.map((f) => `${f.header}\n${f.detail}`).join('\n\n');
    const { value: redacted, count } = redactModelContext(rendered);
    return this.deliver(tool, `${failures.length} failure(s)`, redacted, () => ({
      failures: failures.map((f) => ({
        header: redactModelContext(f.header).value,
        detail: redactModelContext(f.detail).value,
      })),
      total: failures.length,
    }), count);
  }

  /** The blob SHA of a path at this commit. This is the value a safe write is based on. */
  async inspectBlobSha(options: { path: string; owner?: string; repo?: string }): Promise<
    ToolResult<{ path: string; blobSha: string | null; exists: boolean }>
  > {
    const tool: RepositoryToolName = 'inspect_blob_sha';
    this.assertScope(tool, options.owner, options.repo);
    let path = '';
    try {
      path = validateRepositoryPath(tool, options.path);
      const tree = await this.tree(tool);
      const entry = tree.get(path);
      const blobSha = entry?.type === 'blob' ? entry.sha ?? null : null;
      return this.deliver(tool, path, blobSha ?? '(absent)', () => ({
        path,
        blobSha,
        exists: Boolean(blobSha),
      }));
    } catch (error) {
      this.refuse(tool, path || String(options.path), asToolError(tool, error));
    }
  }

  // -------------------------------------------------------------------------
  // Proposal tools
  // -------------------------------------------------------------------------

  /**
   * Stages a whole-file write.
   *
   * `expectedBlobSha` is required for an update and must match the blob at this commit. A
   * write computed against content that has since changed is refused rather than applied,
   * because the change it was reasoning about is no longer the change it would make.
   */
  async writeFile(options: {
    path: string;
    content: string;
    expectedBlobSha?: string | null;
    owner?: string;
    repo?: string;
  }): Promise<ToolResult<StagedMutation>> {
    const tool: RepositoryToolName = 'write_file';
    this.assertScope(tool, options.owner, options.repo);
    let path = '';
    try {
      path = validateRepositoryPath(tool, options.path);
      if (typeof options.content !== 'string') {
        throw new RepositoryToolError(tool, 'invalid_path', 'Content must be a string.');
      }
      const tree = await this.tree(tool);
      const entry = tree.get(path);

      if (entry?.mode === '120000') {
        throw new RepositoryToolError(tool, 'symlink_path', `${path} is a symlink; refusing to write through it.`);
      }
      if (entry && entry.type !== 'blob') {
        throw new RepositoryToolError(tool, 'invalid_path', `${path} is not a file.`);
      }

      const currentSha = entry?.sha ?? null;
      if (currentSha) {
        if (options.expectedBlobSha === undefined) {
          throw new RepositoryToolError(
            tool,
            'missing_expected_sha',
            `${path} already exists; an update must state the blob SHA it was computed against.`,
          );
        }
        if (options.expectedBlobSha !== currentSha) {
          throw new RepositoryToolError(
            tool,
            'stale_base',
            `${path} is at ${currentSha}, but this write was computed against ${options.expectedBlobSha ?? 'nothing'}.`,
          );
        }
      } else if (options.expectedBlobSha) {
        throw new RepositoryToolError(
          tool,
          'stale_base',
          `${path} does not exist at this commit, but the write expected blob ${options.expectedBlobSha}.`,
        );
      }

      const mutation: StagedMutation = {
        path,
        operation: currentSha ? 'update' : 'create',
        baseBlobSha: currentSha,
        content: options.content,
        contentHash: sha256(options.content),
      };
      this.staged.set(path, mutation);
      return this.deliver(tool, path, `${mutation.operation} ${path}`, () => mutation);
    } catch (error) {
      this.refuse(tool, path || String(options.path), asToolError(tool, error));
    }
  }

  /**
   * Stages a search/replace edit against the file as it exists at this commit.
   *
   * The search must match exactly once. Zero matches means the edit was written against
   * something else; several means the tool cannot tell which one was meant. Both are
   * refused — guessing here is how the wrong region of a file gets rewritten.
   */
  async applyPatch(options: {
    path: string;
    search: string;
    replace: string;
    owner?: string;
    repo?: string;
  }): Promise<ToolResult<StagedMutation>> {
    const tool: RepositoryToolName = 'apply_patch';
    this.assertScope(tool, options.owner, options.repo);
    let path = '';
    try {
      path = validateRepositoryPath(tool, options.path);
      if (!options.search) {
        // An empty search matches at position zero and would replace nothing while
        // reporting success, or with a naive implementation replace everything.
        throw new RepositoryToolError(
          tool,
          'invalid_path',
          `An empty search pattern cannot be applied to ${path}.`,
        );
      }
      const entry = await this.entryFor(tool, path);
      const current = this.staged.get(path)?.content ?? (await this.blob(tool, entry, path));

      const first = current.indexOf(options.search);
      if (first === -1) {
        throw new RepositoryToolError(
          tool,
          'stale_base',
          `The search pattern does not appear in ${path} at this commit.`,
        );
      }
      if (current.indexOf(options.search, first + 1) !== -1) {
        throw new RepositoryToolError(
          tool,
          'stale_base',
          `The search pattern appears more than once in ${path}; it is ambiguous.`,
        );
      }

      const next = `${current.slice(0, first)}${options.replace}${current.slice(first + options.search.length)}`;
      const mutation: StagedMutation = {
        path,
        operation: 'update',
        baseBlobSha: entry.sha!,
        content: next,
        contentHash: sha256(next),
      };
      this.staged.set(path, mutation);
      return this.deliver(tool, path, `patch ${path}`, () => mutation);
    } catch (error) {
      this.refuse(tool, path || String(options.path), asToolError(tool, error));
    }
  }

  /** Stages a delete. The file must exist at this commit, so a typo cannot become a delete. */
  async proposeDelete(options: { path: string; owner?: string; repo?: string }): Promise<
    ToolResult<StagedMutation>
  > {
    const tool: RepositoryToolName = 'propose_delete';
    this.assertScope(tool, options.owner, options.repo);
    let path = '';
    try {
      path = validateRepositoryPath(tool, options.path);
      const entry = await this.entryFor(tool, path);
      const mutation: StagedMutation = { path, operation: 'delete', baseBlobSha: entry.sha! };
      this.staged.set(path, mutation);
      return this.deliver(tool, path, `delete ${path}`, () => mutation);
    } catch (error) {
      this.refuse(tool, path || String(options.path), asToolError(tool, error));
    }
  }

  /**
   * Summarises everything staged so far, before any of it is applied.
   *
   * This is the point at which a proposal can be judged as a whole — in particular whether
   * it deletes far more than it was asked to.
   */
  async inspectResultingDiff(): Promise<
    ToolResult<{
      creates: string[];
      updates: string[];
      deletes: string[];
      totalFilesAtCommit: number;
      deletionRatio: number;
    }>
  > {
    const tool: RepositoryToolName = 'inspect_resulting_diff';
    try {
      const tree = await this.tree(tool);
      const totalFilesAtCommit = [...tree.values()].filter((entry) => entry.type === 'blob').length;
      const staged = [...this.staged.values()];
      const creates = staged.filter((m) => m.operation === 'create').map((m) => m.path).sort();
      const updates = staged.filter((m) => m.operation === 'update').map((m) => m.path).sort();
      const deletes = staged.filter((m) => m.operation === 'delete').map((m) => m.path).sort();
      const deletionRatio = totalFilesAtCommit ? deletes.length / totalFilesAtCommit : 0;

      const rendered = [
        ...creates.map((p) => `+ ${p}`),
        ...updates.map((p) => `~ ${p}`),
        ...deletes.map((p) => `- ${p}`),
      ].join('\n');
      return this.deliver(tool, `${staged.length} change(s)`, rendered, () => ({
        creates,
        updates,
        deletes,
        totalFilesAtCommit,
        deletionRatio,
      }));
    } catch (error) {
      this.refuse(tool, 'staged changes', asToolError(tool, error));
    }
  }
}

function asToolError(tool: RepositoryToolName, error: unknown): RepositoryToolError {
  if (error instanceof RepositoryToolError) return error;
  return new RepositoryToolError(tool, 'not_found', (error as Error)?.message ?? 'Unknown tool failure.');
}
