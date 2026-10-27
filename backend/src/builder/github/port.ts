import type { ProjectFile } from '../../ai/patches.js';

/**
 * The narrow GitHub surface the builder needs. The production adapter is built on Xroga's existing
 * authorized GitHub transport and vault-held tokens (no second authentication system); tests use an
 * in-memory fake that can simulate provider failures.
 */

export interface GitHubViewer {
  readonly id: number;
  readonly login: string;
  /** OAuth scopes the token carries, when GitHub reports them (classic tokens). Empty when unknown. */
  readonly scopes: readonly string[];
  readonly scopesKnown: boolean;
}

export interface GitHubOwner {
  readonly login: string;
  readonly id: number;
  readonly type: 'User' | 'Organization';
}

export interface GitHubRepo {
  readonly id: number;
  readonly owner: { readonly login: string; readonly id: number };
  readonly name: string;
  readonly private: boolean;
  readonly htmlUrl: string;
  readonly description: string | null;
  readonly defaultBranch: string;
}

export type PushResult =
  | { readonly kind: 'pushed'; readonly commitSha: string; readonly treeSha: string; readonly parentSha: string | null; readonly verifiedFiles: number }
  | { readonly kind: 'diverged'; readonly remoteHead: string | null }
  | { readonly kind: 'verification_failed'; readonly commitSha: string; readonly reason: string };

export type GitHubFailure =
  | 'unauthorized'
  | 'forbidden_scope'
  | 'forbidden_owner'
  | 'name_taken'
  | 'validation'
  | 'not_found'
  | 'rate_limited'
  | 'unavailable';

export class GitHubPortError extends Error {
  constructor(
    readonly code: GitHubFailure,
    message: string,
    /** True when the provider may have applied the request even though the call failed. */
    readonly ambiguous = false,
  ) {
    super(message);
    this.name = 'GitHubPortError';
  }
}

export interface GitHubPort {
  viewer(token: string): Promise<GitHubViewer>;
  listOwners(token: string, viewer: GitHubViewer): Promise<GitHubOwner[]>;
  getRepo(token: string, owner: string, name: string): Promise<GitHubRepo | null>;
  createRepo(token: string, input: { owner: GitHubOwner; viewerLogin: string; name: string; private: boolean; description: string }): Promise<GitHubRepo>;
  getHead(token: string, owner: string, repo: string, branch: string): Promise<string | null>;
  /**
   * Pushes the complete file set as ONE new commit on `branch`. Never forces. When `expectedHead` is
   * given and the remote moved, nothing is pushed and `diverged` is returned. The result is read back
   * and verified against the files pushed.
   */
  pushFiles(token: string, input: { owner: string; repo: string; branch: string; files: readonly ProjectFile[]; message: string; expectedHead?: string | null }): Promise<PushResult>;
}

/** GitHub repository names: 1 to 100 of letters, digits, dot, dash and underscore; not "." or ".."; no .git suffix. */
export function validRepositoryName(name: string): boolean {
  return /^[A-Za-z0-9._-]{1,100}$/.test(name) && name !== '.' && name !== '..' && !name.endsWith('.git') && !name.startsWith('.');
}

export function validBranchName(branch: string): boolean {
  return /^[A-Za-z0-9._/-]{1,100}$/.test(branch) && !branch.includes('..') && !branch.startsWith('/') && !branch.endsWith('/') && !branch.endsWith('.lock');
}
