/**
 * What a repository mutation *is*, decided before anything is sent to GitHub.
 *
 * The atomic writer that follows this module has one job — get a set of tree entries
 * into a single commit or fail without touching the branch. It is deliberately not the
 * place that decides whether the mutation makes sense. That decision belongs here,
 * where it can be made against the repository's real starting tree and tested without a
 * network.
 *
 * Three things this exists to prevent, none of which the old push path checked:
 *
 * 1. **Writes derived from pipeline memory.** The previous code built its tree from the
 *    file list the build happened to be holding. Anything the pipeline had not loaded
 *    was invisible to it, so "preserve unchanged files" was an accident of `base_tree`
 *    rather than a property anyone verified. Every operation here resolves against a
 *    `StartingTree` read from the commit being built on.
 *
 * 2. **Silent mode loss.** Every entry was written as `100644`. Updating a committed
 *    shell script or a symlink therefore stripped its mode, and nothing reported it.
 *    Modes are now carried from the starting tree unless a caller deliberately changes
 *    one.
 *
 * 3. **Paths that are not paths.** `../`, an absolute path, a `.git` segment or a null
 *    byte all reached the Git Data API as-is. GitHub rejects some of them and quietly
 *    normalises others, which is the worst of both outcomes. They are refused here.
 */

/** The subset of git file modes a generated project can legitimately produce. */
export type FileMode = '100644' | '100755' | '120000';

export const DEFAULT_FILE_MODE: FileMode = '100644';

const KNOWN_FILE_MODES: readonly string[] = ['100644', '100755', '120000'];

export function isFileMode(value: unknown): value is FileMode {
  return typeof value === 'string' && KNOWN_FILE_MODES.includes(value);
}

export type MutationRejection =
  | 'invalid_path'
  | 'duplicate_output_path'
  | 'conflicting_operations'
  | 'missing_source'
  | 'already_exists'
  | 'restore_source_missing'
  | 'unsupported_entry_type'
  | 'empty_plan';

export class MutationPlanError extends Error {
  readonly code = 'MUTATION_PLAN_REJECTED' as const;
  readonly rejection: MutationRejection;
  readonly path?: string;

  constructor(rejection: MutationRejection, detail: string, path?: string) {
    super(detail);
    this.name = 'MutationPlanError';
    this.rejection = rejection;
    this.path = path;
  }
}

/**
 * The five operations the execution runtime already models in memory
 * (`CanonicalMutationService`), expressed against a real git tree.
 *
 * `restore` is the one that needs saying out loud: it re-points a path at a blob that
 * already exists in git — either the one the starting tree has, or an explicit
 * `fromBlobSha` from an older commit. It never invents content, which is what makes it
 * usable to undo a bad change without a rebuild.
 */
export type MutationRequest =
  | { kind: 'create'; path: string; content: string; mode?: FileMode }
  | { kind: 'update'; path: string; content: string; mode?: FileMode }
  | { kind: 'delete'; path: string }
  | { kind: 'rename'; from: string; to: string; content?: string; mode?: FileMode }
  | { kind: 'restore'; path: string; fromBlobSha?: string };

export type MutationKind = MutationRequest['kind'];

export interface StartingTreeEntry {
  path: string;
  mode: string;
  sha: string;
  type: 'blob' | 'tree' | 'commit';
}

/** The exact tree a mutation is planned against — never a remembered file list. */
export interface StartingTree {
  /** The tree SHA of the commit being built on. */
  treeSha: string;
  entries: StartingTreeEntry[];
  /** True when the repository has no commits yet, so there is nothing to preserve. */
  empty?: boolean;
}

/** A blob that has to be uploaded before the tree can be created. */
export interface PendingBlob {
  path: string;
  content: string;
  mode: FileMode;
}

/** A tree entry that needs no upload: a deletion, a rename, or a restore. */
export interface ResolvedTreeEntry {
  path: string;
  mode: FileMode;
  type: 'blob';
  /** `null` removes the path from `base_tree`. */
  sha: string | null;
}

export interface MutationManifestItem {
  kind: MutationKind;
  path: string;
  /** Present on a rename: the path the content came from. */
  from?: string;
  mode: FileMode;
  /** Set when the entry reuses an existing blob rather than uploading one. */
  reusedBlobSha?: string;
  /** Byte length of new content, when this operation uploads content. */
  bytes?: number;
}

export interface MutationPlan {
  /** Uploads required before the tree call. */
  pendingBlobs: PendingBlob[];
  /** Entries already complete without an upload. */
  resolvedEntries: ResolvedTreeEntry[];
  /** Every operation, in the order it was planned. The criterion-2 manifest. */
  manifest: MutationManifestItem[];
  /** Paths present in the starting tree that this plan does not touch. */
  preservedPaths: string[];
  /** The tree the plan was built against, carried so the writer cannot substitute one. */
  baseTreeSha: string;
}

