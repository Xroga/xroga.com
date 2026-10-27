/**
 * Delivery of a verified change: a draft pull request on a NEW review branch through the existing atomic GitHub writer, or a patch / ZIP export.
 *
 * Authority and safety are re-established at delivery time, not trusted from when the change was made:
 *  - the binding is re-verified against GitHub right now (same account, repository still readable, same owner) and must be a GitHub
 *    repository the account can push to; an imported ZIP is exported, never pushed;
 *  - the remote head of the base branch is re-read. If it moved, every changed path is compared between the base and the new head:
 *    an untouched path rebases (the receipt says it was rebased and that the tests ran against the old base, so a retest is needed);
 *    a path that changed on the remote is reported as a structured conflict and nothing is written;
 *  - the branch is new and deterministic (`xroga/change-<id>-<digest>`), never the base or a protected branch; nothing is force-pushed;
 *  - credentials in the change, workflow files and `.git` paths are refused before any remote call;
 *  - delivery is idempotent: the same change content never creates a second branch or PR, and a branch left by a lost response is
 *    adopted only when its files hash to exactly this change.
 */
import { scanProjectFiles } from '../../ai/securityScan.js';
import { writeAtomically, AtomicWriteError, type AtomicWriteApi, type AtomicWriteRecord } from '../../services/integrations/githubAtomicWrite.js';
import type { BranchProtectionApi } from '../../services/integrations/githubBranchAuthorization.js';
import type { MutationRequest } from '../../services/integrations/githubMutationPlan.js';
import { readStartingTree } from '../../services/integrations/githubTreeSnapshot.js';
import { writeZip } from '../archive/zipWriter.js';
import type { ExistingSourceService } from '../service.js';
import { ExistingSourceError, type SourceBinding } from '../types.js';
import { gitBlobSha } from '../archive/archivePort.js';
import type { ChangeStore } from './store.js';
import type { ChangeTask, DeliveryReceipt, ResultFile } from './types.js';
import { unifiedDiff } from './unifiedDiff.js';

export type DeliveryApi = AtomicWriteApi & BranchProtectionApi;

export interface DeliveryDeps {
  readonly source: ExistingSourceService;
  readonly store: ChangeStore;
  /** The authenticated write transport for one repository, built from the connected account's own token. */
  readonly apiFor: (userId: string, binding: SourceBinding) => Promise<DeliveryApi>;
  readonly now?: () => number;
}

export interface DeliveryConflict { readonly path: string; readonly baseBlobSha: string | null; readonly remoteBlobSha: string | null; readonly reason: 'changed_on_remote' | 'created_on_remote' | 'deleted_on_remote' }

export type DeliveryOutcome =
  | { readonly status: 'delivered'; readonly receipt: DeliveryReceipt; readonly task: ChangeTask; readonly alreadyDelivered: boolean }
  | { readonly status: 'conflict'; readonly baseCommitSha: string; readonly headCommitSha: string; readonly conflicts: readonly DeliveryConflict[]; readonly exportAvailable: true };

const sha8 = (s: string) => s.slice(0, 8);
export const reviewBranchName = (task: Pick<ChangeTask, 'id'>, digest: string): string => `xroga/change-${task.id.replace(/[^0-9a-f]/gi, '').slice(0, 8).toLowerCase()}-${sha8(digest)}`;

function mutationsOf(result: readonly ResultFile[]): MutationRequest[] {
  return result.map((r): MutationRequest => r.kind === 'deleted' ? { kind: 'delete', path: r.path } : { kind: r.kind === 'created' ? 'create' : 'update', path: r.path, content: r.content ?? '' });
}

export class ChangeDelivery {
  constructor(private readonly deps: DeliveryDeps) {}
  private iso(): string { return new Date(this.deps.now?.() ?? Date.now()).toISOString(); }

  private async load(userId: string, changeId: string): Promise<ChangeTask> {
    const task = await this.deps.store.get(userId, changeId);
    if (!task) throw new ExistingSourceError('CHANGE_NOT_FOUND', 'Change not found.');
    return task;
  }

