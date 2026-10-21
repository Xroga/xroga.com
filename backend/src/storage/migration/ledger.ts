import { randomUUID } from 'node:crypto';
import type { DiscoveredItem, Item, ItemStatus, Job, Phase, SourceProvider, Stage } from './types.js';

export interface NewJob {
  name: string; sourceProvider: SourceProvider; sourceSelector?: Record<string, unknown>; destinationBucket: string;
  mode: 'dry_run' | 'copy'; createdBy: string;
}

export type ItemPatch = Partial<Pick<Item,
  'tenantId' | 'ownerUserId' | 'projectId' | 'sourceSize' | 'sourceSha256' | 'sourceFingerprint' | 'sourceContentType' | 'sourceFilename' |
  'objectClass' | 'destinationObjectId' | 'destinationKey' | 'destinationSha256' | 'status' | 'skipReason' | 'lastErrorClass' | 'lastError' |
  'readMode' | 'sourceRetention' | 'rollbackRef' | 'completedAt' | 'verifiedAt'>> & { releaseLease?: boolean; backoffSeconds?: number };

export interface MigrationLedger {
  createJob(j: NewJob): Promise<Job>;
  getJob(id: string): Promise<Job | null>;
  updateJob(id: string, patch: Partial<Pick<Job, 'phase' | 'status' | 'cursor' | 'mode'>>): Promise<Job>;
  /** Stores a signed token. Storing a token does not approve anything by itself. */
  approve(id: string, stage: Stage, token: string): Promise<Job>;
  setPlan(id: string, plan: Job['plan']): Promise<Job>;
  /** Idempotent on (source_provider, source_id). */
  upsertDiscovered(jobId: string, provider: SourceProvider, items: DiscoveredItem[]): Promise<{ inserted: number; unchanged: number; changed: number }>;
  claim(jobId: string, worker: string, limit: number, leaseSeconds: number): Promise<Item[]>;
  updateItem(id: string, patch: ItemPatch, opts?: { worker?: string; bumpAttempt?: boolean }): Promise<Item | null>;
  listItems(jobId: string, statuses: ItemStatus[] | null, limit: number, afterId?: string): Promise<Item[]>;
  getItemBySource(provider: SourceProvider, sourceId: string): Promise<Item | null>;
  countsByStatus(jobId: string): Promise<Array<{ status: ItemStatus; skipReason: string | null; readMode: string; sourceRetention: string; n: number; bytes: number }>>;
}

const blankItem = (jobId: string, provider: SourceProvider, d: DiscoveredItem): Item => ({
  id: randomUUID(), jobId, sourceProvider: provider, sourceId: d.sourceId, tenantId: d.ownerUserId, ownerUserId: d.ownerUserId, projectId: d.projectId,
  sourceSize: d.size, sourceSha256: null, sourceFingerprint: d.fingerprint, sourceContentType: d.contentType, sourceFilename: d.filename,
  objectClass: d.objectClass, destinationObjectId: null, destinationKey: null, destinationSha256: null, status: 'DISCOVERED', skipReason: null,
  attempts: 0, lastErrorClass: null, lastError: null, leaseOwner: null, leaseExpiresAt: null, readMode: 'legacy', sourceRetention: 'RETAINED',
  rollbackRef: null, startedAt: null, completedAt: null, verifiedAt: null,
});

