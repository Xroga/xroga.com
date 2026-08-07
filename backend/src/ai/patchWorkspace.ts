/**
 * A transactional patch workspace pinned to one source commit.
 *
 * What was here before: patches applied straight to an in-memory `ProjectFile[]`. Three
 * consequences, all of them reachable from a normal model response.
 *
 * 1. A partial application left the array half-patched. Nothing rolled back, so a run
 *    that failed on its fourth patch had already committed the first three, and the
 *    branch was written from that state.
 * 2. `PatchIntent.expectedSourceHash` was a content SHA-256 with no producer anywhere in
 *    the repository. Stale-source detection was implemented and unit tested, and never
 *    once fired in production, because no caller ever supplied the hash it needed. The
 *    base identity now comes from the git tree — the blob SHA — so it is always available
 *    and always comparable to what GitHub will report at write time.
 * 3. Paths were checked for traversal and absolute form but not for `.git`, and symlinks
 *    were not considered at all. A file named `.git/config` was an ordinary path.
 *
 * The workspace is a real directory so that a patch which resolves outside its root fails
 * against the filesystem as well as against the string check — a defence that does not
 * depend on the path parser being complete. Nothing is written to the caller's file set
 * until every staged patch has applied and the resulting diff has been inspected.
 */

import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile, lstat, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import {
  checkPatchResult,
  checkPatchSafety,
  normalizeEol,
  type PatchRejection,
} from './patchSafety.js';
import type { ProjectFile } from './patches.js';

/** Why a workspace refused an operation. Never a silent skip. */
export type WorkspaceRefusal =
  | PatchRejection
  | 'git_directory'
  | 'path_traversal'
  | 'absolute_path'
  | 'symlink'
  | 'nul_byte'
  | 'empty_path'
  | 'missing_expected_base'
  | 'unknown_path'
  | 'escaped_workspace'
  | 'workspace_closed';

export interface WorkspaceRefusalError {
  refusal: WorkspaceRefusal;
  path: string;
  detail: string;
}

/**
 * The git blob SHA of a piece of content.
 *
 * This is the same value `git hash-object` produces and the same value the GitHub trees
 * API returns, which is the entire point: the base identity a patch carries has to be
 * comparable to what the remote reports, or a stale base cannot be detected at write
 * time. Content is committed to the object store byte-for-byte, so this deliberately
 * does *not* normalise line endings — a CRLF file and its LF twin are different blobs to
 * git and must be different here too.
 */
export function gitBlobSha(content: string): string {
  const body = Buffer.from(content, 'utf8');
  return createHash('sha1')
    .update(`blob ${body.length}\0`)
    .update(body)
    .digest('hex');
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Rejects a path before it reaches the filesystem.
 *
 * `.git` is refused at any depth, not just the first segment: `a/.git/hooks/pre-commit`
 * is as much a repository write as `.git/hooks/pre-commit`. The check is
 * case-insensitive because the workspace may live on a case-insensitive filesystem,
 * where `.GIT` and `.git` are the same directory.
 */
export function checkWorkspacePath(path: string): WorkspaceRefusalError | null {
  const refuse = (refusal: WorkspaceRefusal, detail: string): WorkspaceRefusalError => ({
    refusal,
    path,
    detail,
  });

  if (!path || !path.trim()) return refuse('empty_path', 'A path is required.');
  if (path.includes('\0')) return refuse('nul_byte', 'A path may not contain a NUL byte.');

  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');

  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    return refuse('absolute_path', 'Only paths relative to the repository root are allowed.');
  }

  const segments = normalized.split('/');
  for (const segment of segments) {
    if (segment === '..') {
      return refuse('path_traversal', 'A path may not step outside the repository root.');
    }
    if (segment.toLowerCase() === '.git') {
      return refuse('git_directory', 'The .git directory is not writable through a patch.');
    }
    if (WINDOWS_RESERVED.test(segment)) {
      return refuse('path_traversal', `"${segment}" is a reserved device name and cannot be a file.`);
    }
  }

  return null;
}

