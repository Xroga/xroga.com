/**
 * The GitHub REST implementation of `AtomicWriteApi`.
 *
 * Kept separate from `githubAtomicWrite.ts` on purpose: the write *sequence* is the part
 * with the safety properties worth testing, and it is only testable without a network if
 * nothing in it knows about URLs, status codes or base64. Everything vendor-specific lives
 * here, and this file contains no ordering decisions at all.
 *
 * Two details that are easy to get wrong and are load-bearing:
 *
 * - `updateRef` must send `force: false` and must *report* a rejection rather than throw.
 *   GitHub answers 422 when the update is not a fast-forward, which is precisely the
 *   "someone else pushed while we were building" case. Throwing would make it
 *   indistinguishable from a transport error, and the previous code's catch-all then
 *   retried the write through the Contents API — overwriting the very commit the check
 *   existed to protect.
 *
 * - `isRepositoryEmpty` answers from `size`, and treats an unreadable repository as *not*
 *   empty. Guessing "empty" would route an unreadable repository down the bootstrap
 *   refusal path with a misleading reason; letting it continue produces the real error from
 *   the branch lookup instead.
 */

import type {
  AtomicWriteApi,
  PullRequestResult,
  RefUpdateOutcome,
} from './githubAtomicWrite.js';
import type { ResolvedTreeEntry } from './githubMutationPlan.js';
import type { RawTreeResponse } from './githubTreeSnapshot.js';
import type { BranchProtectionApi } from './githubBranchAuthorization.js';

type Fetcher = (token: string, path: string, init?: RequestInit) => Promise<Response>;

function ref(branch: string): string {
  // Branch names legitimately contain `/` (`xroga/run-1`), which must stay a path
  // separator in the ref path, so the segments are encoded individually.
  return branch.split('/').map(encodeURIComponent).join('/');
}