const MAX_PATH_LENGTH = 400;

/** Unicode category Cc: U+0000-U+001F and U+007F-U+009F. Never valid in a git path. */
const CONTROL_CHARACTER = /\p{Cc}/u;


/**
 * Rejects anything that is not a plain repository-relative file path.
 *
 * Deliberately strict rather than normalising. A path that arrives as `./src/../src/a.ts`
 * is a symptom — either a model produced it or a caller built it by concatenation — and
 * quietly rewriting it hides that while still writing a file.
 */
export function validateRepositoryPath(raw: string, label = 'path'): string {
  if (typeof raw !== 'string') {
    throw new MutationPlanError('invalid_path', `A ${label} must be a string.`);
  }

  const path = raw.trim();
  if (!path) {
    throw new MutationPlanError('invalid_path', `An empty ${label} cannot be written.`);
  }
  if (path.length > MAX_PATH_LENGTH) {
    throw new MutationPlanError(
      'invalid_path',
      `The ${label} is longer than ${MAX_PATH_LENGTH} characters.`,
      path.slice(0, 80),
    );
  }
  if (path.includes('\0')) {
    throw new MutationPlanError('invalid_path', `The ${label} contains a null byte.`);
  }
  if (CONTROL_CHARACTER.test(path)) {
    throw new MutationPlanError('invalid_path', `The ${label} contains a control character.`, path);
  }
  if (path.startsWith('/')) {
    throw new MutationPlanError('invalid_path', `The ${label} must be repository-relative, not absolute.`, path);
  }
  if (/^[a-zA-Z]:[\\/]/.test(path)) {
    throw new MutationPlanError('invalid_path', `The ${label} is an absolute Windows path.`, path);
  }
  if (path.includes('\\')) {
    throw new MutationPlanError(
      'invalid_path',
      `The ${label} uses backslashes; git paths are forward-slash separated.`,
      path,
    );
  }
  if (path.endsWith('/')) {
    throw new MutationPlanError('invalid_path', `The ${label} names a directory, not a file.`, path);
  }

  const segments = path.split('/');
  for (const segment of segments) {
    if (!segment) {
      throw new MutationPlanError('invalid_path', `The ${label} contains an empty segment.`, path);
    }
    if (segment === '.') {
      throw new MutationPlanError('invalid_path', `The ${label} contains a "." segment.`, path);
    }
    if (segment === '..') {
      throw new MutationPlanError(
        'invalid_path',
        `The ${label} escapes the repository root with "..".`,
        path,
      );
    }
    if (segment.toLowerCase() === '.git') {
      throw new MutationPlanError(
        'invalid_path',
        `The ${label} writes inside ".git", which would corrupt the repository.`,
        path,
      );
    }
  }

  return path;
}

/** Indexes a starting tree by path, keeping only entries a file mutation may touch. */
function indexStartingTree(tree: StartingTree): Map<string, StartingTreeEntry> {
  const index = new Map<string, StartingTreeEntry>();
  for (const entry of tree.entries) {
    // `tree` entries are implicit in git and are recreated from the paths of their
    // children. `commit` entries are submodule pointers — writing through one would
    // rewrite a different repository's reference, so they are never a valid target.
    if (entry.type !== 'blob') continue;
    index.set(entry.path, entry);
  }
  return index;
}

function startingMode(entry: StartingTreeEntry | undefined): FileMode {
  return isFileMode(entry?.mode) ? (entry.mode as FileMode) : DEFAULT_FILE_MODE;
}

interface PlannedOutput {
  path: string;
  mode: FileMode;
  content?: string;
  blobSha?: string;
}

/**
 * Turns requested operations into exactly the tree entries that express them.
 *
 * Every rejection below is a refusal to write, not a warning. A plan that reaches the
 * writer has already been proven internally consistent, so the writer never has to
 * decide what an ambiguous set of operations meant.
 */
