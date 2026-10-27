/**
 * Existing-source service: link an authorised EXISTING GitHub repository to an Xroga project, then inspect it read-only.
 *
 * Trust rules enforced here, not in a prompt:
 *  - The caller's identity is the verified owner id passed in; a repository is addressed by its immutable provider id, and the
 *    provider decides with the caller's own connected-account token whether it is visible. An id the account cannot see answers the
 *    same as one that does not exist, and no blob is read before that check passes.
 *  - Every read re-verifies (bounded age) that the connected account is still the one that linked it, the repository is still
 *    readable and still owned by the same account. A removed connection, lost access or transfer stops reads at once.
 *  - Reads are pinned to the exact base commit recorded at link time, never to a branch name that may have moved.
 *  - Sensitive files are listed but their content is never fetched.
 */
import { LIMITS, RepositoryToolError, RepositoryToolSession, validateRepositoryPath, type RepositoryToolTransport } from '../ai/repositoryTools.js';
import type { RawTreeResponse } from '../services/integrations/githubTreeSnapshot.js';
import { assertRepositoryId, type GitHubSourcePort, type RawGitTreeEntry, type RepositorySummary } from './provider.js';
import { isSensitivePath } from './sensitivePaths.js';
import type { BindingPatch, SourceBindingStore } from './store.js';
import { readCompleteTree, type CompleteTree } from './treeReader.js';
import { ExistingSourceError, ProviderError, type SourceBinding } from './types.js';

export interface ExistingSourceDeps {
  readonly store: SourceBindingStore;
  /** The connected account's token, or null when there is none or it was revoked. Never returned to a caller. */
  readonly tokenFor: (userId: string) => Promise<string | null>;
  readonly portFor: (token: string) => GitHubSourcePort;
  /** Creates (or finds) the Xroga project a binding shows up as. Failure never blocks the link. */
  readonly projectFor?: (input: { ownerId: string; repositoryFullName: string; repositoryUrl: string; branch: string }) => Promise<string | null>;
  readonly now?: () => number;
  /** How long a successful provider verification is trusted for reads. Writes (later phases) always re-verify. */
  readonly verifyMaxAgeMs?: number;
}

export interface RepositoryChoice {
  readonly id: string;
  readonly fullName: string;
  readonly ownerType: string;
  readonly private: boolean;
  readonly archived: boolean;
  readonly defaultBranch: string;
  /** What the account may do. Reads are the only thing this phase uses; writes are checked again at write time. */
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly updatedAt: string;
}

export interface VerifiedBinding {
  readonly binding: SourceBinding;
  /** Where the base branch points now, and whether it moved since the base commit. Null when it could not be read. */
  readonly head: { readonly commitSha: string; readonly moved: boolean; readonly protected: boolean } | null;
  readonly writable: boolean;
}

export interface DirectoryEntry {
  readonly path: string;
  readonly name: string;
  readonly type: 'file' | 'directory' | 'symlink' | 'submodule';
  readonly size: number | null;
  readonly sensitive: boolean;
}

const BRANCH = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*\.lock$)(?!.*[\/.]$)(?!\/)[A-Za-z0-9._\/-]{1,200}$/;
const TREE_CACHE_MAX = 12;
const DEFAULT_VERIFY_MAX_AGE_MS = 60_000;

const STATE_ERROR: Record<string, ExistingSourceError['code']> = {
  access_lost: 'REPO_PERMISSION_REVOKED', transferred: 'REPO_TRANSFERRED', account_changed: 'ACCOUNT_CHANGED', unlinked: 'BINDING_NOT_FOUND',
};

function providerToError(error: unknown): never {
  if (error instanceof ExistingSourceError) throw error;
  if (error instanceof ProviderError) {
    if (error.kind === 'rate_limited') throw new ExistingSourceError('PROVIDER_RATE_LIMITED', 'GitHub is rate limiting requests. Try again shortly.');
    if (error.kind === 'unauthorized') throw new ExistingSourceError('GITHUB_NOT_CONNECTED', 'Reconnect GitHub to continue.');
    if (error.kind === 'unavailable') throw new ExistingSourceError('PROVIDER_UNAVAILABLE', 'GitHub is unavailable right now. Try again shortly.');
    throw new ExistingSourceError('REPO_NOT_AUTHORIZED', 'That repository is not available to your connected GitHub account.');
  }
  throw error;
}