async function failure(res: Response, what: string): Promise<Error> {
  const body = await res.text().catch(() => '');
  return new Error(`${what} failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
}

export interface AtomicTransportOptions {
  /** Author/committer fields for the commit. */
  commitIdentity?: {
    author: { name: string; email: string; date: string };
    committer: { name: string; email: string; date: string };
  };
}

export function makeAtomicWriteApi(
  ghFetch: Fetcher,
  token: string,
  owner: string,
  repo: string,
  options: AtomicTransportOptions = {},
): AtomicWriteApi & BranchProtectionApi {
  const base = `/repos/${owner}/${repo}`;

  return {
    async initializeEmptyRepository(input) {
      const encodedPath = input.path.split('/').map(encodeURIComponent).join('/');
      const identity = options.commitIdentity;
      const res = await ghFetch(token, `${base}/contents/${encodedPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input.message,
          content: Buffer.from(input.content, 'utf8').toString('base64'),
          branch: input.branch,
          ...(identity
            ? {
                author: identity.author,
                committer: identity.committer,
              }
            : {}),
        }),
      });
      if (!res.ok) throw await failure(res, 'GitHub repository initialization');
      const data = (await res.json()) as { commit?: { sha?: string } };
      const commitSha = data.commit?.sha;
      if (typeof commitSha !== 'string') {
        throw new Error('GitHub initialized the repository without returning a commit id.');
      }
      return { commitSha };
    },

    async getRef(branch: string) {
      const res = await ghFetch(token, `${base}/git/ref/heads/${ref(branch)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { object?: { sha?: string } };
      return typeof data.object?.sha === 'string' ? { sha: data.object.sha } : null;
    },

    async createRef(branch: string, sha: string) {
      const res = await ghFetch(token, `${base}/git/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      });
      return res.ok;
    },

    async getCommitTreeSha(commitSha: string) {
      const res = await ghFetch(token, `${base}/git/commits/${encodeURIComponent(commitSha)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { tree?: { sha?: string } };
      return typeof data.tree?.sha === 'string' ? data.tree.sha : null;
    },

    async getTree(treeSha: string): Promise<RawTreeResponse | null> {
      const res = await ghFetch(
        token,
        `${base}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
      );
      if (!res.ok) return null;
      return (await res.json()) as RawTreeResponse;
    },

    async createBlob(content: string) {
      const res = await ghFetch(token, `${base}/git/blobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: Buffer.from(content, 'utf8').toString('base64'),
          encoding: 'base64',
        }),
      });
      if (!res.ok) throw await failure(res, 'GitHub blob upload');
      const blob = (await res.json()) as { sha?: string };
      if (typeof blob.sha !== 'string') throw new Error('GitHub returned a blob with no id.');
      return blob.sha;
    },

    async createTree(baseTreeSha: string | null, entries: ResolvedTreeEntry[]) {
      const res = await ghFetch(token, `${base}/git/trees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(baseTreeSha ? { base_tree: baseTreeSha } : {}),
          tree: entries.map((entry) => ({
            path: entry.path,
            mode: entry.mode,
            type: entry.type,
            // `sha: null` is how the Git Data API removes a path from `base_tree`.
            sha: entry.sha,
          })),
        }),
      });
      if (!res.ok) throw await failure(res, 'GitHub tree creation');
      const tree = (await res.json()) as { sha?: string };
      if (typeof tree.sha !== 'string') throw new Error('GitHub returned a tree with no id.');
      return tree.sha;
    },

    async createCommit(message: string, treeSha: string, parentSha: string | null) {
      const res = await ghFetch(token, `${base}/git/commits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          tree: treeSha,
          parents: parentSha ? [parentSha] : [],
          ...(options.commitIdentity ?? {}),
        }),
      });
      if (!res.ok) throw await failure(res, 'GitHub commit creation');
      const commit = (await res.json()) as { sha?: string };
      if (typeof commit.sha !== 'string') throw new Error('GitHub returned a commit with no id.');
      return commit.sha;
    },

    async updateRef(branch: string, commitSha: string): Promise<RefUpdateOutcome> {
      const res = await ghFetch(token, `${base}/git/refs/heads/${ref(branch)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Compare-and-swap. Never force.
        body: JSON.stringify({ sha: commitSha, force: false }),
      });
      if (res.ok) return { ok: true };
      const detail = await res.text().catch(() => '');
      // 422 from a non-forced ref update means the update was not a fast-forward, i.e.
      // the branch moved under us. That is a conflict, not a transport failure.
      return {
        ok: false,
        conflict: res.status === 422,
        detail: `${res.status}${detail ? ` ${detail.slice(0, 160)}` : ''}`,
      };
    },

    async isRepositoryEmpty() {
      const res = await ghFetch(token, base);
      if (!res.ok) return false;
      const data = (await res.json()) as { size?: number };
      return (data.size ?? 0) === 0;
    },

    async isBranchProtected(branch: string) {
      const res = await ghFetch(token, `${base}/branches/${ref(branch)}`);
      if (!res.ok) {
        // 404 means the branch does not exist yet, so there is no protection rule to
        // honour. Anything else leaves the question genuinely unanswered.
        return res.status === 404 ? false : null;
      }
      const data = (await res.json()) as { protected?: boolean };
      return typeof data.protected === 'boolean' ? data.protected : null;
    },

    async openPullRequest(input): Promise<PullRequestResult> {
      const res = await ghFetch(token, `${base}/pulls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          head: input.head,
          base: input.base,
          title: input.title,
          body: input.body,
        }),
      });
      if (!res.ok) throw await failure(res, 'GitHub pull request creation');
      const pr = (await res.json()) as { number?: number; html_url?: string };
      if (typeof pr.number !== 'number') {
        throw new Error('GitHub returned a pull request with no number.');
      }
      return {
        number: pr.number,
        htmlUrl:
          typeof pr.html_url === 'string'
            ? pr.html_url
            : `https://github.com/${owner}/${repo}/pull/${pr.number}`,
      };
    },
  };
}
