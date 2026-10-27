/**
 * The isolated working copy of an existing project for one change: the exact base commit's files, a mutable overlay of the agent's
 * edits, and an authoritative change set computed from real before/after content.
 *
 * Nothing here writes to the source. The base is immutable; an edit is validated against the base file it was made from (its blob
 * SHA) and against the write policy before it lands; every unchanged file is preserved byte for byte. The change set is what is
 * tested, shown, exported and, after verification, delivered.
 */
import { createHash } from 'node:crypto';
import { SoftwareAgentWorkspace, type SoftwareAgentWorkspaceChange } from '../../ai/softwareAgent/SoftwareAgentWorkspace.js';
import { evaluateWritePolicy } from '../../ai/softwareAgent/writePolicy.js';
import type { SoftwareWritePolicy } from '../../ai/softwareAgent/contracts.js';
import { gitBlobSha } from '../archive/archivePort.js';
import { isSensitivePath } from '../sensitivePaths.js';
import { ExistingSourceError } from '../types.js';
import { diffStats, unifiedDiff } from './unifiedDiff.js';

export interface BaseFile { readonly path: string; readonly content: string; readonly blobSha: string }

export interface BaseSnapshot {
  readonly commitSha: string;
  readonly files: readonly BaseFile[];
  /** Files that exist at the commit but whose content is not in the working copy (credentials, binaries, vendored, oversize). */
  readonly omitted: readonly { readonly path: string; readonly reason: string }[];
  readonly complete: boolean;
  readonly incompleteReason: string | null;
}

export interface ChangePolicy {
  readonly write: SoftwareWritePolicy;
  readonly maxChangedFiles: number;
  readonly maxChangedBytes: number;
}

export const DEFAULT_MAX_CHANGED_FILES = 40;
export const DEFAULT_MAX_CHANGED_BYTES = 1024 * 1024;

export interface ChangedFile {
  readonly path: string;
  readonly kind: 'created' | 'modified' | 'deleted';
  /** The blob SHA this change was computed against, null for a new file. */
  readonly baseBlobSha: string | null;
  /** Git blob SHA of the resulting content, null for a deletion. */
  readonly resultBlobSha: string | null;
  readonly additions: number;
  readonly deletions: number;
  readonly warnings: readonly string[];
}

export interface ChangeSet {
  readonly baseCommitSha: string;
  readonly files: readonly ChangedFile[];
  readonly diff: string;
  /** Stable digest of base commit plus every path and resulting content; identical changes have identical digests. */
  readonly digest: string;
  readonly additions: number;
  readonly deletions: number;
  readonly warnings: readonly string[];
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const lineCount = (s: string) => (s === '' ? 0 : s.split('\n').length - (s.endsWith('\n') ? 1 : 0));

export class WorkspaceRefusal extends ExistingSourceError {
  constructor(message: string, readonly reason: 'policy' | 'sensitive' | 'limit' | 'conflict' | 'missing' | 'omitted') { super('INVALID_REQUEST', message); }
}

export class ChangeWorkspace {
  private readonly ws: SoftwareAgentWorkspace;
  private readonly base = new Map<string, BaseFile>();
  private readonly omitted: Map<string, string>;

  constructor(readonly snapshot: BaseSnapshot, private readonly policy: ChangePolicy, working?: readonly { path: string; content: string }[]) {
    for (const f of snapshot.files) this.base.set(f.path, f);
    this.omitted = new Map(snapshot.omitted.map((o) => [o.path, o.reason]));
    const baseFiles = snapshot.files.map((f) => ({ path: f.path, content: f.content }));
    this.ws = new SoftwareAgentWorkspace(baseFiles, working ? working.map((f) => ({ path: f.path, content: f.content })) : undefined);
  }

  get workspace(): SoftwareAgentWorkspace { return this.ws; }
  baseOf(path: string): BaseFile | undefined { return this.base.get(path); }
  hasPath(path: string): boolean { return this.ws.hasFile(path) || this.omitted.has(path); }