export class ExistingSourceService {
  /** Complete-tree cache. Keyed by binding id AND commit, and only reachable after the owner-checked binding lookup. */
  private readonly trees = new Map<string, { tree: CompleteTree; treeSha: string }>();

  constructor(private readonly deps: ExistingSourceDeps) {}

  private now(): number { return this.deps.now?.() ?? Date.now(); }

  private async portFor(userId: string): Promise<GitHubSourcePort> {
    const token = await this.deps.tokenFor(userId);
    if (!token) throw new ExistingSourceError('GITHUB_NOT_CONNECTED', 'Connect your GitHub account to continue.');
    return this.deps.portFor(token);
  }

  private toChoice(r: RepositorySummary): RepositoryChoice {
    return { id: r.id, fullName: r.fullName, ownerType: r.ownerType, private: r.private, archived: r.archived, defaultBranch: r.defaultBranch,
      canRead: r.permissions.pull, canWrite: r.permissions.push && !r.archived, updatedAt: r.updatedAt };
  }

  /** Repositories the connected account can read. Nothing else is listed, and nothing is fetched from any of them. */
  async listRepositories(userId: string, page = 1): Promise<{ account: { login: string }; repositories: RepositoryChoice[]; hasMore: boolean }> {
    const port = await this.portFor(userId);
    try {
      const viewer = await port.viewer();
      const { repositories, hasMore } = await port.listRepositories(page);
      return { account: { login: viewer.login }, repositories: repositories.filter((r) => r.permissions.pull).map((r) => this.toChoice(r)), hasMore };
    } catch (error) { return providerToError(error); }
  }

  /** Links an existing repository at the exact commit its chosen branch points at now. Idempotent per owner and repository. */
  async link(userId: string, input: { repositoryId: string; branch?: string }): Promise<{ binding: SourceBinding; created: boolean }> {
    if (!/^[0-9]{1,20}$/.test(String(input.repositoryId ?? ''))) throw new ExistingSourceError('INVALID_REQUEST', 'Choose a repository from the list.');
    if (input.branch !== undefined && !BRANCH.test(input.branch)) throw new ExistingSourceError('INVALID_REQUEST', 'That is not a valid branch name.');
    const port = await this.portFor(userId);
    try {
      const viewer = await port.viewer();
      // The provider answers with the caller's own token: an id the account cannot see is "not authorised", with no blob read before it.
      const repo = await port.getRepository(input.repositoryId);
      if (!repo.permissions.pull) throw new ExistingSourceError('REPO_NOT_AUTHORIZED', 'That repository is not available to your connected GitHub account.');
      const branch = input.branch ?? repo.defaultBranch;
      if (!BRANCH.test(branch)) throw new ExistingSourceError('INVALID_REQUEST', 'That is not a valid branch name.');
      let head;
      try { head = await port.getBranchHead(repo.id, branch); } catch (error) {
        if (error instanceof ProviderError && error.kind === 'empty') throw new ExistingSourceError('REPO_EMPTY', 'That repository has no commits yet.');
        throw error;
      }
      if (!head) throw new ExistingSourceError('BRANCH_NOT_FOUND', `The branch ${branch} was not found in that repository.`);

      let projectId: string | null = null;
      try { projectId = (await this.deps.projectFor?.({ ownerId: userId, repositoryFullName: repo.fullName, repositoryUrl: `https://github.com/${repo.fullName}`, branch })) ?? null; } catch { /* the binding is the authority; a missing project card is recoverable */ }

      return await this.deps.store.upsert(userId, {
        providerRepositoryId: repo.id, accountBindingId: viewer.id, accountLogin: viewer.login, installationId: null, ownerAccountId: repo.ownerId,
        repositoryFullName: repo.fullName, repositoryPrivate: repo.private, repositoryArchived: repo.archived, baseBranch: branch, baseCommitSha: head.commitSha,
        permissions: repo.permissions, projectId,
      });
    } catch (error) { return providerToError(error); }
  }

  async list(userId: string): Promise<SourceBinding[]> { return this.deps.store.list(userId); }

  private async require(userId: string, bindingId: string): Promise<SourceBinding> {
    if (!/^[0-9a-f-]{36}$/i.test(String(bindingId))) throw new ExistingSourceError('BINDING_NOT_FOUND', 'Linked repository not found.');
    const binding = await this.deps.store.get(userId, bindingId);
    if (!binding) throw new ExistingSourceError('BINDING_NOT_FOUND', 'Linked repository not found.');
    return binding;
  }