/** Same semantics as the SQL ledger (unique source, lease claim with SKIP LOCKED equivalent via single-threaded JS). */
export class MemoryLedger implements MigrationLedger {
  readonly jobs = new Map<string, Job>();
  readonly items = new Map<string, Item>();
  #now: () => Date;
  /** one-shot failure injection: 'updateItem:COPIED' etc. */
  failNext: string | null = null;
  constructor(now: () => Date = () => new Date()) { this.#now = now; }
  setClock(now: () => Date) { this.#now = now; }

  async createJob(j: NewJob): Promise<Job> {
    const job: Job = { id: randomUUID(), name: j.name, sourceProvider: j.sourceProvider, sourceSelector: j.sourceSelector ?? {}, destinationBucket: j.destinationBucket, mode: j.mode, phase: 'DISCOVER', status: 'CREATED', cursor: {}, approvals: {}, plan: null, createdBy: j.createdBy };
    this.jobs.set(job.id, job);
    return { ...job };
  }
  async getJob(id: string) { const j = this.jobs.get(id); return j ? { ...j, approvals: { ...j.approvals }, plan: j.plan ? { ...j.plan } : null } : null; }
  async updateJob(id: string, patch: Partial<Pick<Job, 'phase' | 'status' | 'cursor' | 'mode'>>) {
    const j = this.jobs.get(id); if (!j) throw new Error('job not found');
    Object.assign(j, patch); return { ...j };
  }
  async approve(id: string, stage: Stage, token: string) {
    const j = this.jobs.get(id); if (!j) throw new Error('job not found');
    j.approvals[stage] = token; return { ...j, approvals: { ...j.approvals } };
  }
  async setPlan(id: string, plan: Job['plan']) {
    const j = this.jobs.get(id); if (!j) throw new Error('job not found');
    j.plan = plan; return { ...j, approvals: { ...j.approvals } };
  }
  async upsertDiscovered(jobId: string, provider: SourceProvider, items: DiscoveredItem[]) {
    let inserted = 0, unchanged = 0, changed = 0;
    for (const d of items) {
      const ex = [...this.items.values()].find((i) => i.sourceProvider === provider && i.sourceId === d.sourceId);
      if (!ex) { this.items.set(...(() => { const n = blankItem(jobId, provider, d); return [n.id, n] as const; })()); inserted++; continue; }
      if (ex.sourceFingerprint === d.fingerprint) { unchanged++; continue; }
      changed++;
      ex.sourceFingerprint = d.fingerprint; ex.sourceSize = d.size; ex.jobId = jobId;
      // a verified copy of OLD bytes must not be treated as a copy of the new bytes
      if (ex.status === 'VERIFIED' || ex.status === 'COPIED') ex.status = 'SOURCE_CHANGED'; else ex.status = 'DISCOVERED';
      ex.sourceSha256 = null;
    }
    return { inserted, unchanged, changed };
  }
  async claim(jobId: string, worker: string, limit: number, leaseSeconds: number) {
    const now = this.#now();
    const out: Item[] = [];
    for (const i of [...this.items.values()]) {
      if (out.length >= limit) break;
      const leaseFree = !i.leaseExpiresAt || i.leaseExpiresAt < now;
      if (i.jobId === jobId && leaseFree && (i.status === 'ELIGIBLE' || i.status === 'FAILED' || (i.status === 'COPYING' && i.leaseExpiresAt !== null && i.leaseExpiresAt < now))) {
        i.status = 'COPYING'; i.leaseOwner = worker; i.leaseExpiresAt = new Date(now.getTime() + leaseSeconds * 1000);
        i.attempts++; i.startedAt ??= now; out.push({ ...i });
      }
    }
    return out;
  }
  async updateItem(id: string, patch: ItemPatch, opts: { worker?: string } = {}) {
    if (this.failNext && patch.status && this.failNext === `updateItem:${patch.status}`) { this.failNext = null; throw new Error(`injected ledger failure at ${patch.status}`); }
    const i = this.items.get(id); if (!i) return null;
    if (opts.worker && i.leaseOwner !== opts.worker) return null; // lost the lease
    const { releaseLease, backoffSeconds, ...rest } = patch;
    Object.assign(i, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
    if (releaseLease) { i.leaseOwner = null; i.leaseExpiresAt = null; }
    if (backoffSeconds !== undefined) { i.leaseOwner = null; i.leaseExpiresAt = new Date(this.#now().getTime() + backoffSeconds * 1000); }
    return { ...i };
  }
  async listItems(jobId: string, statuses: ItemStatus[] | null, limit: number, afterId?: string) {
    return [...this.items.values()].filter((i) => i.jobId === jobId && (!statuses || statuses.includes(i.status)) && (!afterId || i.id > afterId))
      .sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, limit).map((i) => ({ ...i }));
  }
  async getItemBySource(provider: SourceProvider, sourceId: string) {
    const i = [...this.items.values()].find((x) => x.sourceProvider === provider && x.sourceId === sourceId); return i ? { ...i } : null;
  }
  async countsByStatus(jobId: string) {
    const m = new Map<string, { status: ItemStatus; skipReason: string | null; readMode: string; sourceRetention: string; n: number; bytes: number }>();
    for (const i of this.items.values()) {
      if (i.jobId !== jobId) continue;
      const k = [i.status, i.skipReason, i.readMode, i.sourceRetention].join('|');
      const e = m.get(k) ?? { status: i.status, skipReason: i.skipReason, readMode: i.readMode, sourceRetention: i.sourceRetention, n: 0, bytes: 0 };
      e.n++; e.bytes += i.sourceSize ?? 0; m.set(k, e);
    }
    return [...m.values()];
  }
}

export type { Phase };
