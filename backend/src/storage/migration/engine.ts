import { createHash } from 'node:crypto';
import { deterministicObjectId } from '../keys.js';
import { ProviderUnavailableError } from '../objectStore.js';
import type { StorageRepository } from '../repository.js';
import type { StorageService } from '../storageService.js';
import { StorageError } from '../types.js';
import type { MigrationLedger } from './ledger.js';
import {
  NotApprovedError, type DiscoveredItem, type Item, type Job, type Phase, type Reconciliation, type SourceAdapter, type Stage,
} from './types.js';

/** Optional metadata switch for READ_NEW: links project_files rows to the verified canonical object. */
export interface ReadLinker {
  link(item: Item): Promise<void>;
  unlink(item: Item): Promise<void>;
}

export interface EngineDeps {
  ledger: MigrationLedger;
  source: SourceAdapter;
  drive: StorageService;
  /** destination metadata, read-only here */
  destRepo: StorageRepository;
  worker: string;
  linker?: ReadLinker;
  now?: () => Date;
  maxAttempts?: number;
  leaseSeconds?: number;
  /** largest object the single streaming PUT will carry; bigger ones are BLOCKED(NEEDS_MULTIPART_COPY), never silently skipped */
  maxStreamCopyBytes?: number;
  maxObjectBytes?: number;
  includeEphemeral?: boolean;
}

export interface CopySummary { claimed: number; copied: number; reused: number; failed: number; blocked: number; missing: number; sourceChanged: number; corrupt: number; lostLease: number }

const TRANSIENT = (e: unknown) =>
  e instanceof ProviderUnavailableError ||
  (e instanceof StorageError && e.code === 'PROVIDER_UNAVAILABLE') ||
  ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED'].includes((e as { code?: string })?.code ?? '');

