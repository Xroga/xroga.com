import { randomUUID } from 'node:crypto';
import { canTransition, StorageError, type ObjectClass, type ObjectState, type StorageObject } from './types.js';

export type ReserveResult = 'OK' | 'ALREADY_RESERVED' | 'QUOTA_EXCEEDED';
export type CommitResult = 'OK' | 'ALREADY_COMMITTED' | 'NO_RESERVATION' | 'RESERVATION_LOST' | 'SIZE_EXCEEDS_RESERVATION';

export interface NewObject {
  id: string;
  tenantId: string;
  ownerUserId: string;
  projectId: string | null;
  objectClass: ObjectClass;
  originalFilename: string;
  safeFilename: string;
  provider: 'r2' | 'memory';
  bucket: string;
  objectKey: string;
  contentType: string;
  declaredSize: number;
  sha256Declared: string | null;
  uploadMode: 'single' | 'multipart';
  uploadExpiresAt: Date | null;
  migrationJobId?: string | null;
  legacySource?: Record<string, unknown> | null;
}

export type ObjectPatch = Partial<Pick<StorageObject,
  'state' | 'sizeBytes' | 'sha256Verified' | 'verifiedAt' | 'verificationResult' | 'errorCode' | 'errorDetail' |
  'providerVersion' | 'multipartUploadId' | 'uploadExpiresAt' | 'retentionUntil' | 'visibility'>> & {
  deletingAt?: Date | null;
  deletedAt?: Date | null;
};

export interface Usage { tenantId: string; reservedBytes: number; committedBytes: number; quotaBytes: number | null }

export interface AuditEvent {
  tenantId: string | null;
  actorUserId: string | null;
  objectId: string | null;
  action: string;
  outcome: string;
  detail?: Record<string, unknown>;
}

export interface ListFilter { projectId?: string | null; states?: ObjectState[]; limit?: number; afterId?: string }

export interface StorageRepository {
  insertObject(o: NewObject): Promise<StorageObject>;
  getObject(id: string): Promise<StorageObject | null>;
  /** Compare-and-set on state: returns null when the row is not in one of `from`. */
  updateObject(id: string, from: ObjectState[], patch: ObjectPatch): Promise<StorageObject | null>;
  listObjects(tenantId: string, f: ListFilter): Promise<StorageObject[]>;
  findByKey(provider: string, bucket: string, key: string): Promise<StorageObject | null>;
  listExpiredUploads(now: Date, limit: number): Promise<StorageObject[]>;
  listByState(states: ObjectState[], olderThan: Date, limit: number): Promise<StorageObject[]>;
  reserve(objectId: string, tenantId: string, bytes: number, expiresAt: Date, quota: number | null): Promise<ReserveResult>;
  commit(objectId: string, actualBytes: number): Promise<CommitResult>;
  release(objectId: string, finalState?: 'RELEASED' | 'EXPIRED'): Promise<'OK' | 'NOOP'>;
  free(objectId: string): Promise<'OK' | 'NOOP'>;
  expireReservations(now: Date): Promise<number>;
  reconcileUsage(tenantId: string): Promise<{ before: Usage; after: Usage }>;
  getUsage(tenantId: string): Promise<Usage>;
  audit(e: AuditEvent): Promise<void>;
  /** Project ownership for authorization. Null when the project does not exist. */
  getProjectOwner(projectId: string): Promise<string | null>;
}

// ------------------------------------------------------------------------------------------------
// In-memory implementation. Mirrors the SQL semantics (CAS on state, transition guard, READY invariant,
// serialised quota) so service logic is testable without a database. The Postgres implementation is
// exercised against a real Postgres in postgresRepository.integration.test.ts.
// ------------------------------------------------------------------------------------------------
interface Resv { objectId: string; tenantId: string; bytes: number; state: 'ACTIVE' | 'COMMITTED' | 'RELEASED' | 'EXPIRED' | 'FREED'; expiresAt: Date }

export class MemoryStorageRepository implements StorageRepository {
  readonly objects = new Map<string, StorageObject>();
  readonly reservations = new Map<string, Resv>();
  readonly usage = new Map<string, Usage>();
  readonly auditLog: AuditEvent[] = [];
  readonly projects = new Map<string, string>();
  #lock: Promise<void> = Promise.resolve();
  #now: () => Date;
  /** one-shot failure injection for commit-path tests */
  failNext: string | null = null;