  private async mark(userId: string, binding: SourceBinding, patch: BindingPatch): Promise<SourceBinding> {
    return (await this.deps.store.update(userId, binding.id, patch)) ?? binding;
  }

  /**
   * Re-checks the binding against the provider, persists any state change and returns where things stand. `maxAgeMs` lets a read
   * trust a recent check; pass 0 to force a fresh one.
   */
  async verify(userId: string, bindingId: string, options: { maxAgeMs?: number } = {}): Promise<VerifiedBinding> {
    let binding = await this.require(userId, bindingId);
    if (binding.state === 'unlinked') throw new ExistingSourceError('BINDING_NOT_FOUND', 'Linked repository not found.');
    const maxAge = options.maxAgeMs ?? this.deps.verifyMaxAgeMs ?? DEFAULT_VERIFY_MAX_AGE_MS;
    const age = this.now() - Date.parse(binding.lastVerifiedAt);
    // A negative age (a clock that disagrees with the stored time) is never treated as recent.
    const fresh = binding.state === 'linked' && maxAge > 0 && age >= 0 && age < maxAge;
    if (fresh) return { binding, head: null, writable: binding.permissions.push && !binding.repositoryArchived };

    if (binding.state !== 'linked') return { binding, head: null, writable: false };

    const token = await this.deps.tokenFor(userId);
    if (!token) {
      binding = await this.mark(userId, binding, { state: 'access_lost', stateReason: 'The GitHub connection was removed or revoked.' });
      return { binding, head: null, writable: false };
    }
    const port = this.deps.portFor(token);
    try {
      const viewer = await port.viewer();
      if (viewer.id !== binding.accountBindingId) {
        binding = await this.mark(userId, binding, { state: 'account_changed', stateReason: 'A different GitHub account is connected now. Reconnect the original account or link the repository again.' });
        return { binding, head: null, writable: false };
      }
      let repo: RepositorySummary;
      try { repo = await port.getRepository(binding.providerRepositoryId); } catch (error) {
        if (error instanceof ProviderError && (error.kind === 'not_found' || error.kind === 'forbidden')) {
          binding = await this.mark(userId, binding, { state: 'access_lost', stateReason: 'The repository is no longer available to the connected account.' });
          return { binding, head: null, writable: false };
        }
        throw error;
      }
      if (!repo.permissions.pull) {
        binding = await this.mark(userId, binding, { state: 'access_lost', stateReason: 'Read access to the repository was removed.' });
        return { binding, head: null, writable: false };
      }
      if (repo.ownerId !== binding.ownerAccountId) {
        // The same repository id now belongs to another account. Reads and writes stop; the owner must link again on purpose.
        binding = await this.mark(userId, binding, { state: 'transferred', stateReason: 'The repository was transferred to a different owner.' });
        return { binding, head: null, writable: false };
      }
      let head: BranchHeadView | null = null;
      try {
        const h = await port.getBranchHead(binding.providerRepositoryId, binding.baseBranch);
        if (h) head = { commitSha: h.commitSha, moved: h.commitSha !== binding.baseCommitSha, protected: h.protected };
      } catch { /* the head is advisory here; the base commit stays authoritative */ }
      binding = await this.mark(userId, binding, {
        repositoryFullName: repo.fullName, repositoryPrivate: repo.private, repositoryArchived: repo.archived, permissions: repo.permissions,
        stateReason: '', verifiedAt: new Date(this.now()).toISOString(),
      });
      return { binding, head, writable: repo.permissions.push && !repo.archived };
    } catch (error) { return providerToError(error); }
  }

  /** Moves the base to where the branch points now, on purpose and recorded. Reads before this stay pinned to the old commit. */
  async refreshBase(userId: string, bindingId: string): Promise<{ binding: SourceBinding; previousCommitSha: string; changed: boolean }> {
    const verified = await this.verify(userId, bindingId, { maxAgeMs: 0 });
    this.assertActive(verified.binding);
    const port = await this.portFor(userId);
    try {
      const head = await port.getBranchHead(verified.binding.providerRepositoryId, verified.binding.baseBranch);
      if (!head) throw new ExistingSourceError('BRANCH_NOT_FOUND', `The branch ${verified.binding.baseBranch} no longer exists.`);
      const previous = verified.binding.baseCommitSha;
      if (head.commitSha === previous) return { binding: verified.binding, previousCommitSha: previous, changed: false };
      const binding = await this.mark(userId, verified.binding, { baseCommitSha: head.commitSha, indexStatus: 'not_indexed' });
      return { binding, previousCommitSha: previous, changed: true };
    } catch (error) { return providerToError(error); }
  }

