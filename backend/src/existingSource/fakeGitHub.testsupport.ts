/**
 * A faithful in-memory GitHub for the existing-source tests: accounts with tokens, repositories addressed by immutable id, per-account
 * permissions, branches that move, trees (with GitHub's truncation behaviour), blobs, renames, transfers and revoked tokens.
 * Tests only. It records every call so a test can prove that a refused request read nothing.
 */
import { createHash } from 'node:crypto';
import { ProviderError } from './types.js';
import type { BranchHead, GitHubSourcePort, RawBlob, RawGitTree, RawGitTreeEntry, RepositorySummary, ViewerAccount } from './provider.js';

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

export interface FakeFile { path: string; content: string; mode?: string; type?: 'blob' | 'commit' }

interface FakeRepo {
  id: string; fullName: string; ownerId: string; ownerLogin: string; ownerType: 'User' | 'Organization'; private: boolean; archived: boolean;
  defaultBranch: string; branches: Map<string, string>; commits: Map<string, { treeSha: string }>; trees: Map<string, RawGitTreeEntry[]>; blobs: Map<string, string>;
  /** account id -> permissions; an account absent here cannot see a private repository at all. */
  access: Map<string, { pull: boolean; push: boolean; admin: boolean }>;
}

export class FakeGitHub {
  readonly calls: string[] = [];
  private readonly accounts = new Map<string, ViewerAccount>(); // token -> account
  private readonly revoked = new Set<string>();
  private readonly repos = new Map<string, FakeRepo>();
  /** recursive responses report truncated:true when the repository has more entries than this */
  recursiveLimit = 100_000;
  /** a non-recursive directory response with more entries than this is itself truncated */
  directoryLimit = 100_000;
  private nextId = 1000;

  addAccount(token: string, id: string, login: string): void { this.accounts.set(token, { id, login }); }
  revoke(token: string): void { this.revoked.add(token); }

  addRepo(input: { fullName: string; ownerId: string; ownerType?: 'User' | 'Organization'; private?: boolean; archived?: boolean; defaultBranch?: string; files: FakeFile[]; access: Record<string, { pull: boolean; push?: boolean; admin?: boolean }> }): string {
    const id = String(this.nextId++);
    const repo: FakeRepo = {
      id, fullName: input.fullName, ownerId: input.ownerId, ownerLogin: input.fullName.split('/')[0]!, ownerType: input.ownerType ?? 'User', private: input.private ?? true,
      archived: input.archived ?? false, defaultBranch: input.defaultBranch ?? 'main', branches: new Map(), commits: new Map(), trees: new Map(), blobs: new Map(),
      access: new Map(Object.entries(input.access).map(([k, v]) => [k, { pull: v.pull, push: v.push ?? false, admin: v.admin ?? false }])),
    };
    this.repos.set(id, repo);
    this.commit(id, repo.defaultBranch, input.files);
    return id;
  }

  /** Creates a new commit on a branch containing exactly these files (a full snapshot). Returns the commit sha. */
  commit(repoId: string, branch: string, files: FakeFile[]): string {
    const repo = this.repos.get(repoId)!;
    const treeSha = this.buildTree(repo, files);
    const commitSha = sha1(`${repoId}:${branch}:${treeSha}:${repo.commits.size}`);
    repo.commits.set(commitSha, { treeSha });
    repo.branches.set(branch, commitSha);
    return commitSha;
  }