  /** Refuses before the workspace is touched: policy, credentials, omitted content, and the size of the change so far. */
  guardWrite(path: string, operation: 'create' | 'modify' | 'delete' | 'rename', newContent?: string): void {
    const decision = evaluateWritePolicy(this.policy.write, operation, path);
    if (!decision.allowed) throw new WorkspaceRefusal(decision.message ?? 'That path may not be changed by this task.', 'policy');
    if (isSensitivePath(path)) throw new WorkspaceRefusal('Credential files are never read or changed.', 'sensitive');
    if (this.omitted.has(path)) throw new WorkspaceRefusal(`This file is not part of the working copy (${this.omitted.get(path)}), so it cannot be changed here.`, 'omitted');
    const paths = new Set(this.ws.getChanges().map((c) => c.path)); paths.add(path);
    if (paths.size > this.policy.maxChangedFiles) throw new WorkspaceRefusal(`This change would touch more than ${this.policy.maxChangedFiles} files. Narrow the task.`, 'limit');
    if (newContent !== undefined && Buffer.byteLength(newContent) > this.policy.maxChangedBytes) throw new WorkspaceRefusal('That file is larger than the change limit.', 'limit');
    const bytes = this.ws.getChanges().reduce((n, c) => n + Buffer.byteLength(c.after ?? ''), 0) + Buffer.byteLength(newContent ?? '');
    if (bytes > this.policy.maxChangedBytes * 4) throw new WorkspaceRefusal('The total size of the change exceeds the limit. Narrow the task.', 'limit');
  }

  /** Every file, base plus edits, for materialising a sandbox checkout. */
  files(): { path: string; content: string }[] {
    const out: { path: string; content: string }[] = [];
    for (const s of this.ws.listFiles()) { const read = this.ws.readFile(s.path); out.push({ path: s.path, content: read.content }); }
    return out;
  }

  changes(): SoftwareAgentWorkspaceChange[] { return this.ws.getChanges(); }

  changeSet(): ChangeSet {
    const files: ChangedFile[] = []; const diffs: string[] = []; const all: string[] = [];
    let additions = 0; let deletions = 0;
    for (const c of [...this.ws.getChanges()].sort((a, b) => (a.path < b.path ? -1 : 1))) {
      const before = c.kind === 'created' ? null : c.before ?? this.base.get(c.path)?.content ?? '';
      const after = c.kind === 'deleted' ? null : c.after ?? '';
      if (before === after) continue;
      const stats = diffStats(before ?? '', after ?? '');
      const warnings: string[] = [];
      if (before !== null && after !== null) {
        if (before.includes('\r\n') && /(^|[^\r])\n/.test(after)) warnings.push('line endings changed from CRLF');
        if (!before.includes('\r\n') && after.includes('\r\n')) warnings.push('line endings changed to CRLF');
        const size = Math.max(lineCount(before), 1);
        if (size > 20 && stats.additions + stats.deletions > size * 1.2) warnings.push('most of the file was rewritten');
      }
      if (/(^|\/)(migrations?|db\/migrate|prisma\/migrations|supabase\/migrations)\/.*\.(sql|ts|js|py|rb)$/i.test(c.path) && c.kind !== 'deleted') warnings.push('database migration: Xroga never applies it; review it and run it yourself against a disposable database first');
      additions += stats.additions; deletions += stats.deletions;
      files.push({ path: c.path, kind: c.kind, baseBlobSha: c.kind === 'created' ? null : this.base.get(c.path)?.blobSha ?? null, resultBlobSha: after === null ? null : gitBlobSha(after), additions: stats.additions, deletions: stats.deletions, warnings });
      diffs.push(unifiedDiff(c.path, before, after));
      all.push(`${c.path}\0${after === null ? 'deleted' : sha256(after)}`);
    }
    const digest = sha256(`${this.snapshot.commitSha}\n${all.join('\n')}`);
    return { baseCommitSha: this.snapshot.commitSha, files, diff: diffs.join(''), digest, additions, deletions, warnings: files.flatMap((f) => f.warnings.map((w) => `${f.path}: ${w}`)) };
  }
}
