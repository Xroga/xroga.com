/**
 * An in-memory git host for delivery tests: real git blob hashes, branches, a compare-and-swap ref update that refuses a
 * non-fast-forward, protected branches, draft pull requests, and failure injection. It implements the same transport the production
 * writer uses, so a test exercises the real `writeAtomically` against a faithful repository.
 */
import { createHash } from 'node:crypto';
import type { AtomicWriteApi, PullRequestResult, RefUpdateOutcome } from '../../services/integrations/githubAtomicWrite.js';
import type { BranchProtectionApi } from '../../services/integrations/githubBranchAuthorization.js';
import type { ResolvedTreeEntry } from '../../services/integrations/githubMutationPlan.js';
import type { RawTreeResponse } from '../../services/integrations/githubTreeSnapshot.js';
import { gitBlobSha } from '../archive/archivePort.js';

interface Commit { tree: string; parent: string | null; message: string }
const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');

export class GitFake implements AtomicWriteApi, BranchProtectionApi {
  readonly branches = new Map<string, string>();
  readonly commits = new Map<string, Commit>();
  readonly trees = new Map<string, Map<string, string>>();
  readonly blobs = new Map<string, string>();
  readonly pullRequests: Array<{ head: string; base: string; title: string; body: string; draft: boolean; number: number }> = [];
  readonly calls: string[] = [];
  protectedBranches = new Set<string>();
  failPullRequest = false;
  /** Make the commit land and then fail the call, as if the response was lost. */
  loseResponseAfterRefUpdate = false;
  private counter = 0;

  /** Starts a repository with these files at `main`; returns the commit sha. */
  seed(files: readonly { path: string; content: string }[], branch = 'main', forcedSha?: string): string {
    const tree = new Map(files.map((f) => [f.path, this.putBlob(f.content)]));
    const sha = this.putCommit(tree, null, 'seed', branch);
    if (!forcedSha) return sha;
    // present the same commit under the sha another model of this repository (the read fake) already gave it
    this.commits.set(forcedSha, this.commits.get(sha)!); this.branches.set(branch, forcedSha);
    return forcedSha;
  }

  private putBlob(content: string): string { const sha = gitBlobSha(content); this.blobs.set(sha, content); return sha; }
  private putTree(tree: Map<string, string>): string { const sha = sha1(`tree:${[...tree].sort().map(([p, s]) => `${p}=${s}`).join('|')}`); this.trees.set(sha, new Map(tree)); return sha; }
  private putCommit(tree: Map<string, string>, parent: string | null, message: string, branch?: string): string {
    const sha = sha1(`commit:${++this.counter}:${this.putTree(tree)}:${parent}:${message}`);
    this.commits.set(sha, { tree: this.putTree(tree), parent, message });
    if (branch) this.branches.set(branch, sha);
    return sha;
  }
  /** Moves a branch on the "remote" as another person would, with the given file edits applied. */
  advance(branch: string, edits: Record<string, string | null>): string {
    const head = this.branches.get(branch)!; const tree = new Map(this.trees.get(this.commits.get(head)!.tree)!);
    for (const [p, c] of Object.entries(edits)) { if (c === null) tree.delete(p); else tree.set(p, this.putBlob(c)); }
    return this.putCommit(tree, head, 'remote edit', branch);
  }
  fileAt(branch: string, path: string): string | null { const sha = this.trees.get(this.commits.get(this.branches.get(branch) ?? '')?.tree ?? '')?.get(path); return sha ? this.blobs.get(sha) ?? null : null; }

  async getRef(branch: string) { this.calls.push(`getRef:${branch}`); const sha = this.branches.get(branch); return sha ? { sha } : null; }
  async createRef(branch: string, sha: string) { this.calls.push(`createRef:${branch}`); if (this.branches.has(branch)) return false; this.branches.set(branch, sha); return true; }
  async getCommitTreeSha(commitSha: string) { this.calls.push(`getCommitTreeSha:${commitSha.slice(0, 7)}`); return this.commits.get(commitSha)?.tree ?? null; }
  async getTree(treeSha: string): Promise<RawTreeResponse | null> {
    const t = this.trees.get(treeSha); if (!t) return null;
    return { sha: treeSha, truncated: false, tree: [...t].map(([path, sha]) => ({ path, mode: '100644', type: 'blob', sha })) };
  }
  async initializeEmptyRepository(): Promise<{ commitSha: string }> { throw new Error('not empty'); }
  async createBlob(content: string) { this.calls.push('createBlob'); return this.putBlob(content); }
  async createTree(baseTreeSha: string | null, entries: ResolvedTreeEntry[]) {
    this.calls.push('createTree');
    const tree = new Map(baseTreeSha ? this.trees.get(baseTreeSha) ?? [] : []);
    for (const e of entries) { if (e.sha === null) tree.delete(e.path); else tree.set(e.path, e.sha); }
    return this.putTree(tree);
  }
  async createCommit(message: string, treeSha: string, parentSha: string | null) {
    this.calls.push('createCommit');
    const sha = sha1(`commit:${++this.counter}:${treeSha}:${parentSha}:${message}`);
    this.commits.set(sha, { tree: treeSha, parent: parentSha, message });
    return sha;
  }
  async updateRef(branch: string, commitSha: string): Promise<RefUpdateOutcome> {
    this.calls.push(`updateRef:${branch}`);
    const current = this.branches.get(branch);
    if (current !== this.commits.get(commitSha)?.parent) return { ok: false, conflict: true, detail: 'not a fast-forward' };
    this.branches.set(branch, commitSha);
    if (this.loseResponseAfterRefUpdate) { this.loseResponseAfterRefUpdate = false; throw new Error('connection reset after the ref moved'); }
    return { ok: true };
  }
  async isRepositoryEmpty() { return false; }
  async isBranchProtected(branch: string) { return this.protectedBranches.has(branch); }
  async openPullRequest(input: { head: string; base: string; title: string; body: string; draft?: boolean }): Promise<PullRequestResult> {
    this.calls.push(`openPullRequest:${input.head}`);
    if (this.failPullRequest) throw new Error('GitHub pull request creation failed (422)');
    if (this.pullRequests.some((p) => p.head === input.head)) throw new Error('GitHub pull request creation failed (422): a pull request already exists');
    const number = this.pullRequests.length + 1;
    this.pullRequests.push({ ...input, draft: input.draft === true, number });
    return { number, htmlUrl: `https://github.com/acme/cart/pull/${number}` };
  }
}