  private buildTree(repo: FakeRepo, files: FakeFile[]): string {
    const byDir = new Map<string, FakeFile[]>();
    for (const f of files) { const dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''; (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(f); }
    const dirs = new Set<string>(['']);
    for (const f of files) { const parts = f.path.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/')); }
    const shaOf = new Map<string, string>();
    const depth = (d: string) => (d ? d.split('/').length : 0);
    for (const dir of [...dirs].sort((a, b) => depth(b) - depth(a))) {
      const entries: RawGitTreeEntry[] = [];
      for (const f of byDir.get(dir) ?? []) {
        const name = f.path.split('/').pop()!;
        const blobSha = f.type === 'commit' ? sha1(`submodule:${f.path}`) : sha1(`blob:${f.content}`);
        if (f.type !== 'commit') repo.blobs.set(blobSha, f.content);
        entries.push({ path: name, mode: f.mode ?? '100644', type: f.type ?? 'blob', sha: blobSha, size: f.content.length });
      }
      for (const other of dirs) {
        const parent = other.includes('/') ? other.slice(0, other.lastIndexOf('/')) : '';
        if (other && parent === dir) {
          entries.push({ path: other.split('/').pop()!, mode: '040000', type: 'tree', sha: shaOf.get(other)! });
        }
      }
      const treeSha = sha1(`tree:${repo.id}:${dir}:${JSON.stringify(entries)}`);
      repo.trees.set(treeSha, entries);
      shaOf.set(dir, treeSha);
    }
    return shaOf.get('')!;
  }

  rename(repoId: string, fullName: string): void { this.repos.get(repoId)!.fullName = fullName; }
  transfer(repoId: string, newOwnerId: string, newFullName: string, keepAccessFor: string[]): void {
    const r = this.repos.get(repoId)!; r.ownerId = newOwnerId; r.fullName = newFullName; r.ownerLogin = newFullName.split('/')[0]!;
    for (const k of [...r.access.keys()]) if (!keepAccessFor.includes(k)) r.access.delete(k);
  }
  setAccess(repoId: string, accountId: string, perms: { pull: boolean; push?: boolean; admin?: boolean } | null): void {
    const r = this.repos.get(repoId)!;
    if (perms) r.access.set(accountId, { pull: perms.pull, push: perms.push ?? false, admin: perms.admin ?? false }); else r.access.delete(accountId);
  }
  emptyRepo(repoId: string): void { const r = this.repos.get(repoId)!; r.branches.clear(); r.commits.clear(); }

  count(prefix: string): number { return this.calls.filter((c) => c.startsWith(prefix)).length; }
  reads(): number { return this.calls.filter((c) => c.startsWith('tree:') || c.startsWith('blob:') || c.startsWith('commit:')).length; }

  /** A port bound to one token, like createRestSourcePort(token). */
  port(token: string): GitHubSourcePort {
    const self = this;
    const account = (): ViewerAccount => {
      if (self.revoked.has(token) || !self.accounts.has(token)) throw new ProviderError('unauthorized', 'bad credentials');
      return self.accounts.get(token)!;
    };
    const visible = (id: string): { repo: FakeRepo; perms: { pull: boolean; push: boolean; admin: boolean } } => {
      const acc = account();
      const repo = self.repos.get(id);
      const perms = repo?.access.get(acc.id);
      // A private repository the account has no access to is indistinguishable from one that does not exist.
      if (!repo || !perms || (!perms.pull && repo.private)) throw new ProviderError('not_found', 'not found');
      return { repo, perms };
    };
    const summary = (repo: FakeRepo, perms: { pull: boolean; push: boolean; admin: boolean }): RepositorySummary => ({
      id: repo.id, fullName: repo.fullName, ownerId: repo.ownerId, ownerLogin: repo.ownerLogin, ownerType: repo.ownerType, private: repo.private, archived: repo.archived,
      defaultBranch: repo.defaultBranch, permissions: perms, updatedAt: '2026-10-27T00:00:00Z',
    });
    return {
      viewer: async () => { self.calls.push('viewer'); return account(); },
      listRepositories: async (page) => {
        self.calls.push(`list:${page}`);
        const acc = account();
        const all = [...self.repos.values()].filter((r) => r.access.has(acc.id)).map((r) => summary(r, r.access.get(acc.id)!));
        return { repositories: page === 1 ? all : [], hasMore: false };
      },
      getRepository: async (id) => { self.calls.push(`repo:${id}`); const v = visible(id); return summary(v.repo, v.perms); },
      getBranchHead: async (id, branch) => {
        self.calls.push(`branch:${id}:${branch}`);
        const { repo } = visible(id);
        if (repo.commits.size === 0) throw new ProviderError('empty', 'empty');
        const sha = repo.branches.get(branch);
        return sha ? ({ commitSha: sha, protected: branch === repo.defaultBranch } satisfies BranchHead) : null;
      },
      getCommitTreeSha: async (id, commitSha) => { self.calls.push(`commit:${id}:${commitSha.slice(0, 7)}`); return visible(id).repo.commits.get(commitSha)?.treeSha ?? null; },
      getTree: async (id, treeSha, recursive): Promise<RawGitTree | null> => {
        self.calls.push(`tree:${id}:${treeSha.slice(0, 7)}:${recursive ? 'r' : 'd'}`);
        const { repo } = visible(id);
        const entries = repo.trees.get(treeSha);
        if (!entries) return null;
        if (!recursive) return entries.length > self.directoryLimit ? { sha: treeSha, tree: entries.slice(0, self.directoryLimit), truncated: true } : { sha: treeSha, tree: entries, truncated: false };
        const flat: RawGitTreeEntry[] = [];
        const walk = (sha: string, prefix: string) => { for (const e of repo.trees.get(sha) ?? []) { const path = prefix ? `${prefix}/${e.path}` : e.path!; flat.push({ ...e, path }); if (e.type === 'tree') walk(e.sha!, path); } };
        walk(treeSha, '');
        return flat.length > self.recursiveLimit ? { sha: treeSha, tree: flat.slice(0, self.recursiveLimit), truncated: true } : { sha: treeSha, tree: flat, truncated: false };
      },
      getBlob: async (id, blobSha): Promise<RawBlob | null> => {
        self.calls.push(`blob:${id}:${blobSha.slice(0, 7)}`);
        const content = visible(id).repo.blobs.get(blobSha);
        return content === undefined ? null : { content: Buffer.from(content, 'utf8').toString('base64'), encoding: 'base64', size: Buffer.byteLength(content) };
      },
    };
  }
}
