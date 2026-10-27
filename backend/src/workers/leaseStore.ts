/**
 * Fenced task leases for workers that run tasks of the canonical task graph (`ai/taskGraph.ts`).
 *
 * The task graph says WHAT may run and in what order; it has no notion of WHO is running a task. A single process never needed one.
 * Once a worker can crash, stall or be replaced, two workers can believe they own the same task, and the slower one must not be
 * able to write anything after the faster one took over. A lease alone cannot guarantee that (a paused worker wakes up believing
 * it still holds it), so every acquisition carries a monotonically increasing FENCING TOKEN and every effect boundary re-checks it.
 *
 * The key includes the tenant so two tenants whose run ids collide can never share, steal or block each other's lease.
 * `MemoryLeaseStore` is the reference; any durable store must pass `leaseStore.contract.ts`.
 */

export interface LeaseKey {
  tenantId: string;
  runId: string;
  taskId: string;
}

export interface Lease extends LeaseKey {
  workerId: string;
  /** Increases on every acquisition of this key, never repeats. A writer holding an older token is stale. */
  token: number;
  expiresAt: number;
}

export type LeaseFailure = 'LEASE_LOST' | 'LEASE_EXPIRED' | 'LEASE_INVALID';

export class LeaseError extends Error {
  readonly code: LeaseFailure;
  constructor(code: LeaseFailure, message: string) {
    super(message);
    this.name = 'LeaseError';
    this.code = code;
  }
}

export interface LeaseStore {
  /** Takes the lease when it is free or expired. Returns null while another worker holds a live lease. */
  acquire(key: LeaseKey, workerId: string, ttlMs: number): Promise<Lease | null>;
  /** Extends a lease this worker still holds. Throws LeaseError when it was lost, expired or superseded. */
  renew(lease: Lease, ttlMs: number): Promise<Lease>;
  /** Releases a lease. Releasing a lease that is no longer current is a no-op, never an error and never a release of the new holder's lease. */
  release(lease: Lease): Promise<void>;
  /** Throws unless `lease` is still the current, unexpired lease. Call it immediately before every consequential effect. */
  assertCurrent(lease: Lease): Promise<void>;
  /** Live (unexpired) lease holder for a key, for scheduling decisions. Never a basis for writing. */
  holder(key: LeaseKey): Promise<Lease | null>;
}

const keyOf = (k: LeaseKey) => JSON.stringify([k.tenantId, k.runId, k.taskId]);

function checkKey(key: LeaseKey, workerId?: string): void {
  for (const part of [key.tenantId, key.runId, key.taskId, ...(workerId === undefined ? [] : [workerId])]) {
    if (typeof part !== 'string' || !part.trim()) throw new LeaseError('LEASE_INVALID', 'a lease needs tenant, run, task and worker identifiers');
  }
}

function checkTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 15 * 60_000) throw new LeaseError('LEASE_INVALID', 'lease ttl must be between 1 ms and 15 minutes');
}

interface Row {
  workerId: string;
  token: number;
  expiresAt: number;
  /** false once released: the row is kept so the token sequence never restarts */
  held: boolean;
}

export class MemoryLeaseStore implements LeaseStore {
  readonly #rows = new Map<string, Row>();
  constructor(private readonly now: () => number = Date.now) {}

  async acquire(key: LeaseKey, workerId: string, ttlMs: number): Promise<Lease | null> {
    checkKey(key, workerId);
    checkTtl(ttlMs);
    const id = keyOf(key);
    const current = this.#rows.get(id);
    const t = this.now();
    if (current?.held && current.expiresAt > t) return null;
    const row: Row = { workerId, token: (current?.token ?? 0) + 1, expiresAt: t + ttlMs, held: true };
    this.#rows.set(id, row);
    return { ...key, workerId, token: row.token, expiresAt: row.expiresAt };
  }

  #current(lease: Lease): Row {
    checkKey(lease, lease.workerId);
    const row = this.#rows.get(keyOf(lease));
    if (!row || !row.held || row.workerId !== lease.workerId || row.token !== lease.token) throw new LeaseError('LEASE_LOST', 'another worker holds or has held this task since the lease was issued');
    if (row.expiresAt <= this.now()) throw new LeaseError('LEASE_EXPIRED', 'the lease expired');
    return row;
  }

  async renew(lease: Lease, ttlMs: number): Promise<Lease> {
    checkTtl(ttlMs);
    const row = this.#current(lease);
    row.expiresAt = this.now() + ttlMs;
    return { ...lease, expiresAt: row.expiresAt };
  }

  async release(lease: Lease): Promise<void> {
    const row = this.#rows.get(keyOf(lease));
    if (row && row.held && row.workerId === lease.workerId && row.token === lease.token) row.held = false;
  }

  async assertCurrent(lease: Lease): Promise<void> {
    this.#current(lease);
  }

  async holder(key: LeaseKey): Promise<Lease | null> {
    checkKey(key);
    const row = this.#rows.get(keyOf(key));
    if (!row || !row.held || row.expiresAt <= this.now()) return null;
    return { ...key, workerId: row.workerId, token: row.token, expiresAt: row.expiresAt };
  }
}