/** One staged change, not yet visible to the caller's file set. */
export interface StagedChange {
  path: string;
  kind: 'create' | 'update' | 'delete';
  /** The blob SHA this change was computed against. `null` for a creation. */
  baseBlobSha: string | null;
  /** The blob SHA the change produces. `null` for a deletion. */
  resultBlobSha: string | null;
  linesAdded: number;
  linesRemoved: number;
}

export interface WorkspaceDiff {
  creates: readonly string[];
  updates: readonly string[];
  deletes: readonly string[];
  /** Files at the source commit. The denominator for `deletionRatio`. */
  filesAtBase: number;
  /** Share of the repository this transaction would delete. */
  deletionRatio: number;
  linesAdded: number;
  linesRemoved: number;
}
export interface WorkspaceSource {
  /** The exact commit the workspace is based on. Recorded in every refusal and result. */
  commitSha: string;
  files: readonly ProjectFile[];
  /**
   * Paths that are symlinks at the source commit. A patch may not read or write through
   * one — the target is chosen by repository content, so following it would let a
   * proposal address a file it never named.
   */
  symlinkPaths?: readonly string[];
}

export interface StageWriteOptions {
  path: string;
  content: string;
  /**
   * The blob SHA the author saw. Required for an update, refused for a creation. This is
   * the field that had no producer before; the workspace derives candidate values from
   * its own base tree via `baseBlobSha`, so a caller has no excuse for omitting it.
   */
  expectedBlobSha?: string | null;
  allowDestructive?: boolean;
}

export interface StagePatchOptions {
  path: string;
  search: string;
  replace: string;
  expectedBlobSha?: string | null;
  allowDestructive?: boolean;
  isNewFile?: boolean;
}

export class PatchWorkspaceError extends Error {
  readonly refusal: WorkspaceRefusal;
  readonly path: string;
  readonly commitSha: string;

  constructor(input: WorkspaceRefusalError & { commitSha: string }) {
    super(`${input.path}: ${input.detail}`);
    this.name = 'PatchWorkspaceError';
    this.refusal = input.refusal;
    this.path = input.path;
    this.commitSha = input.commitSha;
  }
}

/**
 * Applies patches in isolation and commits them all at once, or not at all.
 *
 * Create with `PatchWorkspace.open`, stage changes, call `inspectDiff` to see what the
 * transaction would do, then `commit` to get the resulting file set. `dispose` removes
 * the temporary directory; `commit` does it for you.
 */
export class PatchWorkspace {
  private readonly base = new Map<string, string>();
  private readonly baseShas = new Map<string, string>();
  private readonly symlinks: ReadonlySet<string>;
  private readonly staged = new Map<string, string | null>();
  private readonly changes: StagedChange[] = [];
  private closed = false;

  private constructor(
    readonly commitSha: string,
    private readonly root: string,
    source: WorkspaceSource,
  ) {
    for (const file of source.files) {
      this.base.set(file.path, file.content);
      this.baseShas.set(file.path, gitBlobSha(file.content));
    }
    this.symlinks = new Set(source.symlinkPaths ?? []);
  }

