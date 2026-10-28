import {isBuilderSecurityDenial} from '../providerAuthority.js';
import {AuthorityError} from '../../security/authority/enforce.js';
import {EgressDenied} from '../../security/egress/egressPolicy.js';
import { createHash } from 'node:crypto';

import type { ProjectFile } from '../../ai/patches.js';
import { ghFetch } from '../../services/integrations/githubDeploy.js';
import { readRepositoryResponse } from '../../services/integrations/githubRepoCreation.js';
import { GitHubPortError, type GitHubOwner, type GitHubPort, type GitHubRepo, type GitHubViewer, type PushResult } from './port.js';

/** The existing authorized GitHub transport: (token, path, init) => Response. Injected in tests. */
export type GitHubTransport = (token: string, path: string, init?: RequestInit) => Promise<Response>;

const BLOB_CONCURRENCY = 6;

export const gitBlobSha = (content: string): string => {
  const data = Buffer.from(content, 'utf8');
  return createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
};

async function json<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

function failureFor(response: Response, action: string, ambiguousOnServerError: boolean): GitHubPortError {
  const status = response.status;
  if (status === 401) return new GitHubPortError('unauthorized', 'GitHub rejected the connection. Reconnect your GitHub account in Xroga.');
  if (status === 403) {
    if (response.headers.get('x-ratelimit-remaining') === '0') return new GitHubPortError('rate_limited', 'GitHub is rate limiting requests. Try again shortly.');
    const scopes = response.headers.get('x-oauth-scopes');
    if (scopes !== null && !/\brepo\b/.test(scopes)) return new GitHubPortError('forbidden_scope', 'Your GitHub connection lacks the "repo" permission needed to create private repositories. Reconnect GitHub and approve it.');
    return new GitHubPortError('forbidden_owner', `GitHub denied this action (${action}). The account may lack permission to create repositories there.`);
  }
  if (status === 404) return new GitHubPortError('not_found', `GitHub could not find the resource (${action}).`);
  if (status === 409 || status === 422) return new GitHubPortError('validation', `GitHub rejected the request (${action}).`);
  if (status >= 500) return new GitHubPortError('unavailable', 'GitHub is temporarily unavailable.', ambiguousOnServerError);
  return new GitHubPortError('unavailable', `GitHub returned an unexpected response (${action}).`, ambiguousOnServerError);
}