  constructor(now: () => Date = () => new Date()) { this.#now = now; }
  setClock(now: () => Date) { this.#now = now; }

  #serial<T>(fn: () => T): Promise<T> {
    const run = this.#lock.then(async () => {
      await Promise.resolve(); // yield: lets concurrent callers interleave exactly as separate DB sessions would
      return fn();
    });
    this.#lock = run.then(() => undefined, () => undefined);
    return run;
  }
  #u(t: string): Usage {
    let u = this.usage.get(t);
    if (!u) { u = { tenantId: t, reservedBytes: 0, committedBytes: 0, quotaBytes: null }; this.usage.set(t, u); }
    return u;
  }
  #maybeFail(op: string) {
    if (this.failNext === op) { this.failNext = null; throw new Error(`injected repository failure: ${op}`); }
  }

  async insertObject(o: NewObject): Promise<StorageObject> {
    for (const e of this.objects.values()) {
      if (e.provider === o.provider && e.bucket === o.bucket && e.objectKey === o.objectKey) throw new StorageError('CONFLICT', 'object key already exists');
    }
    const now = this.#now();
    const row: StorageObject = {
      id: o.id, tenantId: o.tenantId, ownerUserId: o.ownerUserId, projectId: o.projectId, objectClass: o.objectClass,
      originalFilename: o.originalFilename, safeFilename: o.safeFilename, provider: o.provider, bucket: o.bucket,
      objectKey: o.objectKey, contentType: o.contentType, declaredSize: o.declaredSize, sizeBytes: null,
      sha256Declared: o.sha256Declared, sha256Verified: null, state: 'PENDING', visibility: 'private',
      uploadMode: o.uploadMode, multipartUploadId: null, uploadExpiresAt: o.uploadExpiresAt, retentionUntil: null,
      providerVersion: null, migrationJobId: o.migrationJobId ?? null, legacySource: o.legacySource ?? null,
      verifiedAt: null, verificationResult: null, errorCode: null, errorDetail: null, version: 1, createdAt: now, updatedAt: now,
    };
    this.objects.set(row.id, row);
    return { ...row };
  }

  async getObject(id: string) { const o = this.objects.get(id); return o ? { ...o } : null; }

  async updateObject(id: string, from: ObjectState[], patch: ObjectPatch): Promise<StorageObject | null> {
    return this.#serial(() => {
      this.#maybeFail('updateObject');
      const cur = this.objects.get(id);
      if (!cur || !from.includes(cur.state)) return null;
      const next: StorageObject = { ...cur, ...stripUndefined(patch) } as StorageObject;
      if (patch.state && patch.state !== cur.state && !canTransition(cur.state, patch.state)) {
        throw new StorageError('BAD_STATE', `illegal state transition ${cur.state} -> ${patch.state}`, 409);
      }
      if (next.state === 'READY' && (next.sizeBytes === null || next.sha256Verified === null || next.verifiedAt === null)) {
        throw new StorageError('BAD_STATE', 'READY requires verified size and sha256', 409);
      }
      next.version = cur.version + 1;
      next.updatedAt = this.#now();
      this.objects.set(id, next);
      return { ...next };
    });
  }

  async listObjects(tenantId: string, f: ListFilter) {
    return [...this.objects.values()]
      .filter((o) => o.tenantId === tenantId && (f.projectId === undefined || o.projectId === f.projectId) && (!f.states || f.states.includes(o.state)) && (!f.afterId || o.id > f.afterId))
      .sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, f.limit ?? 100).map((o) => ({ ...o }));
  }
  async findByKey(provider: string, bucket: string, key: string) {
    for (const o of this.objects.values()) if (o.provider === provider && o.bucket === bucket && o.objectKey === key) return { ...o };
    return null;
  }
  async listExpiredUploads(now: Date, limit: number) {
    return [...this.objects.values()].filter((o) => (o.state === 'PENDING' || o.state === 'UPLOADING') && o.uploadExpiresAt && o.uploadExpiresAt <= now).slice(0, limit).map((o) => ({ ...o }));
  }
  async listByState(states: ObjectState[], olderThan: Date, limit: number) {
    return [...this.objects.values()].filter((o) => states.includes(o.state) && o.updatedAt <= olderThan).slice(0, limit).map((o) => ({ ...o }));
  }

  reserve(objectId: string, tenantId: string, bytes: number, expiresAt: Date, quota: number | null): Promise<ReserveResult> {
    return this.#serial(() => {
      if (bytes < 0) throw new Error('negative reservation');
      const u = this.#u(tenantId);
      const ex = this.reservations.get(objectId);
      if (ex) {
        if (ex.tenantId !== tenantId) throw new StorageError('FORBIDDEN', 'reservation tenant mismatch', 403);
        if (ex.state === 'ACTIVE' || ex.state === 'COMMITTED') return 'ALREADY_RESERVED';
      }
      if (quota !== null) {
        u.quotaBytes = quota;
        if (u.reservedBytes + u.committedBytes + bytes > quota) return 'QUOTA_EXCEEDED';
      }
      u.reservedBytes += bytes;
      this.reservations.set(objectId, { objectId, tenantId, bytes, state: 'ACTIVE', expiresAt });
      return 'OK';
    });
  }
  commit(objectId: string, actual: number): Promise<CommitResult> {
    return this.#serial(() => {
      this.#maybeFail('commit');
      const r = this.reservations.get(objectId);
      if (!r) return 'NO_RESERVATION';
      if (r.state === 'COMMITTED') return 'ALREADY_COMMITTED';
      if (r.state !== 'ACTIVE') return 'RESERVATION_LOST';
      if (actual > r.bytes) return 'SIZE_EXCEEDS_RESERVATION';
      const u = this.#u(r.tenantId);
      u.reservedBytes -= r.bytes;
      u.committedBytes += actual;
      r.bytes = actual;
      r.state = 'COMMITTED';
      return 'OK';
    });
  }
  release(objectId: string, finalState: 'RELEASED' | 'EXPIRED' = 'RELEASED'): Promise<'OK' | 'NOOP'> {
    return this.#serial(() => {
      const r = this.reservations.get(objectId);
      if (!r || r.state !== 'ACTIVE') return 'NOOP';
      const u = this.#u(r.tenantId);
      u.reservedBytes = Math.max(u.reservedBytes - r.bytes, 0);
      r.state = finalState;
      return 'OK';
    });
  }
  free(objectId: string): Promise<'OK' | 'NOOP'> {
    return this.#serial(() => {
      const r = this.reservations.get(objectId);
      if (!r || r.state !== 'COMMITTED') return 'NOOP';
      const u = this.#u(r.tenantId);
      u.committedBytes = Math.max(u.committedBytes - r.bytes, 0);
      r.state = 'FREED';
      return 'OK';
    });
  }
  async expireReservations(now: Date): Promise<number> {
    let n = 0;
    for (const r of [...this.reservations.values()]) {
      if (r.state === 'ACTIVE' && r.expiresAt <= now && (await this.release(r.objectId, 'EXPIRED')) === 'OK') n++;
    }
    return n;
  }
  reconcileUsage(tenantId: string): Promise<{ before: Usage; after: Usage }> {
    return this.#serial(() => {
      const u = this.#u(tenantId);
      const before = { ...u };
      let reserved = 0, committed = 0;
      for (const r of this.reservations.values()) {
        if (r.tenantId !== tenantId) continue;
        if (r.state === 'ACTIVE') reserved += r.bytes;
        if (r.state === 'COMMITTED') committed += r.bytes;
      }
      u.reservedBytes = reserved; u.committedBytes = committed;
      return { before, after: { ...u } };
    });
  }
  async getUsage(tenantId: string) { return { ...this.#u(tenantId) }; }
  async audit(e: AuditEvent) { this.auditLog.push(e); }
  async getProjectOwner(projectId: string) { return this.projects.get(projectId) ?? null; }

  /** test helper: simulate drift */
  corruptUsage(tenantId: string, delta: { reserved?: number; committed?: number }) {
    const u = this.#u(tenantId);
    u.reservedBytes += delta.reserved ?? 0;
    u.committedBytes += delta.committed ?? 0;
  }
  static newId() { return randomUUID(); }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