  /** Materialises an isolated directory holding the source commit's files. */
  static async open(source: WorkspaceSource): Promise<PatchWorkspace> {
    // Canonicalised once, here. On Windows `tmpdir()` hands back the 8.3 short form
    // (`C:\Users\SABRIL~1\...`) while `realpath` returns the long one, so comparing a
    // resolved target against an uncanonicalised root makes every legitimate path look
    // like an escape.
    const root = await realpath(await mkdtemp(join(tmpdir(), 'xroga-patch-')));
    const workspace = new PatchWorkspace(source.commitSha, root, source);
    for (const file of source.files) {
      // A file that cannot legally be patched cannot legally be materialised either;
      // writing it would put a `.git` entry on disk for a later step to trip over.
      if (checkWorkspacePath(file.path)) continue;
      if (workspace.symlinks.has(file.path)) continue;
      const target = join(root, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf8');
    }
    return workspace;
  }

  /** The blob SHA of a path at the source commit, or `null` if it is not there. */
  baseBlobSha(path: string): string | null {
    return this.baseShas.get(path) ?? null;
  }

  /** The content a patch would be applied to: the staged version if any, else the base. */
  currentContent(path: string): string | null {
    if (this.staged.has(path)) return this.staged.get(path) ?? null;
    return this.base.get(path) ?? null;
  }

  private refuse(refusal: WorkspaceRefusal, path: string, detail: string): never {
    throw new PatchWorkspaceError({ refusal, path, detail, commitSha: this.commitSha });
  }

  private assertOpen(path: string): void {
    if (this.closed) {
      this.refuse('workspace_closed', path, 'This workspace has already been committed or disposed.');
    }
  }

  /**
   * Resolves a path inside the workspace, refusing anything that lands outside it.
   *
   * The string check in `checkWorkspacePath` runs first. This is the second line: it asks
   * the filesystem where the path actually goes, so a construction the parser did not
   * anticipate still cannot escape.
   */
  private async safeTarget(path: string): Promise<string> {
    const refusal = checkWorkspacePath(path);
    if (refusal) this.refuse(refusal.refusal, path, refusal.detail);
    if (this.symlinks.has(path)) {
      this.refuse('symlink', path, 'This path is a symlink at the source commit and is not followed.');
    }

    const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
    const target = resolve(this.root, normalized);
    const rootReal = await realpath(this.root);
    if (target !== rootReal && !target.startsWith(rootReal + sep)) {
      this.refuse('escaped_workspace', path, 'The resolved path is outside the workspace root.');
    }

    // An existing entry that is a symlink is refused even if the source commit did not
    // list it as one — a previously staged change could have created it.
    try {
      const stats = await lstat(target);
      if (stats.isSymbolicLink()) {
        this.refuse('symlink', path, 'The path is a symlink and is not written through.');
      }
    } catch {
      // Absent is fine; a creation is legitimate.
    }

    return target;
  }

  private assertExpectedBase(path: string, expected: string | null | undefined): void {
    const actual = this.staged.has(path)
      ? gitBlobSha(this.staged.get(path) ?? '')
      : this.baseShas.get(path) ?? null;

    if (actual === null) return; // A creation carries no base.

    if (expected === undefined || expected === null) {
      this.refuse(
        'missing_expected_base',
        path,
        'An update must carry the blob SHA it was written against, so a stale base can be detected.',
      );
    }
    if (expected !== actual) {
      this.refuse(
        'stale_source',
        path,
        `The file is at blob ${actual.slice(0, 12)} but the change was written against ${expected.slice(0, 12)}.`,
      );
    }
  }

  private record(path: string, before: string | null, after: string | null): void {
    const counts = countLineDelta(before ?? '', after ?? '');
    const existing = this.changes.findIndex((c) => c.path === path);
    const entry: StagedChange = {
      path,
      kind: after === null ? 'delete' : this.baseShas.has(path) ? 'update' : 'create',
      baseBlobSha: this.baseShas.get(path) ?? null,
      resultBlobSha: after === null ? null : gitBlobSha(after),
      linesAdded: counts.added,
      linesRemoved: counts.removed,
    };
    if (existing === -1) this.changes.push(entry);
    else this.changes[existing] = entry;
  }

  /** Stages a whole-file write. */
  async stageWrite(options: StageWriteOptions): Promise<StagedChange> {
    this.assertOpen(options.path);
    const target = await this.safeTarget(options.path);
    const before = this.currentContent(options.path);

    if (before !== null) {
      this.assertExpectedBase(options.path, options.expectedBlobSha);
      const verdict = checkPatchResult(before, options.content, {
        allowDestructive: options.allowDestructive,
      });
      if (!verdict.ok) this.refuse(verdict.rejection!, options.path, verdict.detail!);
    }

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, options.content, 'utf8');
    this.staged.set(options.path, options.content);
    this.record(options.path, before, options.content);
    return this.changes.find((c) => c.path === options.path)!;
  }

  /** Stages a SEARCH/REPLACE patch, subject to every rule in `patchSafety`. */
  async stagePatch(options: StagePatchOptions): Promise<StagedChange> {
    this.assertOpen(options.path);
    const target = await this.safeTarget(options.path);
    const before = this.currentContent(options.path);

    const verdict = checkPatchSafety(before, options.search, {
      isNewFile: options.isNewFile,
      allowDestructive: options.allowDestructive,
    });
    if (!verdict.ok) this.refuse(verdict.rejection!, options.path, verdict.detail!);

    if (before === null) {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, options.replace, 'utf8');
      this.staged.set(options.path, options.replace);
      this.record(options.path, null, options.replace);
      return this.changes.find((c) => c.path === options.path)!;
    }

