/**
 * Complete (or honestly partial) tree reads.
 *
 * GitHub caps a recursive tree response and sets `truncated: true`. A truncated listing is not a smaller repository: planning or
 * searching against it reports real files as absent. So a truncated response is never used. The reader first asks for the recursive
 * listing; when that is truncated it walks the tree one directory at a time (bounded), which has no such cap per response. If a
 * bound is hit, or one directory is itself too large for a single response, the result says `complete: false` and why, and every
 * consumer must treat it as partial rather than guessing the rest.
 */
import type { GitHubSourcePort, RawGitTreeEntry } from './provider.js';

export interface TreeLimits {
  /** Most entries accepted in total. */
  readonly maxEntries: number;
  /** Most non-recursive tree requests spent walking a truncated tree. */
  readonly maxSubtreeFetches: number;
}

export const DEFAULT_TREE_LIMITS: TreeLimits = { maxEntries: 150_000, maxSubtreeFetches: 600 };

export interface CompleteTree {
  readonly entries: RawGitTreeEntry[];
  readonly complete: boolean;
  readonly mode: 'recursive' | 'subtrees';
  readonly subtreeFetches: number;
  /** Why the listing is partial. Absent when complete. */
  readonly partialReason?: 'entry_limit' | 'fetch_limit' | 'directory_truncated' | 'unreadable';
}

export async function readCompleteTree(
  port: Pick<GitHubSourcePort, 'getTree'>,
  repositoryId: string,
  rootTreeSha: string,
  limits: TreeLimits = DEFAULT_TREE_LIMITS,
): Promise<CompleteTree> {
  const recursive = await port.getTree(repositoryId, rootTreeSha, true);
  if (!recursive || !Array.isArray(recursive.tree)) return { entries: [], complete: false, mode: 'recursive', subtreeFetches: 0, partialReason: 'unreadable' };
  if (recursive.truncated !== true) {
    return recursive.tree.length > limits.maxEntries
      ? { entries: recursive.tree.slice(0, limits.maxEntries), complete: false, mode: 'recursive', subtreeFetches: 0, partialReason: 'entry_limit' }
      : { entries: recursive.tree, complete: true, mode: 'recursive', subtreeFetches: 0 };
  }

  // Truncated: walk directory by directory, breadth first, from the root.
  const entries: RawGitTreeEntry[] = [];
  const queue: Array<{ sha: string; prefix: string }> = [{ sha: rootTreeSha, prefix: '' }];
  const seen = new Set<string>([rootTreeSha + ':']);
  let fetches = 0;
  let partialReason: CompleteTree['partialReason'];

  while (queue.length) {
    if (fetches >= limits.maxSubtreeFetches) { partialReason = 'fetch_limit'; break; }
    const next = queue.shift()!;
    fetches += 1;
    const level = await port.getTree(repositoryId, next.sha, false);
    if (!level || !Array.isArray(level.tree)) { partialReason = 'unreadable'; continue; }
    // A single directory too large for one response cannot be completed by walking: say so.
    if (level.truncated === true) partialReason = partialReason ?? 'directory_truncated';
    for (const entry of level.tree) {
      if (typeof entry.path !== 'string' || !entry.path) continue;
      const path = next.prefix ? `${next.prefix}/${entry.path}` : entry.path;
      if (entries.length >= limits.maxEntries) { partialReason = 'entry_limit'; queue.length = 0; break; }
      entries.push({ ...entry, path });
      if (entry.type === 'tree' && typeof entry.sha === 'string') {
        const key = `${entry.sha}:${path}`;
        if (!seen.has(key)) { seen.add(key); queue.push({ sha: entry.sha, prefix: path }); }
      }
    }
  }
  return { entries, complete: partialReason === undefined, mode: 'subtrees', subtreeFetches: fetches, ...(partialReason ? { partialReason } : {}) };
}