  private assertDeliverable(task: ChangeTask, allowUnverified: boolean): void {
    if (task.result.length === 0) throw new ExistingSourceError('DELIVERY_REFUSED', 'This change has no files to deliver.');
    if (task.status === 'verified' || task.status === 'delivered') return;
    if (task.status === 'unverified' && allowUnverified) return;
    throw new ExistingSourceError('DELIVERY_REFUSED', task.status === 'unverified' ? 'This change is not test-verified. Deliver it only by confirming that explicitly.' : `A change that is ${task.status} cannot be delivered.`);
  }

  private scan(task: ChangeTask): void {
    for (const r of task.result) {
      if (/(^|\/)\.git(\/|$)/.test(r.path) || /^\.github\/workflows\//.test(r.path) || /^\/|\.\.|\\/.test(r.path)) throw new ExistingSourceError('DELIVERY_REFUSED', `${r.path} may not be delivered by Xroga.`);
    }
    const scan = scanProjectFiles(task.result.filter((r) => r.content !== null).map((r) => ({ path: r.path, content: r.content ?? '' })));
    if (scan.blocked) throw new ExistingSourceError('DELIVERY_REFUSED', `The change contains what looks like a credential (${scan.findings.filter((f) => f.severity === 'critical').map((f) => f.path).slice(0, 3).join(', ')}). Remove it before delivery.`);
  }

  /** Draft pull request (or just the branch) for a verified change. Returns a conflict report instead of writing when the remote diverged on the same files. */
  async deliver(userId: string, changeId: string, options: { mode?: 'pull_request' | 'branch'; allowUnverified?: boolean; title?: string } = {}): Promise<DeliveryOutcome> {
    const task = await this.load(userId, changeId);
    this.assertDeliverable(task, options.allowUnverified === true);
    const revision = task.revisions[task.revisions.length - 1];
    const digest = revision?.digest ?? '';
    if (!digest) throw new ExistingSourceError('DELIVERY_REFUSED', 'This change has no recorded revision.');
    const kind: DeliveryReceipt['kind'] = options.mode === 'branch' ? 'branch' : 'pull_request';
    const existing = task.deliveries.find((d) => d.digest === digest && (d.kind === 'pull_request' || d.kind === 'branch') && (kind === 'branch' || d.kind === 'pull_request'));
    if (existing) return { status: 'delivered', receipt: existing, task, alreadyDelivered: true };
    this.scan(task);

    // authority is re-checked now, at the provider, with the caller's own token
    const verified = await this.deps.source.verify(userId, task.bindingId, { maxAgeMs: 0 });
    const binding = verified.binding;
    if (binding.originKind !== 'github') throw new ExistingSourceError('DELIVERY_REFUSED', 'An imported ZIP cannot be pushed anywhere. Export the patch or a ZIP of the changed files.');
    if (binding.state !== 'linked') throw new ExistingSourceError('DELIVERY_REFUSED', binding.stateReason || 'The link is no longer active.');
    if (!verified.writable) throw new ExistingSourceError('DELIVERY_REFUSED', 'Your connected GitHub account cannot push to this repository (or it is archived). Export the patch instead.');
    if (binding.baseCommitSha !== task.baseCommitSha) throw new ExistingSourceError('CHANGE_CONFLICT', 'The linked commit changed after this change was made. Create the change again from the new commit.');

    const api = await this.deps.apiFor(userId, binding);
    const [owner, repo] = binding.repositoryFullName.split('/');
    if (!owner || !repo) throw new ExistingSourceError('DELIVERY_REFUSED', 'The repository name is not usable.');

    const head = await api.getRef(binding.baseBranch);
    if (!head) throw new ExistingSourceError('DELIVERY_REFUSED', `The branch ${binding.baseBranch} no longer exists.`);
    let rebased = false;
    if (head.sha !== task.baseCommitSha) {
      const conflicts = await this.divergence(api, task, head.sha);
      if (conflicts.length) {
        await this.deps.store.save(userId, { ...task, events: [...task.events, { at: this.iso(), type: 'delivery.conflict', message: `The remote branch changed ${conflicts.length} file${conflicts.length === 1 ? '' : 's'} this change also touches.` }].slice(-300), updatedAt: this.iso() });
        return { status: 'conflict', baseCommitSha: task.baseCommitSha, headCommitSha: head.sha, conflicts, exportAvailable: true };
      }
      rebased = true;
    }

    const branch = reviewBranchName(task, digest);
    const adopted = await this.adoptExisting(api, branch, task);
    let record: AtomicWriteRecord | null = null;
    let adoptedPr: { number: number; htmlUrl: string } | null = null; let adoptedWarning = '';
    if (adopted && kind === 'pull_request' && api.openPullRequest) {
      try { adoptedPr = await api.openPullRequest({ head: branch, base: binding.baseBranch, title: (options.title ?? this.titleOf(task)).slice(0, 200), body: this.bodyOf(task, rebased, head.sha), draft: true }); }
      catch (error) { adoptedWarning = `The pull request could not be opened (it may already exist): ${(error as Error).message.slice(0, 160)}`; }
    }
    if (!adopted) {
      try {
        record = await writeAtomically(api, { owner, repo }, {
          branch, createBranchFromSha: head.sha, mutations: mutationsOf(task.result), defaultBranch: binding.baseBranch,
          message: `${(options.title ?? this.titleOf(task)).slice(0, 72)}\n\nXroga-Change: ${task.id}\nXroga-Digest: ${digest}\nBase: ${task.baseCommitSha}`,
          ...(kind === 'pull_request' ? { pullRequest: { base: binding.baseBranch, title: (options.title ?? this.titleOf(task)).slice(0, 200), body: this.bodyOf(task, rebased, head.sha), draft: true } } : {}),
        });
      } catch (error) {
        if (error instanceof AtomicWriteError) throw new ExistingSourceError(error.reason === 'concurrent_head_movement' ? 'CHANGE_CONFLICT' : 'DELIVERY_REFUSED', `GitHub did not accept the change (${error.reason}). ${error.branchUnchanged ? 'Nothing was written.' : 'Check the branch before retrying.'}`);
        throw error;
      }
    }
    const tested = task.status === 'verified';
    const receipt: DeliveryReceipt = {
      kind, at: this.iso(), branch, commitSha: record?.resultingCommitSha ?? adopted?.commitSha ?? null,
      pullRequestNumber: record?.pullRequest?.number ?? adoptedPr?.number ?? null, pullRequestUrl: record?.pullRequest?.htmlUrl ?? adoptedPr?.htmlUrl ?? null, baseBranch: binding.baseBranch, baseCommitSha: task.baseCommitSha, headAtDelivery: head.sha,
      rebased, verified: tested && !rebased && (record?.verified ?? true), draft: kind === 'pull_request', digest,
      note: [
        adopted ? `Adopted the review branch left by an earlier attempt after checking its files match this change exactly. ${adoptedWarning}`.trim() : record?.pullRequestWarning ?? '',
        rebased ? `The base branch moved to ${head.sha.slice(0, 7)} without touching these files. Tests ran against ${task.baseCommitSha.slice(0, 7)}; retest before merging.` : '',
        tested ? '' : 'Not test-verified.',
      ].filter(Boolean).join(' '),
    };
    const saved: ChangeTask = { ...task, status: 'delivered', statusReason: kind === 'pull_request' ? `Draft pull request ${receipt.pullRequestUrl ?? 'opened'} on ${branch}.` : `Review branch ${branch} created.`, deliveries: [...task.deliveries, receipt], events: [...task.events, { at: this.iso(), type: 'delivery.completed', message: `Delivered to ${branch}.`, data: { branch, rebased, ...(receipt.pullRequestNumber ? { pullRequest: receipt.pullRequestNumber } : {}) } }].slice(-300), updatedAt: this.iso() };
    await this.deps.store.save(userId, saved);
    return { status: 'delivered', receipt, task: saved, alreadyDelivered: false };
  }

  /** Paths this change touches whose blob differs between the base commit and the remote head. */
  private async divergence(api: DeliveryApi, task: ChangeTask, headSha: string): Promise<DeliveryConflict[]> {
    const [baseTree, headTree] = await Promise.all([readStartingTree(api, task.baseCommitSha), readStartingTree(api, headSha)]);
    const base = new Map(baseTree.entries.map((e) => [e.path, e.sha])); const remote = new Map(headTree.entries.map((e) => [e.path, e.sha]));
    const out: DeliveryConflict[] = [];
    for (const r of task.result) {
      const b = base.get(r.path) ?? null; const h = remote.get(r.path) ?? null;
      if (b === h) continue;
      out.push({ path: r.path, baseBlobSha: b, remoteBlobSha: h, reason: b === null ? 'created_on_remote' : h === null ? 'deleted_on_remote' : 'changed_on_remote' });
    }
    return out;
  }

  /** A branch from a lost earlier response is adopted only when every changed file hashes exactly to this change. */
  private async adoptExisting(api: DeliveryApi, branch: string, task: ChangeTask): Promise<{ commitSha: string } | null> {
    const ref = await api.getRef(branch);
    if (!ref) return null;
    const tree = await readStartingTree(api, ref.sha);
    const have = new Map(tree.entries.map((e) => [e.path, e.sha]));
    const matches = task.result.every((r) => (r.kind === 'deleted' ? !have.has(r.path) : have.get(r.path) === gitBlobSha(r.content ?? '')));
    if (!matches) throw new ExistingSourceError('DELIVERY_REFUSED', `The branch ${branch} already exists with different content. Nothing was written.`);
    return { commitSha: ref.sha };
  }

  private titleOf(task: ChangeTask): string { return `Xroga: ${task.instruction.replace(/\s+/g, ' ').trim().slice(0, 60)}`; }

  private bodyOf(task: ChangeTask, rebased: boolean, headSha: string): string {
    const last = task.revisions[task.revisions.length - 1];
    const lines = [
      '## What changed', task.instruction.slice(0, 1_000), '',
      '## Files', ...task.result.map((r) => `- ${r.kind} \`${r.path}\``), '',
      '## Verification',
      last?.tests ? `- ${last.tests.status === 'passed' ? 'PASSED' : last.tests.status.toUpperCase()}: ${last.tests.summary}` : '- Not run',
      task.reproduction === 'reproduced' ? '- The added test fails on the original code and passes with the change.' : task.regressionTestAdded ? `- Regression test check: ${task.reproduction.replace(/_/g, ' ')}.` : '',
      task.status === 'verified' ? '' : '- **Not test-verified.** Review carefully.',
      rebased ? `- The base branch moved to ${headSha.slice(0, 7)} after the tests ran; **retest before merging**.` : '',
      '', `Base commit \`${task.baseCommitSha.slice(0, 12)}\` · opened as a draft by Xroga · change \`${task.id}\``,
    ].filter((l, i, a) => !(l === '' && a[i - 1] === ''));
    return lines.join('\n').slice(0, 60_000);
  }

  // ---- export ----------------------------------------------------------------------------------------------------------------

  /** A `git apply`-compatible patch of the change against its exact base commit. */
  async exportPatch(userId: string, changeId: string): Promise<{ filename: string; content: string; baseCommitSha: string; digest: string }> {
    const task = await this.load(userId, changeId);
    if (task.result.length === 0) throw new ExistingSourceError('DELIVERY_REFUSED', 'This change has no files.');
    this.scan(task);
    const last = task.revisions[task.revisions.length - 1];
    const header = `# Xroga change ${task.id}\n# Base commit ${task.baseCommitSha}\n# Apply with: git apply --index change.patch\n`;
    const diff = last && !last.diffTruncated ? last.diff : task.result.map((r) => unifiedDiff(r.path, null, r.content)).join('');
    return { filename: `xroga-change-${sha8(task.id)}.patch`, content: `${header}${diff}`, baseCommitSha: task.baseCommitSha, digest: last?.digest ?? '' };
  }

  /** A ZIP of the changed files only (deleted files are listed in DELETED.txt), for when nothing can be pushed. */
  async exportZip(userId: string, changeId: string): Promise<{ filename: string; data: Buffer; baseCommitSha: string }> {
    const task = await this.load(userId, changeId);
    if (task.result.length === 0) throw new ExistingSourceError('DELIVERY_REFUSED', 'This change has no files.');
    this.scan(task);
    const files = task.result.filter((r) => r.content !== null).map((r) => ({ path: r.path, content: r.content ?? '' }));
    const deleted = task.result.filter((r) => r.kind === 'deleted').map((r) => r.path);
    if (deleted.length) files.push({ path: 'XROGA-DELETED.txt', content: `${deleted.join('\n')}\n` });
    return { filename: `xroga-change-${sha8(task.id)}.zip`, data: writeZip(files), baseCommitSha: task.baseCommitSha };
  }
}