  async unlink(userId: string, bindingId: string): Promise<void> {
    const binding = await this.require(userId, bindingId);
    await this.mark(userId, binding, { state: 'unlinked', stateReason: 'Unlinked by the owner.' });
    this.forget(binding.id);
  }

  /** Called when the GitHub connection is removed: every active binding stops reading at once. */
  async connectionRemoved(userId: string): Promise<number> {
    const n = await this.deps.store.markAllAccessLost(userId, 'The GitHub connection was removed.');
    for (const key of [...this.trees.keys()]) this.trees.delete(key);
    return n;
  }

  private assertActive(binding: SourceBinding): void {
    if (binding.state !== 'linked') {
      throw new ExistingSourceError(STATE_ERROR[binding.state] ?? 'BINDING_NOT_ACTIVE', binding.stateReason || 'This linked repository is not active.');
    }
  }

  private forget(bindingId: string): void {
    for (const key of [...this.trees.keys()]) if (key.startsWith(`${bindingId}:`)) this.trees.delete(key);
  }

  private async completeTree(binding: SourceBinding, port: GitHubSourcePort): Promise<{ tree: CompleteTree; treeSha: string }> {
    const key = `${binding.id}:${binding.baseCommitSha}`;
    const hit = this.trees.get(key);
    if (hit) { this.trees.delete(key); this.trees.set(key, hit); return hit; }
    const treeSha = await port.getCommitTreeSha(binding.providerRepositoryId, binding.baseCommitSha);
    if (!treeSha) throw new ExistingSourceError('SOURCE_UNREADABLE', 'The base commit could not be read. It may have been removed from the repository.');
    const tree = await readCompleteTree(port, binding.providerRepositoryId, treeSha);
    if (tree.entries.length === 0 && !tree.complete) throw new ExistingSourceError('SOURCE_UNREADABLE', 'The repository listing could not be read.');
    const value = { tree, treeSha };
    this.trees.set(key, value);
    while (this.trees.size > TREE_CACHE_MAX) this.trees.delete(this.trees.keys().next().value as string);
    return value;
  }