    this.assertExpectedBase(options.path, options.expectedBlobSha);

    const normalized = normalizeEol(before);
    const search = normalizeEol(options.search);
    const index = normalized.indexOf(search);
    if (index === -1) {
      this.refuse('search_not_found', options.path, 'The text the patch expected to find is not in the file.');
    }
    const after = normalized.slice(0, index) + normalizeEol(options.replace) + normalized.slice(index + search.length);

    const result = checkPatchResult(before, after, { allowDestructive: options.allowDestructive });
    if (!result.ok) this.refuse(result.rejection!, options.path, result.detail!);

    await writeFile(target, after, 'utf8');
    this.staged.set(options.path, after);
    this.record(options.path, before, after);
    return this.changes.find((c) => c.path === options.path)!;
  }

  /** Stages a deletion. The path must exist at the source commit or be staged. */
  async stageDelete(path: string, expectedBlobSha?: string | null): Promise<StagedChange> {
    this.assertOpen(path);
    const target = await this.safeTarget(path);
    const before = this.currentContent(path);
    if (before === null) {
      this.refuse('unknown_path', path, 'There is nothing at this path to delete.');
    }
    this.assertExpectedBase(path, expectedBlobSha);

    await rm(target, { force: true });
    this.staged.set(path, null);
    this.record(path, before, null);
    return this.changes.find((c) => c.path === path)!;
  }

  /** What this transaction would do, before anything outside the workspace is touched. */
  inspectDiff(): WorkspaceDiff {
    const creates = this.changes.filter((c) => c.kind === 'create').map((c) => c.path);
    const updates = this.changes.filter((c) => c.kind === 'update').map((c) => c.path);
    const deletes = this.changes.filter((c) => c.kind === 'delete').map((c) => c.path);
    return {
      creates,
      updates,
      deletes,
      filesAtBase: this.base.size,
      deletionRatio: this.base.size === 0 ? 0 : deletes.length / this.base.size,
      linesAdded: this.changes.reduce((sum, c) => sum + c.linesAdded, 0),
      linesRemoved: this.changes.reduce((sum, c) => sum + c.linesRemoved, 0),
    };
  }

  get stagedChanges(): readonly StagedChange[] {
    return this.changes;
  }

  /**
   * Produces the resulting file set and closes the workspace.
   *
   * The read is from disk, not from the staged map, so what the caller receives is what
   * actually applied rather than what was intended to apply.
   */
  async commit(): Promise<{ files: ProjectFile[]; diff: WorkspaceDiff; commitSha: string }> {
    this.assertOpen('<workspace>');
    const diff = this.inspectDiff();
    const files: ProjectFile[] = [];

    for (const [path, baseContent] of this.base) {
      if (this.staged.get(path) === null) continue; // deleted
      if (checkWorkspacePath(path) || this.symlinks.has(path)) {
        // Never materialised, so it cannot be read back. Carried through untouched.
        files.push({ path, content: baseContent });
        continue;
      }
      files.push({ path, content: await readFile(join(this.root, path), 'utf8') });
    }
    for (const [path, content] of this.staged) {
      if (content === null || this.base.has(path)) continue;
      files.push({ path, content: await readFile(join(this.root, path), 'utf8') });
    }

    await this.dispose();
    return { files, diff, commitSha: this.commitSha };
  }

  /** Discards the transaction. Nothing staged has any effect. */
  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await rm(this.root, { recursive: true, force: true });
  }
}

function countLineDelta(before: string, after: string): { added: number; removed: number } {
  const b = normalizeEol(before) ? normalizeEol(before).split('\n') : [];
  const a = normalizeEol(after) ? normalizeEol(after).split('\n') : [];
  const common = new Map<string, number>();
  for (const line of b) common.set(line, (common.get(line) ?? 0) + 1);
  let unchanged = 0;
  for (const line of a) {
    const count = common.get(line) ?? 0;
    if (count > 0) {
      unchanged += 1;
      common.set(line, count - 1);
    }
  }
  return { added: a.length - unchanged, removed: b.length - unchanged };
}
