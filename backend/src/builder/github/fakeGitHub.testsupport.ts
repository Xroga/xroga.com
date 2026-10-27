import type { ProjectFile } from '../../ai/patches.js';
import { gitBlobSha } from './restPort.js';
import { GitHubPortError, type GitHubOwner, type GitHubPort, type GitHubRepo, type GitHubViewer, type PushResult } from './port.js';

/**
 * In-memory GitHub for tests. It enforces real semantics (ownership, name uniqueness, fast-forward
 * only pushes) and can simulate the provider failures that matter: a timeout after the repository
 * was created, a timeout before it was, a remote that moved, a corrupted push, a revoked token.
 */
interface FakeUser {
  id: number;
  login: string;
  scopes: string[] | null;
  orgs: Array<{ login: string; id: number }>;
}

interface FakeCommit {
  readonly sha: string;
  readonly parent: string | null;
  readonly files: Map<string, string>;
  readonly message: string;
}

interface FakeRepo extends GitHubRepo {
  readonly branches: Map<string, string>;
  readonly commits: Map<string, FakeCommit>;
}

export interface FakeFailures {
  createRepo?: 'timeout_after_create' | 'timeout_before_create' | 'forbidden' | 'wrong_owner';
  push?: 'tamper' | 'unavailable';
}

export class FakeGitHub implements GitHubPort {
  readonly users = new Map<string, FakeUser>();
  readonly repos = new Map<string, FakeRepo>();
  readonly calls: string[] = [];
  failures: FakeFailures = {};
  private nextId = 1000;
  private nextCommit = 1;

  addUser(token: string, user: FakeUser): void {
    this.users.set(token, user);
  }

  private user(token: string): FakeUser {
    const user = this.users.get(token);
    if (!user) throw new GitHubPortError('unauthorized', 'bad credentials');
    return user;
  }

  repo(owner: string, name: string): FakeRepo | undefined {
    return this.repos.get(`${owner.toLowerCase()}/${name.toLowerCase()}`);
  }

  /** Simulates someone else pushing to the repository. */
  externalPush(owner: string, name: string, branch: string, files: Record<string, string>): string {
    const repo = this.repo(owner, name)!;
    const sha = `ext${this.nextCommit++}`.padEnd(40, '0');
    repo.commits.set(sha, { sha, parent: repo.branches.get(branch) ?? null, files: new Map(Object.entries(files).map(([path, content]) => [path, gitBlobSha(content)])), message: 'external' });
    repo.branches.set(branch, sha);
    return sha;
  }

  async viewer(token: string): Promise<GitHubViewer> {
    this.calls.push('viewer');
    const user = this.user(token);
    return { id: user.id, login: user.login, scopes: user.scopes ?? [], scopesKnown: user.scopes !== null };
  }

  async listOwners(token: string, viewer: GitHubViewer): Promise<GitHubOwner[]> {
    this.calls.push('listOwners');
    const user = this.user(token);
    return [{ login: viewer.login, id: viewer.id, type: 'User' }, ...user.orgs.map((org) => ({ login: org.login, id: org.id, type: 'Organization' as const }))];
  }

  async getRepo(token: string, owner: string, name: string): Promise<GitHubRepo | null> {
    this.calls.push(`getRepo ${owner}/${name}`);
    this.user(token);
    const repo = this.repo(owner, name);
    return repo ? { id: repo.id, owner: repo.owner, name: repo.name, private: repo.private, htmlUrl: repo.htmlUrl, description: repo.description, defaultBranch: repo.defaultBranch } : null;
  }

  async createRepo(token: string, input: { owner: GitHubOwner; viewerLogin: string; name: string; private: boolean; description: string }): Promise<GitHubRepo> {
    this.calls.push(`createRepo ${input.owner.login}/${input.name}`);
    const user = this.user(token);
    if (this.failures.createRepo === 'forbidden') throw new GitHubPortError('forbidden_owner', 'GitHub denied this action (create repository).');
    if (this.failures.createRepo === 'timeout_before_create') throw new GitHubPortError('unavailable', 'GitHub could not be reached.', true);
    if (input.owner.type === 'Organization' && !user.orgs.some((org) => org.id === input.owner.id)) throw new GitHubPortError('forbidden_owner', 'not a member');
    if (this.repo(input.owner.login, input.name)) throw new GitHubPortError('name_taken', 'exists');
    const ownerId = this.failures.createRepo === 'wrong_owner' ? 999_999 : input.owner.id;
    const repo: FakeRepo = {
      id: this.nextId++, owner: { login: input.owner.login, id: ownerId }, name: input.name, private: input.private, description: input.description,
      htmlUrl: `https://github.com/${input.owner.login}/${input.name}`, defaultBranch: 'main', branches: new Map(), commits: new Map(),
    };
    const initial: FakeCommit = { sha: `init${repo.id}`.padEnd(40, '0'), parent: null, files: new Map([['README.md', gitBlobSha('# init')]]), message: 'Initial commit' };
    repo.commits.set(initial.sha, initial);
    repo.branches.set('main', initial.sha);
    this.repos.set(`${input.owner.login.toLowerCase()}/${input.name.toLowerCase()}`, repo);
    if (this.failures.createRepo === 'timeout_after_create') throw new GitHubPortError('unavailable', 'GitHub could not be reached.', true);
    return repo;
  }

  async getHead(token: string, owner: string, repo: string, branch: string): Promise<string | null> {
    this.user(token);
    return this.repo(owner, repo)?.branches.get(branch) ?? null;
  }

  async pushFiles(token: string, input: { owner: string; repo: string; branch: string; files: readonly ProjectFile[]; message: string; expectedHead?: string | null }): Promise<PushResult> {
    this.calls.push(`push ${input.owner}/${input.repo}`);
    this.user(token);
    if (this.failures.push === 'unavailable') throw new GitHubPortError('unavailable', 'GitHub is temporarily unavailable.', false);
    const repo = this.repo(input.owner, input.repo);
    if (!repo) throw new GitHubPortError('not_found', 'no such repository');
    const head = repo.branches.get(input.branch) ?? null;
    if (input.expectedHead !== undefined && head !== input.expectedHead) return { kind: 'diverged', remoteHead: head };
    const sha = `c${this.nextCommit++}`.padEnd(40, '0');
    const stored = new Map(input.files.map((file) => [file.path, gitBlobSha(file.content)]));
    if (this.failures.push === 'tamper') stored.set('injected.txt', gitBlobSha('not pushed by xroga'));
    repo.commits.set(sha, { sha, parent: head, files: stored, message: input.message });
    repo.branches.set(input.branch, sha);
    const expected = new Map(input.files.map((file) => [file.path, gitBlobSha(file.content)]));
    const matches = expected.size === stored.size && [...expected].every(([path, blob]) => stored.get(path) === blob);
    if (!matches) return { kind: 'verification_failed', commitSha: sha, reason: 'GitHub holds a different number of files than were pushed.' };
    return { kind: 'pushed', commitSha: sha, treeSha: `tree${sha}`.slice(0, 40), parentSha: head, verifiedFiles: input.files.length };
  }
}