export function createRestGitHubPort(transport: GitHubTransport = ghFetch): GitHubPort {
  const call = async (token: string, path: string, init: RequestInit | undefined, action: string, ambiguous = false): Promise<Response> => {
    try {
      return await transport(token, path, init);
    } catch (error) {
      if(isBuilderSecurityDenial(error))throw error;
      throw new GitHubPortError('unavailable', 'GitHub could not be reached.', ambiguous);
    }
  };
  const body = (value: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const toRepo = (raw: unknown): GitHubRepo | null => {
    const parsed = readRepositoryResponse(raw);
    const extra = raw as { owner?: { login?: string; id?: number }; description?: string | null; name?: string };
    if (!parsed || typeof extra.owner?.id !== 'number' || typeof extra.owner.login !== 'string') return null;
    return { id: parsed.id, owner: { login: extra.owner.login, id: extra.owner.id }, name: parsed.repo, private: parsed.visibility === 'private', htmlUrl: parsed.htmlUrl, description: extra.description ?? null, defaultBranch: parsed.defaultBranch };
  };

  return {
    async viewer(token): Promise<GitHubViewer> {
      const response = await call(token, '/user', undefined, 'read account');
      if (!response.ok) throw failureFor(response, 'read account', false);
      const user = await json<{ id?: number; login?: string }>(response);
      if (typeof user.id !== 'number' || typeof user.login !== 'string') throw new GitHubPortError('unavailable', 'GitHub returned an unexpected account response.');
      const header = response.headers.get('x-oauth-scopes');
      return { id: user.id, login: user.login, scopes: header ? header.split(',').map((scope) => scope.trim()).filter(Boolean) : [], scopesKnown: header !== null };
    },

    async listOwners(token, viewer): Promise<GitHubOwner[]> {
      const owners: GitHubOwner[] = [{ login: viewer.login, id: viewer.id, type: 'User' }];
      const response = await call(token, '/user/orgs?per_page=100', undefined, 'list organizations');
      if (!response.ok) throw failureFor(response, 'list organizations', false);
      for (const org of await json<Array<{ login?: string; id?: number }>>(response)) {
        if (typeof org.login === 'string' && typeof org.id === 'number') owners.push({ login: org.login, id: org.id, type: 'Organization' });
      }
      return owners;
    },

    async getRepo(token, owner, name): Promise<GitHubRepo | null> {
      const response = await call(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, undefined, 'read repository');
      if (response.status === 404) return null;
      if (!response.ok) throw failureFor(response, 'read repository', false);
      const repo = toRepo(await json<unknown>(response));
      if (!repo) throw new GitHubPortError('unavailable', 'GitHub returned an unexpected repository response.');
      // A renamed or transferred repository redirects; only the exact repository asked for counts.
      if (repo.owner.login.toLowerCase() !== owner.toLowerCase() || repo.name.toLowerCase() !== name.toLowerCase()) return null;
      return repo;
    },

    async createRepo(token, input): Promise<GitHubRepo> {
      const path = input.owner.login.toLowerCase() === input.viewerLogin.toLowerCase() && input.owner.type === 'User' ? '/user/repos' : `/orgs/${encodeURIComponent(input.owner.login)}/repos`;
      // auto_init gives the repository an initial commit so the Git Data API can write to it.
      const response = await call(token, path, body({ name: input.name, description: input.description, private: input.private, auto_init: true, has_issues: true }), 'create repository', true);
      if (response.status === 422) throw new GitHubPortError('name_taken', 'A repository with that name already exists, or the name is not allowed.');
      if (!response.ok) throw failureFor(response, 'create repository', true);
      const repo = toRepo(await json<unknown>(response));
      if (!repo) throw new GitHubPortError('unavailable', 'GitHub created a repository but returned an unreadable response.', true);
      if (repo.owner.id !== input.owner.id) throw new GitHubPortError('forbidden_owner', 'GitHub created the repository under a different owner than the one approved.', true);
      return repo;
    },

    async getHead(token, owner, repo, branch): Promise<string | null> {
      const response = await call(token, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${branch}`, undefined, 'read branch');
      if (response.status === 404 || response.status === 409) return null;
      if (!response.ok) throw failureFor(response, 'read branch', false);
      const ref = await json<{ object?: { sha?: string } }>(response);
      return ref.object?.sha ?? null;
    },

    async pushFiles(token, input): Promise<PushResult> {
      const base = `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`;
      const head = await this.getHead(token, input.owner, input.repo, input.branch);
      if (input.expectedHead !== undefined && head !== input.expectedHead) return { kind: 'diverged', remoteHead: head };

      const blobShas = new Map<string, string>();
      const queue = [...input.files];
      const worker = async () => {
        for (let file = queue.shift(); file; file = queue.shift()) {
          const response = await call(token, `${base}/git/blobs`, body({ content: Buffer.from(file.content, 'utf8').toString('base64'), encoding: 'base64' }), 'upload file');
          if (!response.ok) throw failureFor(response, 'upload file', false);
          const created = await json<{ sha?: string }>(response);
          if (!created.sha) throw new GitHubPortError('unavailable', 'GitHub returned an unreadable upload response.');
          blobShas.set(file.path, created.sha);
        }
      };
      await Promise.all(Array.from({ length: Math.min(BLOB_CONCURRENCY, queue.length) }, worker));

      const treeResponse = await call(token, `${base}/git/trees`, body({ tree: input.files.map((file) => ({ path: file.path, mode: '100644', type: 'blob', sha: blobShas.get(file.path) })) }), 'create tree');
      if (!treeResponse.ok) throw failureFor(treeResponse, 'create tree', false);
      const tree = await json<{ sha?: string }>(treeResponse);
      if (!tree.sha) throw new GitHubPortError('unavailable', 'GitHub returned an unreadable tree response.');

      const commitResponse = await call(token, `${base}/git/commits`, body({ message: input.message, tree: tree.sha, parents: head ? [head] : [] }), 'create commit');
      if (!commitResponse.ok) throw failureFor(commitResponse, 'create commit', false);
      const commit = await json<{ sha?: string }>(commitResponse);
      if (!commit.sha) throw new GitHubPortError('unavailable', 'GitHub returned an unreadable commit response.');

      // Move the branch without force: a remote that advanced meanwhile is reported, never overwritten.
      const refResponse = head
        ? await call(token, `${base}/git/refs/heads/${input.branch}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sha: commit.sha, force: false }) }, 'update branch', true)
        : await call(token, `${base}/git/refs`, body({ ref: `refs/heads/${input.branch}`, sha: commit.sha }), 'create branch', true);
      if (refResponse.status === 422 || refResponse.status === 409) return { kind: 'diverged', remoteHead: await this.getHead(token, input.owner, input.repo, input.branch).catch(() => null) };
      if (!refResponse.ok) throw failureFor(refResponse, 'update branch', true);

      // Read back what GitHub actually stored and compare it with what was pushed.
      const stored = await call(token, `${base}/git/commits/${commit.sha}`, undefined, 'verify commit');
      if (!stored.ok) throw failureFor(stored, 'verify commit', false);
      const storedCommit = await json<{ tree?: { sha?: string } }>(stored);
      if (storedCommit.tree?.sha !== tree.sha) return { kind: 'verification_failed', commitSha: commit.sha, reason: 'The stored commit does not point at the tree that was pushed.' };
      const listing = await call(token, `${base}/git/trees/${tree.sha}?recursive=1`, undefined, 'verify files');
      if (!listing.ok) throw failureFor(listing, 'verify files', false);
      const remote = await json<{ truncated?: boolean; tree?: Array<{ path?: string; type?: string; sha?: string }> }>(listing);
      if (remote.truncated) return { kind: 'verification_failed', commitSha: commit.sha, reason: 'GitHub truncated the file listing, so the push could not be fully verified.' };
      const remoteShas = new Map((remote.tree ?? []).filter((entry) => entry.type === 'blob' && entry.path && entry.sha).map((entry) => [entry.path as string, entry.sha as string]));
      for (const file of input.files) {
        if (remoteShas.get(file.path) !== gitBlobSha(file.content)) return { kind: 'verification_failed', commitSha: commit.sha, reason: `GitHub's copy of ${file.path} does not match the pushed source.` };
      }
      if (remoteShas.size !== input.files.length) return { kind: 'verification_failed', commitSha: commit.sha, reason: 'GitHub holds a different number of files than were pushed.' };
      return { kind: 'pushed', commitSha: commit.sha, treeSha: tree.sha, parentSha: head, verifiedFiles: input.files.length };
    },
  };
}

