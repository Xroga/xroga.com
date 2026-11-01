/**
 * The GitHub surface the existing-source feature needs, keyed by the provider's immutable repository id.
 *
 * Every call that touches a repository uses `/repositories/{id}`, never `owner/name`, so a rename cannot redirect a read to another
 * repository and a transfer is visible as a different owner id rather than a silent change of target. The token is the connected
 * account's own (resolved server-side); it is never part of a return value.
 */
import { ProviderError } from './types.js';

export interface ViewerAccount { readonly id: string; readonly login: string }

export interface RepositorySummary {
  readonly id: string;
  readonly fullName: string;
  readonly ownerId: string;
  readonly ownerLogin: string;
  readonly ownerType: 'User' | 'Organization' | 'Other';
  readonly private: boolean;
  readonly archived: boolean;
  readonly defaultBranch: string;
  readonly permissions: { readonly pull: boolean; readonly push: boolean; readonly admin: boolean };
  readonly updatedAt: string;
}

export interface BranchHead { readonly commitSha: string; readonly protected: boolean }

export interface RawGitTreeEntry { path?: string; mode?: string; type?: string; sha?: string; size?: number }
export interface RawGitTree { sha?: string; tree?: RawGitTreeEntry[]; truncated?: boolean }
export interface RawBlob { content: string; encoding: 'utf-8' | 'base64'; size: number }

export interface GitHubSourcePort {
  viewer(): Promise<ViewerAccount>;
  /** One page of repositories the connected account can see. */
  listRepositories(page: number): Promise<{ repositories: RepositorySummary[]; hasMore: boolean }>;
  /** Throws ProviderError('not_found' | 'forbidden') when the account cannot see this repository. */
  getRepository(repositoryId: string): Promise<RepositorySummary>;
  /** The commit a branch points at now, or null when the branch does not exist. Throws 'empty' for a repository with no commits. */
  getBranchHead(repositoryId: string, branch: string): Promise<BranchHead | null>;
  getCommitTreeSha(repositoryId: string, commitSha: string): Promise<string | null>;
  getTree(repositoryId: string, treeSha: string, recursive: boolean): Promise<RawGitTree | null>;
  getBlob(repositoryId: string, blobSha: string): Promise<RawBlob | null>;
}

const REPO_ID = /^[0-9]{1,20}$/;
const SHA = /^[0-9a-f]{40}$/;
export const assertRepositoryId = (id: string): string => { if (!REPO_ID.test(id)) throw new ProviderError('not_found', 'invalid repository id'); return id; };
const assertSha = (sha: string): string => { if (!SHA.test(sha)) throw new ProviderError('not_found', 'invalid object id'); return sha; };

type FetchLike = typeof fetch;

function toSummary(r: Record<string, unknown>): RepositorySummary {
  const owner = (r.owner ?? {}) as Record<string, unknown>;
  const perms = (r.permissions ?? {}) as Record<string, unknown>;
  return {
    id: String(r.id),
    fullName: String(r.full_name),
    ownerId: String(owner.id),
    ownerLogin: String(owner.login ?? ''),
    ownerType: owner.type === 'User' || owner.type === 'Organization' ? owner.type : 'Other',
    private: r.private === true,
    archived: r.archived === true,
    defaultBranch: String(r.default_branch ?? 'main'),
    permissions: { pull: perms.pull === true, push: perms.push === true, admin: perms.admin === true },
    updatedAt: String(r.updated_at ?? ''),
  };
}

