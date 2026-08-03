/**
 * Reading the exact tree a mutation will be built on.
 *
 * `pushFilesViaGitData` passed `base_tree` and let GitHub merge, which preserves
 * untouched files but leaves the writer blind: it could not tell an update from a create,
 * could not preserve a file's mode, and could not reject a rename whose source did not
 * exist. Every such decision was deferred to GitHub, which has no idea what the build
 * intended.
 *
 * So the starting tree is read first, recursively, and the plan is resolved against it.
 * Two refusals matter here:
 *
 * - **Truncation.** GitHub caps a recursive tree response and sets `truncated: true`. A
 *   truncated tree looks like a smaller repository, and planning against it would
 *   classify existing files as new and report untouched files as absent. There is no safe
 *   way to guess the rest, so it is refused.
 *
 * - **An empty repository.** The Git Data API returns 409 for a repository with no
 *   commits. The old code answered that by writing files one at a time through the
 *   Contents API, which is N commits and therefore visible half-done. That path is gone;
 *   see `githubAtomicWrite.ts` for the bootstrap policy.
 */

import type { StartingTree, StartingTreeEntry } from './githubMutationPlan.js';

export type TreeSnapshotFailure =
  | 'commit_unreadable'
  | 'tree_unreadable'
  | 'tree_truncated'
  | 'repository_empty';

export class TreeSnapshotError extends Error {
  readonly code = 'TREE_SNAPSHOT_FAILED' as const;
  readonly reason: TreeSnapshotFailure;

  constructor(reason: TreeSnapshotFailure, detail: string) {
    super(detail);
    this.name = 'TreeSnapshotError';
    this.reason = reason;
  }
}

export interface RawTreeEntry {
  path?: string;
  mode?: string;
  type?: string;
  sha?: string;
}

export interface RawTreeResponse {
  sha?: string;
  tree?: RawTreeEntry[];
  truncated?: boolean;
}

/** Transport surface, kept minimal so snapshots are testable without a network. */
export interface TreeApi {
  /** The tree SHA recorded in a commit. `null` when the commit cannot be read. */
  getCommitTreeSha(commitSha: string): Promise<string | null>;
  /** A recursive tree listing, exactly as GitHub returns it. */
  getTree(treeSha: string): Promise<RawTreeResponse | null>;
}

function normaliseEntry(raw: RawTreeEntry): StartingTreeEntry | null {
  if (typeof raw.path !== 'string' || !raw.path) return null;
  if (typeof raw.sha !== 'string' || !raw.sha) return null;
  const type = raw.type === 'tree' || raw.type === 'commit' ? raw.type : 'blob';
  return {
    path: raw.path,
    mode: typeof raw.mode === 'string' ? raw.mode : '100644',
    sha: raw.sha,
    type,
  };
}

/**
 * Reads the tree of a specific commit.
 *
 * The commit SHA is passed in rather than resolved here on purpose: it is the SHA the
 * caller already recorded as the write's starting point, so the tree and the compare-and-swap
 * that follows are provably about the same commit. Resolving the branch again inside this
 * function would open a window where the two disagree.
 */
export async function readStartingTree(api: TreeApi, commitSha: string): Promise<StartingTree> {
  if (!commitSha) {
    throw new TreeSnapshotError('commit_unreadable', 'No commit SHA was given to snapshot.');
  }

  const treeSha = await api.getCommitTreeSha(commitSha);
  if (!treeSha) {
    throw new TreeSnapshotError(
      'commit_unreadable',
      `Commit ${commitSha.slice(0, 7)} could not be read, so its tree is unknown. Nothing was written.`,
    );
  }

  const response = await api.getTree(treeSha);
  if (!response || !Array.isArray(response.tree)) {
    throw new TreeSnapshotError(
      'tree_unreadable',
      `Tree ${treeSha.slice(0, 7)} could not be read. Nothing was written.`,
    );
  }

  if (response.truncated === true) {
    throw new TreeSnapshotError(
      'tree_truncated',
      'GitHub truncated the file listing for this repository, so the starting state is only ' +
        'partially known. Refusing to write: planning against a partial tree would treat ' +
        'existing files as new and could delete files it never saw.',
    );
  }

  const entries: StartingTreeEntry[] = [];
  for (const raw of response.tree) {
    const entry = normaliseEntry(raw);
    if (entry) entries.push(entry);
  }

  return { treeSha, entries };
}

/** The starting tree for a repository with no commits: nothing exists, nothing to preserve. */
export function emptyStartingTree(): StartingTree {
  return { treeSha: '', entries: [], empty: true };
}

export function describeTreeSnapshotFailure(reason: TreeSnapshotFailure): string {
  switch (reason) {
    case 'commit_unreadable':
      return 'The commit this change was going to build on could not be read.';
    case 'tree_unreadable':
      return "The repository's current file listing could not be read.";
    case 'tree_truncated':
      return 'This repository is too large for GitHub to list in one response, so the change was refused rather than applied against a partial view.';
    case 'repository_empty':
      return 'The repository has no commits yet.';
  }
}
