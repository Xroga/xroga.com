/**
 * Materialises the exact base commit of a linked project as a bounded working copy for a change.
 *
 * Reuses the Phase 1 source service (verified, pinned to the base commit, tenant-scoped) and its blob reader. Files that must never
 * be in a working copy (credentials, binaries, vendored and generated trees, oversize files) are listed as omitted with the reason,
 * never silently dropped. When a bound is reached the snapshot says it is incomplete, and the caller must not claim tests passed
 * against it.
 */
import { exclusionFor } from '../intelligence/exclusions.js';
import { isSensitivePath } from '../sensitivePaths.js';
import type { ExistingSourceService } from '../service.js';
import type { BaseFile, BaseSnapshot } from './workspace.js';
import { gitBlobSha } from '../archive/archivePort.js';

export interface SnapshotLimits { readonly maxFiles: number; readonly maxBytes: number; readonly maxFileBytes: number; readonly concurrency: number }
export const DEFAULT_SNAPSHOT_LIMITS: SnapshotLimits = { maxFiles: 3_000, maxBytes: 24 * 1024 * 1024, maxFileBytes: 512 * 1024, concurrency: 8 };

/** Content by blob sha shared by changes in this process, bounded by bytes. */
class BlobCache {
  private readonly map = new Map<string, string>(); private bytes = 0;
  constructor(private readonly cap: number) {}
  get(sha: string): string | undefined { const v = this.map.get(sha); if (v !== undefined) { this.map.delete(sha); this.map.set(sha, v); } return v; }
  set(sha: string, text: string): void {
    if (this.map.has(sha)) return;
    this.map.set(sha, text); this.bytes += text.length;
    for (const [k, v] of this.map) { if (this.bytes <= this.cap) break; this.map.delete(k); this.bytes -= v.length; }
  }
}
const sharedBlobs = new BlobCache(48 * 1024 * 1024);

export async function loadBaseSnapshot(source: ExistingSourceService, userId: string, bindingId: string, limits: SnapshotLimits = DEFAULT_SNAPSHOT_LIMITS, cache: BlobCache = sharedBlobs): Promise<BaseSnapshot> {
  const open = await source.openForIndex(userId, bindingId);
  const omitted: { path: string; reason: string }[] = []; const wanted: { path: string; sha: string; size: number | null }[] = [];
  let incompleteReason: string | null = open.tree.complete ? null : open.tree.partialReason ?? 'tree_incomplete';
  for (const e of open.tree.entries) {
    const path = e.path;
    if (typeof path !== 'string' || e.type !== 'blob' || typeof e.sha !== 'string') continue;
    if (e.mode === '120000') { omitted.push({ path, reason: 'symlink' }); continue; }
    if (isSensitivePath(path)) { omitted.push({ path, reason: 'credentials' }); continue; }
    const reason = exclusionFor({ path, mode: e.mode, type: e.type, size: typeof e.size === 'number' ? e.size : null });
    // lockfiles are kept when small enough: a test run installs from them
    if (reason !== null && reason !== 'lockfile') { omitted.push({ path, reason }); continue; }
    if (typeof e.size === 'number' && e.size > limits.maxFileBytes) { omitted.push({ path, reason: 'oversize' }); continue; }
    wanted.push({ path, sha: e.sha, size: typeof e.size === 'number' ? e.size : null });
  }
  if (wanted.length > limits.maxFiles) { incompleteReason = incompleteReason ?? 'too_many_files'; wanted.length = limits.maxFiles; }

  const files: BaseFile[] = []; let bytes = 0; let cursor = 0; let overBudget = false;
  const worker = async () => {
    while (!overBudget) {
      const i = cursor++; const item = wanted[i];
      if (!item) return;
      let text = cache.get(item.sha);
      if (text === undefined) {
        const fetched = await open.blobs.text(item.path, item.sha);
        if (fetched === null) { omitted.push({ path: item.path, reason: 'binary_or_unreadable' }); continue; }
        text = fetched; cache.set(item.sha, text);
      }
      if (bytes + text.length > limits.maxBytes) { overBudget = true; incompleteReason = incompleteReason ?? 'byte_budget'; omitted.push({ path: item.path, reason: 'byte_budget' }); return; }
      bytes += text.length;
      files.push({ path: item.path, content: text, blobSha: item.sha });
    }
  };
  await Promise.all(Array.from({ length: limits.concurrency }, worker));
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  // text that does not round-trip to its blob hash (not valid UTF-8) cannot be edited faithfully, so it is omitted rather than rewritten
  const verified: BaseFile[] = [];
  for (const f of files) { if (gitBlobSha(f.content) === f.blobSha) verified.push(f); else omitted.push({ path: f.path, reason: 'not_utf8_text' }); }
  return { commitSha: open.binding.baseCommitSha, files: verified, omitted: omitted.sort((a, b) => (a.path < b.path ? -1 : 1)), complete: incompleteReason === null, incompleteReason };
}