  /** One directory level at the base commit. Sensitive files are listed and marked; their content is never offered. */
  async listDirectory(userId: string, bindingId: string, options: { path?: string } = {}) {
    const { binding } = await this.verify(userId, bindingId);
    this.assertActive(binding);
    const dir = options.path ? this.safePath(options.path) : '';
    const port = await this.portFor(userId);
    try {
      const { tree } = await this.completeTree(binding, port);
      const children = new Map<string, DirectoryEntry>();
      const prefix = dir ? `${dir}/` : '';
      for (const entry of tree.entries) {
        const path = entry.path;
        if (typeof path !== 'string' || (prefix && !path.startsWith(prefix))) continue;
        const rest = path.slice(prefix.length);
        if (!rest || rest.includes('/')) continue; // only direct children; deeper entries appear when their directory is opened
        children.set(rest, {
          path, name: rest, size: typeof entry.size === 'number' ? entry.size : null,
          type: entry.mode === '120000' ? 'symlink' : entry.type === 'commit' ? 'submodule' : entry.type === 'tree' ? 'directory' : 'file',
          sensitive: entry.type === 'blob' && isSensitivePath(path),
        });
      }
      // A directory that exists only because a deeper file was seen in a partial listing is still a real directory.
      for (const entry of tree.entries) {
        const path = entry.path;
        if (typeof path !== 'string' || (prefix && !path.startsWith(prefix))) continue;
        const rest = path.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash > 0 && !children.has(rest.slice(0, slash))) children.set(rest.slice(0, slash), { path: prefix + rest.slice(0, slash), name: rest.slice(0, slash), type: 'directory', size: null, sensitive: false });
      }
      const sorted = [...children.values()].sort((a, b) => (a.type === 'directory' ? 0 : 1) - (b.type === 'directory' ? 0 : 1) || a.name.localeCompare(b.name));
      const entries = sorted.slice(0, LIMITS.maxTreeEntries);
      return {
        commitSha: binding.baseCommitSha, path: dir, entries, truncated: sorted.length > entries.length,
        // `complete: false` means the repository listing itself is partial: absent files here are NOT proven absent.
        complete: tree.complete, partialReason: tree.partialReason ?? null, totalEntriesKnown: tree.entries.length, mode: tree.mode,
      };
    } catch (error) { return providerToError(error); }
  }

  private safePath(path: string): string {
    try { return validateRepositoryPath('read_file', path); } catch (error) {
      if (error instanceof RepositoryToolError) throw new ExistingSourceError('INVALID_REQUEST', 'That is not a valid repository path.');
      throw error;
    }
  }

  /** Reads one file at the base commit through the existing bounded, redacting repository tool session. */
  async readFile(userId: string, bindingId: string, options: { path: string; startLine?: number; endLine?: number }) {
    const { binding } = await this.verify(userId, bindingId);
    this.assertActive(binding);
    const path = this.safePath(options.path);
    // Refused before any provider call: the content of a credential file is never fetched.
    if (isSensitivePath(path)) throw new ExistingSourceError('SENSITIVE_PATH', 'This file can hold credentials, so its content is never read or shown.');
    const port = await this.portFor(userId);
    try {
      const { tree, treeSha } = await this.completeTree(binding, port);
      const transport: RepositoryToolTransport = {
        getCommitTreeSha: async () => treeSha,
        getTree: async (): Promise<RawTreeResponse | null> => {
          if (tree.complete) return { sha: treeSha, tree: tree.entries, truncated: false };
          // The listing is partial: resolve exactly the requested path by walking its directories, so the answer for THIS path is exact.
          return { sha: treeSha, tree: await this.pathChain(port, binding.providerRepositoryId, treeSha, path), truncated: false };
        },
        getBlob: async (sha) => port.getBlob(binding.providerRepositoryId, sha),
      };
      const [owner, repo] = binding.repositoryFullName.split('/');
      const session = new RepositoryToolSession(transport, { owner: owner ?? '', repo: repo ?? '', commitSha: binding.baseCommitSha, ref: binding.baseBranch });
      const ranged = options.startLine !== undefined && options.endLine !== undefined;
      const result = ranged
        ? await session.readFileRange({ path, startLine: options.startLine!, endLine: options.endLine! })
        : await session.readFile({ path });
      const evidence = session.evidence[session.evidence.length - 1];
      return {
        commitSha: binding.baseCommitSha, path, content: result.data.content, blobSha: result.data.blobSha,
        truncated: 'truncated' in result.data ? Boolean(result.data.truncated) : false, redactions: evidence?.redactions ?? 0,
        ...(ranged ? { startLine: (result.data as { startLine: number }).startLine, endLine: (result.data as { endLine: number }).endLine } : {}),
      };
    } catch (error) {
      if (error instanceof RepositoryToolError) {
        if (error.refusal === 'not_found') throw new ExistingSourceError('SOURCE_UNREADABLE', 'That file does not exist at the linked commit.');
        if (error.refusal === 'too_large') throw new ExistingSourceError('SOURCE_UNREADABLE', error.message);
        if (error.refusal === 'binary_content') throw new ExistingSourceError('SOURCE_UNREADABLE', 'That file is binary and is not shown as text.');
        if (error.refusal === 'symlink_path' || error.refusal === 'submodule_path') throw new ExistingSourceError('SOURCE_UNREADABLE', error.message);
        if (error.refusal === 'budget_exhausted') throw new ExistingSourceError('PROVIDER_RATE_LIMITED', error.message);
        throw new ExistingSourceError('SOURCE_UNREADABLE', 'That file could not be read.');
      }
      return providerToError(error);
    }
  }

  /** The tree entries along one path (each directory fetched non-recursively), with full paths. */
  private async pathChain(port: GitHubSourcePort, repositoryId: string, rootTreeSha: string, path: string): Promise<RawGitTreeEntry[]> {
    assertRepositoryId(repositoryId);
    const chain: RawGitTreeEntry[] = [];
    let current = rootTreeSha;
    let prefix = '';
    for (const segment of path.split('/')) {
      const level = await port.getTree(repositoryId, current, false);
      const entry = level?.tree?.find((e) => e.path === segment);
      if (!entry || typeof entry.sha !== 'string') return chain;
      prefix = prefix ? `${prefix}/${segment}` : segment;
      chain.push({ ...entry, path: prefix });
      if (entry.type !== 'tree') return chain;
      current = entry.sha;
    }
    return chain;
  }
}

interface BranchHeadView { commitSha: string; moved: boolean; protected: boolean }