export function planMutation(tree: StartingTree, requests: readonly MutationRequest[]): MutationPlan {
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new MutationPlanError('empty_plan', 'A mutation must contain at least one operation.');
  }

  const starting = indexStartingTree(tree);
  const outputs = new Map<string, PlannedOutput>();
  const removals = new Map<string, MutationKind>();
  const manifest: MutationManifestItem[] = [];

  const claimOutput = (path: string, output: PlannedOutput, kind: MutationKind) => {
    if (outputs.has(path)) {
      throw new MutationPlanError(
        'duplicate_output_path',
        `Two operations both write "${path}". A single commit cannot contain two versions of one file.`,
        path,
      );
    }
    if (removals.has(path)) {
      throw new MutationPlanError(
        'conflicting_operations',
        `"${path}" is both removed and written by this mutation (${removals.get(path)} then ${kind}).`,
        path,
      );
    }
    outputs.set(path, output);
  };

  const claimRemoval = (path: string, kind: MutationKind) => {
    if (removals.has(path)) {
      throw new MutationPlanError(
        'conflicting_operations',
        `"${path}" is removed twice by this mutation.`,
        path,
      );
    }
    if (outputs.has(path)) {
      throw new MutationPlanError(
        'conflicting_operations',
        `"${path}" is both written and removed by this mutation.`,
        path,
      );
    }
    removals.set(path, kind);
  };

  for (const request of requests) {
    switch (request.kind) {
      case 'create': {
        const path = validateRepositoryPath(request.path);
        if (starting.has(path)) {
          throw new MutationPlanError(
            'already_exists',
            `"${path}" already exists in the repository; use an update to change it.`,
            path,
          );
        }
        const mode = request.mode ?? DEFAULT_FILE_MODE;
        claimOutput(path, { path, mode, content: request.content }, 'create');
        manifest.push({ kind: 'create', path, mode, bytes: Buffer.byteLength(request.content, 'utf8') });
        break;
      }

      case 'update': {
        const path = validateRepositoryPath(request.path);
        const existing = starting.get(path);
        if (!existing) {
          throw new MutationPlanError(
            'missing_source',
            `"${path}" is not in the repository, so it cannot be updated. Use a create instead.`,
            path,
          );
        }
        // The mode is preserved unless the caller deliberately changes it. This is the
        // executable-bit fix: an update used to rewrite every entry as 100644.
        const mode = request.mode ?? startingMode(existing);
        claimOutput(path, { path, mode, content: request.content }, 'update');
        manifest.push({ kind: 'update', path, mode, bytes: Buffer.byteLength(request.content, 'utf8') });
        break;
      }

      case 'delete': {
        const path = validateRepositoryPath(request.path);
        const existing = starting.get(path);
        if (!existing) {
          throw new MutationPlanError(
            'missing_source',
            `"${path}" is not in the repository, so it cannot be deleted.`,
            path,
          );
        }
        claimRemoval(path, 'delete');
        manifest.push({ kind: 'delete', path, mode: startingMode(existing) });
        break;
      }

      case 'rename': {
        const from = validateRepositoryPath(request.from, 'source path');
        const to = validateRepositoryPath(request.to, 'destination path');
        if (from === to) {
          throw new MutationPlanError(
            'conflicting_operations',
            `A rename must change the path; "${from}" was given as both source and destination.`,
            from,
          );
        }
        const existing = starting.get(from);
        if (!existing) {
          throw new MutationPlanError(
            'missing_source',
            `"${from}" is not in the repository, so it cannot be renamed.`,
            from,
          );
        }
        if (starting.has(to)) {
          throw new MutationPlanError(
            'already_exists',
            `"${to}" already exists, so renaming "${from}" onto it would silently destroy it.`,
            to,
          );
        }
        const mode = request.mode ?? startingMode(existing);
        if (typeof request.content === 'string') {
          claimOutput(to, { path: to, mode, content: request.content }, 'rename');
          manifest.push({
            kind: 'rename',
            path: to,
            from,
            mode,
            bytes: Buffer.byteLength(request.content, 'utf8'),
          });
        } else {
          // A pure rename reuses the blob that is already in git. No upload, and the
          // content is provably identical rather than re-serialised from memory.
          claimOutput(to, { path: to, mode, blobSha: existing.sha }, 'rename');
          manifest.push({ kind: 'rename', path: to, from, mode, reusedBlobSha: existing.sha });
        }
        claimRemoval(from, 'rename');
        break;
      }

      case 'restore': {
        const path = validateRepositoryPath(request.path);
        const existing = starting.get(path);
        const blobSha = request.fromBlobSha ?? existing?.sha;
        if (!blobSha) {
          throw new MutationPlanError(
            'restore_source_missing',
            `"${path}" is not in the starting tree and no source blob was given to restore it from.`,
            path,
          );
        }
        const mode = startingMode(existing);
        claimOutput(path, { path, mode, blobSha }, 'restore');
        manifest.push({ kind: 'restore', path, mode, reusedBlobSha: blobSha });
        break;
      }

      default: {
        const unreachable = request as { kind?: string };
        throw new MutationPlanError(
          'unsupported_entry_type',
          `Unsupported mutation kind "${String(unreachable.kind)}".`,
        );
      }
    }
  }

  const pendingBlobs: PendingBlob[] = [];
  const resolvedEntries: ResolvedTreeEntry[] = [];

  for (const output of outputs.values()) {
    if (typeof output.content === 'string') {
      pendingBlobs.push({ path: output.path, content: output.content, mode: output.mode });
    } else if (output.blobSha) {
      resolvedEntries.push({ path: output.path, mode: output.mode, type: 'blob', sha: output.blobSha });
    }
  }

  for (const [path, kind] of removals) {
    resolvedEntries.push({
      path,
      mode: startingMode(starting.get(path)),
      type: 'blob',
      sha: null,
    });
    void kind;
  }

  const touched = new Set<string>([...outputs.keys(), ...removals.keys()]);
  const preservedPaths = [...starting.keys()].filter((path) => !touched.has(path)).sort();

  return {
    pendingBlobs,
    resolvedEntries,
    manifest,
    preservedPaths,
    baseTreeSha: tree.treeSha,
  };
}