const redact = (m: string) => m.replace(/(X-Amz-[A-Za-z-]+=)[^&\s]+/gi, '$1[redacted]').replace(/(key|secret|token|authorization)(["':=\s]+)[^\s"',}]{6,}/gi, '$1$2[redacted]').slice(0, 300);

export class MigrationEngine {
  readonly #d: Required<Pick<EngineDeps, 'maxAttempts' | 'leaseSeconds' | 'maxStreamCopyBytes' | 'maxObjectBytes' | 'includeEphemeral'>> & EngineDeps;
  readonly #now: () => Date;

  constructor(d: EngineDeps) {
    this.#d = { maxAttempts: 5, leaseSeconds: 300, maxStreamCopyBytes: 1024 ** 3, maxObjectBytes: 5 * 1024 ** 3, includeEphemeral: false, ...d };
    this.#now = d.now ?? (() => new Date());
  }

  async #job(id: string): Promise<Job> {
    const j = await this.#d.ledger.getJob(id);
    if (!j) throw new Error('migration job not found');
    if (j.sourceProvider !== this.#d.source.provider) throw new Error(`job source ${j.sourceProvider} does not match adapter ${this.#d.source.provider}`);
    return j;
  }
  #require(job: Job, stage: Stage) {
    if (!job.approvals[stage]) throw new NotApprovedError(stage);
  }
  async #phase(job: Job, phase: Phase) {
    await this.#d.ledger.updateJob(job.id, { phase, status: 'RUNNING' });
  }

  // ---- DISCOVER (read-only; resumable via the persisted cursor) ----------------------------------
  async discover(jobId: string, opts: { pageSize?: number; maxPages?: number } = {}) {
    const job = await this.#job(jobId);
    await this.#phase(job, 'DISCOVER');
    let cursor = (job.cursor as { next?: string; done?: boolean }).done ? undefined : (job.cursor as { next?: string }).next;
    const total = { inserted: 0, unchanged: 0, changed: 0, pages: 0, done: false };
    for (let p = 0; p < (opts.maxPages ?? Infinity); p++) {
      const page = await this.#d.source.discover(cursor, opts.pageSize ?? 500);
      const r = await this.#d.ledger.upsertDiscovered(jobId, this.#d.source.provider, page.items as DiscoveredItem[]);
      total.inserted += r.inserted; total.unchanged += r.unchanged; total.changed += r.changed; total.pages++;
      cursor = page.next;
      await this.#d.ledger.updateJob(jobId, { cursor: cursor ? { next: cursor } : { done: true } });
      if (!cursor) { total.done = true; break; }
    }
    return total;
  }

  // ---- DRY_RUN: classify, write nothing to storage ----------------------------------------------
  async dryRun(jobId: string) {
    const job = await this.#job(jobId);
    await this.#phase(job, 'DRY_RUN');
    const summary = { eligible: 0, eligibleBytes: 0, skipped: {} as Record<string, number>, blocked: {} as Record<string, number> };
    let after: string | undefined;
    for (;;) {
      const batch = await this.#d.ledger.listItems(jobId, ['DISCOVERED'], 500, after);
      if (!batch.length) break;
      for (const it of batch) {
        const c = this.#classify(it);
        await this.#d.ledger.updateItem(it.id, { status: c.status, skipReason: c.reason });
        if (c.status === 'ELIGIBLE') { summary.eligible++; summary.eligibleBytes += it.sourceSize ?? 0; }
        else if (c.status === 'SKIPPED') summary.skipped[c.reason!] = (summary.skipped[c.reason!] ?? 0) + 1;
        else summary.blocked[c.reason!] = (summary.blocked[c.reason!] ?? 0) + 1;
      }
      after = batch[batch.length - 1].id;
      if (batch.length < 500) break;
    }
    return summary;
  }

  #classify(it: Item): { status: 'ELIGIBLE' | 'SKIPPED' | 'BLOCKED'; reason: string | null } {
    if (!it.ownerUserId) return { status: 'BLOCKED', reason: 'UNKNOWN_OWNER' };
    if (it.sourceFingerprint === 'unrecoverable') return { status: 'BLOCKED', reason: 'INLINE_CONTENT_NOT_RECOVERABLE' };
    if (it.sourceSize !== null && it.sourceSize > this.#d.maxObjectBytes) return { status: 'BLOCKED', reason: 'EXCEEDS_MAX_OBJECT_BYTES' };
    if (it.sourceSize !== null && it.sourceSize > this.#d.maxStreamCopyBytes) return { status: 'BLOCKED', reason: 'NEEDS_MULTIPART_COPY' };
    if (this.#d.source.provider === 'local_media_cache' && !this.#d.includeEphemeral) return { status: 'SKIPPED', reason: 'EPHEMERAL_CACHE' };
    return { status: 'ELIGIBLE', reason: null };
  }

  // ---- COPY ---------------------------------------------------------------------------------------
  async copy(jobId: string, opts: { concurrency?: number; limit?: number } = {}): Promise<CopySummary> {
    const job = await this.#job(jobId);
    if (job.mode !== 'copy') throw new NotApprovedError('copy');
    this.#require(job, 'copy');
    await this.#phase(job, 'COPY');
    const sum: CopySummary = { claimed: 0, copied: 0, reused: 0, failed: 0, blocked: 0, missing: 0, sourceChanged: 0, corrupt: 0, lostLease: 0 };
    const conc = Math.max(1, Math.min(opts.concurrency ?? 4, 16));
    let budget = opts.limit ?? Infinity;
    while (budget > 0) {
      const batch = await this.#d.ledger.claim(jobId, this.#d.worker, Math.min(conc, budget), this.#d.leaseSeconds);
      if (!batch.length) break;
      budget -= batch.length; sum.claimed += batch.length;
      await Promise.all(batch.map((it) => this.#copyOne(it, job, sum)));
    }
    return sum;
  }

  async #finish(it: Item, patch: Parameters<MigrationLedger['updateItem']>[1], sum: CopySummary): Promise<boolean> {
    const r = await this.#d.ledger.updateItem(it.id, { ...patch, releaseLease: patch.backoffSeconds === undefined }, { worker: this.#d.worker });
    if (!r) { sum.lostLease++; return false; }
    return true;
  }

  async #copyOne(it: Item, job: Job, sum: CopySummary): Promise<void> {
    try {
      if (it.attempts > this.#d.maxAttempts) { sum.blocked++; await this.#finish(it, { status: 'BLOCKED', skipReason: 'MAX_ATTEMPTS', lastErrorClass: 'EXHAUSTED' }, sum); return; }
      const opened = await this.#d.source.open(it.sourceId);
      if (!opened) { sum.missing++; await this.#finish(it, { status: 'MISSING_SOURCE', lastErrorClass: 'SOURCE' }, sum); return; }
      if (it.sourceFingerprint && opened.fingerprint !== it.sourceFingerprint) {
        sum.sourceChanged++; await this.#finish(it, { status: 'SOURCE_CHANGED', lastErrorClass: 'SOURCE' }, sum); return;
      }
      const actor = { userId: it.ownerUserId as string, tenantId: it.tenantId ?? (it.ownerUserId as string) };
      const objectId = deterministicObjectId(it.sourceProvider, `${it.sourceId}@${opened.fingerprint}`);
      const hash = createHash('sha256');
      let consumed = 0;
      const tee = async () => (async function* (src: AsyncIterable<Uint8Array>) {
        for await (const c of src) { hash.update(c); consumed += c.byteLength; yield c; }
      })(await opened.body());

      const { object, reused } = await this.#d.drive.ingestLegacy(actor, {
        objectId, projectId: it.projectId, objectClass: it.objectClass ?? 'artifact', filename: it.sourceFilename ?? 'file',
        contentType: opened.contentType ?? it.sourceContentType ?? 'application/octet-stream', size: opened.size, body: tee,
        migrationJobId: job.id, legacySource: { provider: it.sourceProvider, id: it.sourceId, fingerprint: opened.fingerprint },
      });

      let sourceSha: string;
      if (reused) {
        // destination already admitted by an earlier attempt: hash the source again, upload nothing
        const h = createHash('sha256'); let n = 0;
        for await (const c of await opened.body()) { h.update(c); n += c.byteLength; }
        if (n !== opened.size) throw new StorageError('CONFLICT', 'source size changed while hashing', 409);
        sourceSha = h.digest('hex');
      } else {
        if (consumed !== opened.size) throw new StorageError('CONFLICT', 'source stream was not fully consumed', 409);
        sourceSha = hash.digest('hex');
      }

      // the source must be what we measured: a source that changed during the copy is not "copied"
      const again = await this.#d.source.open(it.sourceId);
      if (!again || again.fingerprint !== opened.fingerprint) {
        sum.sourceChanged++; await this.#finish(it, { status: 'SOURCE_CHANGED', lastErrorClass: 'SOURCE' }, sum); return;
      }

      if (object.sha256Verified !== sourceSha || object.sizeBytes !== opened.size) {
        await this.#d.drive.markCorrupt(object.id, 'MIGRATION_SOURCE_MISMATCH');
        sum.corrupt++;
        await this.#finish(it, { status: 'CORRUPT_DESTINATION', sourceSha256: sourceSha, destinationObjectId: object.id, destinationKey: object.objectKey, destinationSha256: object.sha256Verified, lastErrorClass: 'INTEGRITY' }, sum);
        return;
      }
      const ok = await this.#finish(it, {
        status: 'COPIED', sourceSha256: sourceSha, destinationObjectId: object.id, destinationKey: object.objectKey, destinationSha256: object.sha256Verified,
        sourceSize: opened.size, completedAt: this.#now(), lastErrorClass: null, lastError: null,
      }, sum);
      if (ok) { reused ? sum.reused++ : sum.copied++; }
    } catch (err) {
      const msg = redact(String((err as Error)?.message ?? err));
      if (err instanceof StorageError && ['QUARANTINED', 'CORRUPT', 'POLICY_REJECTED', 'FORBIDDEN', 'BAD_STATE'].includes(err.code)) {
        sum.blocked++;
        await this.#finish(it, { status: 'BLOCKED', skipReason: `DESTINATION_${err.code}`, lastErrorClass: 'POLICY', lastError: msg }, sum);
      } else if (it.attempts > this.#d.maxAttempts) {
        sum.blocked++;
        await this.#finish(it, { status: 'BLOCKED', skipReason: 'MAX_ATTEMPTS', lastErrorClass: TRANSIENT(err) ? 'TRANSIENT' : 'UNKNOWN', lastError: msg }, sum);
      } else {
        sum.failed++;
        // exponential backoff via the lease: a failed item is not re-claimed (by this or any worker) until it elapses
        const backoff = Math.min(30 * 2 ** Math.max(it.attempts - 1, 0), 900);
        await this.#finish(it, { status: 'FAILED', lastErrorClass: TRANSIENT(err) ? 'TRANSIENT' : 'UNKNOWN', lastError: msg, backoffSeconds: backoff }, sum);
      }
    }
  }

  // ---- VERIFY: independent read-back of every COPIED destination ----------------------------------
  async verify(jobId: string, opts: { rehashSource?: boolean } = {}) {
    const job = await this.#job(jobId);
    await this.#phase(job, 'VERIFY');
    const out = { checked: 0, verified: 0, corrupt: 0, missingDestination: 0, sourceDiffers: 0 };
    let after: string | undefined;
    for (;;) {
      const batch = await this.#d.ledger.listItems(jobId, ['COPIED'], 200, after);
      if (!batch.length) break;
      for (const it of batch) {
        out.checked++;
        const dest = it.destinationObjectId ? await this.#d.drive.verifyStoredObject(it.destinationObjectId) : { present: false as const, state: null };
        if (!dest.present || dest.state !== 'READY') {
          out.missingDestination++;
          await this.#d.ledger.updateItem(it.id, { status: 'CORRUPT_DESTINATION', lastErrorClass: 'INTEGRITY', lastError: 'DESTINATION_MISSING_OR_NOT_READY' });
          continue;
        }
        if (dest.sha256 !== it.sourceSha256 || dest.size !== it.sourceSize) {
          out.corrupt++;
          if (it.destinationObjectId) await this.#d.drive.markCorrupt(it.destinationObjectId, 'VERIFY_MISMATCH');
          await this.#d.ledger.updateItem(it.id, { status: 'CORRUPT_DESTINATION', lastErrorClass: 'INTEGRITY', lastError: 'DESTINATION_HASH_MISMATCH' });
          continue;
        }
        if (opts.rehashSource) {
          const src = await this.#d.source.open(it.sourceId);
          if (src) {
            const h = createHash('sha256');
            for await (const c of await src.body()) h.update(c);
            if (h.digest('hex') !== it.sourceSha256) {
              out.sourceDiffers++;
              await this.#d.ledger.updateItem(it.id, { status: 'SOURCE_CHANGED', lastErrorClass: 'SOURCE' });
              continue;
            }
          }
        }
        await this.#d.ledger.updateItem(it.id, { status: 'VERIFIED', destinationSha256: dest.sha256, verifiedAt: this.#now() });
        out.verified++;
      }
      after = batch[batch.length - 1].id;
      if (batch.length < 200) break;
    }
    return out;
  }

  // ---- RECONCILE: counts straight from the ledger; nothing inferred --------------------------------
  async reconcile(jobId: string): Promise<Reconciliation> {
    const job = await this.#job(jobId);
    await this.#phase(job, 'RECONCILE');
    const rows = await this.#d.ledger.countsByStatus(jobId);
    const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((a, r) => a + r.n, 0);
    const bytes = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((a, r) => a + r.bytes, 0);
    const group = (st: string) => Object.entries(rows.filter((r) => r.status === st).reduce<Record<string, number>>((m, r) => ({ ...m, [r.skipReason ?? 'UNSPECIFIED']: (m[r.skipReason ?? 'UNSPECIFIED'] ?? 0) + r.n }), {})).map(([reason, count]) => ({ reason, count }));
    const discovered = sum(() => true);
    const eligible = sum((r) => r.status === 'ELIGIBLE');
    const approvedCopy = !!job.approvals.copy;
    const rec: Reconciliation = {
      jobId, discovered, eligible,
      copied: sum((r) => r.status === 'COPIED' || r.status === 'VERIFIED'),
      sha256Verified: sum((r) => r.status === 'VERIFIED'),
      skipped: group('SKIPPED'), blocked: group('BLOCKED'),
      missingSources: sum((r) => r.status === 'MISSING_SOURCE'),
      failed: sum((r) => r.status === 'FAILED'),
      pending: sum((r) => ['DISCOVERED', 'ELIGIBLE', 'COPYING'].includes(r.status)),
      corruptDestinations: sum((r) => r.status === 'CORRUPT_DESTINATION'),
      sourceChanged: sum((r) => r.status === 'SOURCE_CHANGED'),
      retainedForRollback: sum((r) => r.status === 'VERIFIED' && r.sourceRetention !== 'DELETED'),
      notYetApproved: approvedCopy ? 0 : sum((r) => r.status === 'DISCOVERED' || r.status === 'ELIGIBLE'),
      readingFromNew: sum((r) => r.readMode === 'new'),
      metadataMismatches: 0,
      bytes: { discovered: bytes(() => true), verified: bytes((r) => r.status === 'VERIFIED') },
      consistent: false,
    };
    // metadata <-> object cross-check for every VERIFIED item
    let after: string | undefined;
    for (;;) {
      const batch = await this.#d.ledger.listItems(jobId, ['VERIFIED'], 500, after);
      for (const it of batch) {
        const o = it.destinationObjectId ? await this.#d.destRepo.getObject(it.destinationObjectId) : null;
        if (!o || o.state !== 'READY' || o.sha256Verified !== it.sourceSha256) rec.metadataMismatches++;
      }
      if (batch.length < 500) break;
      after = batch[batch.length - 1].id;
    }
    const accounted = rec.sha256Verified + (rec.copied - rec.sha256Verified) + rec.pending + rec.failed + rec.missingSources + rec.corruptDestinations + rec.sourceChanged +
      sum((r) => r.status === 'SKIPPED') + sum((r) => r.status === 'BLOCKED');
    rec.consistent = accounted === discovered;
    return rec;
  }

  // ---- READ_NEW / rollback / FREEZE_OLD / RETAIN / APPROVED_DELETE ---------------------------------
  async readNew(jobId: string, opts: { limit?: number } = {}) {
    const job = await this.#job(jobId);
    this.#require(job, 'read_new');
    await this.#phase(job, 'READ_NEW');
    let switched = 0, after: string | undefined;
    for (;;) {
      const batch = await this.#d.ledger.listItems(jobId, ['VERIFIED'], 200, after);
      for (const it of batch) {
        if (it.readMode === 'new') continue;
        if (opts.limit !== undefined && switched >= opts.limit) return { switched };
        await this.#d.linker?.link(it);
        await this.#d.ledger.updateItem(it.id, { readMode: 'new', rollbackRef: { previous: 'legacy', switchedAt: this.#now().toISOString(), job: jobId } });
        switched++;
      }
      if (batch.length < 200) break;
      after = batch[batch.length - 1].id;
    }
    return { switched };
  }

  /** Always allowed (it is the safety valve). Touches ledger read mode only: no object is moved, deleted or rewritten. */
  async rollbackReadMode(jobId: string) {
    const job = await this.#job(jobId);
    let reverted = 0, after: string | undefined;
    for (;;) {
      const batch = await this.#d.ledger.listItems(jobId, ['VERIFIED'], 200, after);
      for (const it of batch) {
        if (it.readMode !== 'new') continue;
        await this.#d.linker?.unlink(it);
        await this.#d.ledger.updateItem(it.id, { readMode: 'legacy', rollbackRef: { revertedAt: this.#now().toISOString(), job: jobId } });
        reverted++;
      }
      if (batch.length < 200) break;
      after = batch[batch.length - 1].id;
    }
    await this.#d.ledger.updateJob(job.id, { phase: 'OBSERVE', status: 'PAUSED' });
    return { reverted };
  }

  async freezeOld(jobId: string) {
    const job = await this.#job(jobId);
    this.#require(job, 'freeze_old');
    await this.#phase(job, 'FREEZE_OLD');
    let frozen = 0, after: string | undefined;
    for (;;) {
      const batch = await this.#d.ledger.listItems(jobId, ['VERIFIED'], 200, after);
      for (const it of batch) if (it.readMode === 'new' && it.sourceRetention === 'RETAINED') { await this.#d.ledger.updateItem(it.id, { sourceRetention: 'FROZEN' }); frozen++; }
      if (batch.length < 200) break;
      after = batch[batch.length - 1].id;
    }
    return { frozen, note: 'ledger marker only: no legacy object was modified' };
  }

  /** Lists what a future, separately approved retirement could remove. Deleting legacy data is not implemented in Phase 1. */
  async deletionManifest(jobId: string) {
    const job = await this.#job(jobId);
    await this.#phase(job, 'APPROVED_DELETE');
    const candidates: Array<{ sourceId: string; destinationObjectId: string | null; sha256: string | null }> = [];
    let after: string | undefined;
    for (;;) {
      const batch = await this.#d.ledger.listItems(jobId, ['VERIFIED'], 500, after);
      for (const it of batch) if (it.readMode === 'new' && it.sourceRetention === 'FROZEN') candidates.push({ sourceId: it.sourceId, destinationObjectId: it.destinationObjectId, sha256: it.sourceSha256 });
      if (batch.length < 500) break;
      after = batch[batch.length - 1].id;
    }
    return { candidates, approvalPresent: !!job.approvals.delete, deletesAnything: false as const };
  }

  async deleteLegacy(_jobId: string): Promise<never> {
    throw new NotApprovedError('delete-not-implemented');
  }
}