/** REST implementation. Errors are classified, never echoed: provider bodies can carry request ids and hosts. */
export function createRestSourcePort(token: string, fetchImpl: FetchLike = fetch, base = 'https://api.github.com'): GitHubSourcePort {
  const call = async (path: string): Promise<Response> => {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        signal: AbortSignal.timeout(20_000),
      });
    } catch { throw new ProviderError('unavailable', 'GitHub could not be reached'); }
    if (response.status === 401) throw new ProviderError('unauthorized', 'GitHub rejected the connection');
    if (response.status === 403 || response.status === 429) {
      if (response.headers.get('x-ratelimit-remaining') === '0' || response.status === 429 || response.headers.has('retry-after')) throw new ProviderError('rate_limited', 'GitHub rate limit reached');
      throw new ProviderError('forbidden', 'GitHub denied access');
    }
    if (response.status === 404 || response.status === 451) throw new ProviderError('not_found', 'not found');
    if (response.status === 409) throw new ProviderError('empty', 'the repository has no commits');
    if (response.status >= 500) throw new ProviderError('unavailable', 'GitHub is unavailable');
    if (!response.ok) throw new ProviderError('unavailable', `unexpected GitHub status ${response.status}`);
    return response;
  };
  const json = async (path: string): Promise<Record<string, unknown>> => {
    const response = await call(path);
    try { return (await response.json()) as Record<string, unknown>; } catch { throw new ProviderError('unavailable', 'unreadable GitHub response'); }
  };

  return {
    async viewer() {
      const u = await json('/user');
      if (!/^[0-9]{1,20}$/.test(String(u.id)) || typeof u.login !== 'string' || !u.login) throw new ProviderError('unauthorized', 'account verification failed');
      return { id: String(u.id), login: u.login };
    },

    async listRepositories(page) {
      const p = Math.max(1, Math.min(50, Math.floor(page)));
      const response = await call(`/user/repos?per_page=100&page=${p}&sort=updated&affiliation=owner,collaborator,organization_member`);
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      if (!Array.isArray(rows)) throw new ProviderError('unavailable', 'unreadable GitHub response');
      return { repositories: rows.map(toSummary), hasMore: rows.length === 100 && /rel="next"/.test(response.headers.get('link') ?? '') };
    },

    async getRepository(repositoryId) {
      return toSummary(await json(`/repositories/${assertRepositoryId(repositoryId)}`));
    },

    async getBranchHead(repositoryId, branch) {
      const path = `/repositories/${assertRepositoryId(repositoryId)}/branches/${encodeURIComponent(branch)}`;
      try {
        const b = await json(path);
        const sha = String(((b.commit ?? {}) as Record<string, unknown>).sha ?? '');
        if (!SHA.test(sha)) return null;
        return { commitSha: sha, protected: b.protected === true };
      } catch (error) {
        if (error instanceof ProviderError && error.kind === 'not_found') return null;
        throw error;
      }
    },

    async getCommitTreeSha(repositoryId, commitSha) {
      const path = `/repositories/${assertRepositoryId(repositoryId)}/git/commits/${assertSha(commitSha)}`;
      try {
        const c = await json(path);
        const sha = String(((c.tree ?? {}) as Record<string, unknown>).sha ?? '');
        return SHA.test(sha) ? sha : null;
      } catch (error) {
        if (error instanceof ProviderError && error.kind === 'not_found') return null;
        throw error;
      }
    },

    async getTree(repositoryId, treeSha, recursive) {
      const path = `/repositories/${assertRepositoryId(repositoryId)}/git/trees/${assertSha(treeSha)}${recursive ? '?recursive=1' : ''}`;
      try {
        const t = await json(path);
        return { sha: String(t.sha ?? ''), tree: Array.isArray(t.tree) ? (t.tree as RawGitTreeEntry[]) : undefined, truncated: t.truncated === true };
      } catch (error) {
        if (error instanceof ProviderError && error.kind === 'not_found') return null;
        throw error;
      }
    },

    async getBlob(repositoryId, blobSha) {
      const path = `/repositories/${assertRepositoryId(repositoryId)}/git/blobs/${assertSha(blobSha)}`;
      try {
        const b = await json(path);
        if (typeof b.content !== 'string') return null;
        return { content: b.content, encoding: b.encoding === 'base64' ? 'base64' : 'utf-8', size: typeof b.size === 'number' ? b.size : b.content.length };
      } catch (error) {
        if (error instanceof ProviderError && error.kind === 'not_found') return null;
        throw error;
      }
    },
  };
}