/**
 * Merges uploaded blob SHAs into the plan's entries to form the tree request body.
 *
 * Refuses if any pending blob is unaccounted for. A tree built from a partial upload set
 * would commit successfully while silently omitting files — the exact class of failure
 * this whole path exists to make impossible.
 */
export function finalizeTreeEntries(
  plan: MutationPlan,
  blobShaByPath: ReadonlyMap<string, string>,
): ResolvedTreeEntry[] {
  const entries: ResolvedTreeEntry[] = [...plan.resolvedEntries];

  for (const pending of plan.pendingBlobs) {
    const sha = blobShaByPath.get(pending.path);
    if (!sha) {
      throw new MutationPlanError(
        'conflicting_operations',
        `No blob was uploaded for "${pending.path}", so the tree would be incomplete.`,
        pending.path,
      );
    }
    entries.push({ path: pending.path, mode: pending.mode, type: 'blob', sha });
  }

  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Adapts the "here are the files, here are the paths to remove" convention the build
 * pipeline already speaks into explicit operations.
 *
 * The classification is the point: a path already in the starting tree is an `update`
 * (which preserves its mode), a path that is not is a `create`. The old push path made no
 * such distinction — every file was written as a fresh `100644` blob — so this is where
 * the executable bit stops being silently dropped.
 *
 * Removals of paths that are not in the tree are dropped rather than refused. The pipeline
 * computes them by diffing its own view of a previous build, so a path it lists as deleted
 * may simply never have been committed; that is not a reason to refuse the whole write.
 * A `delete` passed directly to `planMutation` is still strict.
 */
export function deriveFileSyncMutations(
  tree: StartingTree,
  files: readonly { path: string; content: string; mode?: FileMode }[],
  deletePaths: readonly string[] = [],
): MutationRequest[] {
  const starting = indexStartingTree(tree);
  const mutations: MutationRequest[] = [];
  const written = new Set<string>();

  for (const file of files) {
    const path = validateRepositoryPath(file.path);
    if (written.has(path)) {
      throw new MutationPlanError(
        'duplicate_output_path',
        `"${path}" appears twice in this build's output. A single commit cannot contain two versions of one file.`,
        path,
      );
    }
    written.add(path);
    mutations.push(
      starting.has(path)
        ? { kind: 'update', path, content: file.content, ...(file.mode ? { mode: file.mode } : {}) }
        : { kind: 'create', path, content: file.content, ...(file.mode ? { mode: file.mode } : {}) },
    );
  }

  const seenRemoval = new Set<string>();
  for (const raw of deletePaths) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const path = validateRepositoryPath(raw.replace(/^\/+/, ''), 'deleted path');
    if (written.has(path) || seenRemoval.has(path)) continue;
    if (!starting.has(path)) continue;
    seenRemoval.add(path);
    mutations.push({ kind: 'delete', path });
  }

  return mutations;
}

/** One readable line per rejection, for the run transcript. */
export function describeMutationRejection(rejection: MutationRejection): string {
  switch (rejection) {
    case 'invalid_path':
      return 'A file path in this change is not a valid repository path.';
    case 'duplicate_output_path':
      return 'Two changes write the same file, so the commit would be ambiguous.';
    case 'conflicting_operations':
      return 'This change contains operations that contradict each other.';
    case 'missing_source':
      return 'A change targets a file that is not in the repository.';
    case 'already_exists':
      return 'A change would create or overwrite a file that already exists.';
    case 'restore_source_missing':
      return 'A restore has no source version to restore from.';
    case 'unsupported_entry_type':
      return 'This change includes an operation the writer does not support.';
    case 'empty_plan':
      return 'There was nothing to write.';
  }
}
