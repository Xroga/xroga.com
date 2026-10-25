/**
 * Durable LeaseStore on PostgreSQL (`supabase/migrations/20261024000000_worker_task_leases.sql`).
 *
 * Every decision is made inside one SQL statement or function, so two workers on two machines cannot both win: the row's primary key
 * serialises acquisition, and the fencing token only ever increases. Time normally comes from the database clock (`now` omitted), which
 * no worker can skew; a caller-supplied `now` exists so tests can make expiry deterministic.
 */
import type { Pool } from 'pg';
import { LeaseError, type Lease, type LeaseKey, type LeaseStore } from './leaseStore.js';

const MAX_TTL_MS = 15 * 60_000;

function checkKey(key: LeaseKey, workerId?: string): void {
  for (const part of [key.tenantId, key.runId, key.taskId, ...(workerId === undefined ? [] : [workerId])]) {
    if (typeof part !== 'string' || !part.trim() || part.length > 128) throw new LeaseError('LEASE_INVALID', 'a lease needs tenant, run, task and worker identifiers');
  }
}
function checkTtl(ttlMs: number): void {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > MAX_TTL_MS) throw new LeaseError('LEASE_INVALID', 'lease ttl must be between 1 ms and 15 minutes');
}

export class PostgresLeaseStore implements LeaseStore {
  constructor(private readonly pool: Pick<Pool, 'query'>, private readonly now?: () => number) {}

  /** null = let the database decide */
  private at(): Date | null { return this.now ? new Date(this.now()) : null; }
  private ms(): number { return this.now ? this.now() : Date.now(); }

  async acquire(key: LeaseKey, workerId: string, ttlMs: number): Promise<Lease | null> {
    checkKey(key, workerId);
    checkTtl(ttlMs);
    const r = await this.pool.query<{ token: string | null }>('select public.worker_lease_acquire($1,$2,$3,$4,$5,$6) as token', [key.tenantId, key.runId, key.taskId, workerId, ttlMs, this.at()]);
    const token = r.rows[0]?.token;
    if (token === null || token === undefined) return null;
    return { ...key, workerId, token: Number(token), expiresAt: this.ms() + ttlMs };
  }

  private async classify(lease: Lease): Promise<'ok' | 'expired' | 'lost'> {
    const r = await this.pool.query<{ s: string }>('select public.worker_lease_check($1,$2,$3,$4,$5,$6) as s', [lease.tenantId, lease.runId, lease.taskId, lease.workerId, lease.token, this.at()]);
    return (r.rows[0]?.s ?? 'lost') as 'ok' | 'expired' | 'lost';
  }

  private refuse(status: 'expired' | 'lost'): never {
    if (status === 'expired') throw new LeaseError('LEASE_EXPIRED', 'the lease expired');
    throw new LeaseError('LEASE_LOST', 'another worker holds or has held this task since the lease was issued');
  }

  async renew(lease: Lease, ttlMs: number): Promise<Lease> {
    checkKey(lease, lease.workerId);
    checkTtl(ttlMs);
    const r = await this.pool.query<{ s: string }>('select public.worker_lease_renew($1,$2,$3,$4,$5,$6,$7) as s', [lease.tenantId, lease.runId, lease.taskId, lease.workerId, lease.token, ttlMs, this.at()]);
    const s = r.rows[0]?.s ?? 'lost';
    if (s !== 'ok') this.refuse(s as 'expired' | 'lost');
    return { ...lease, expiresAt: this.ms() + ttlMs };
  }

  async release(lease: Lease): Promise<void> {
    await this.pool.query('select public.worker_lease_release($1,$2,$3,$4,$5)', [lease.tenantId, lease.runId, lease.taskId, lease.workerId, lease.token]);
  }

  async assertCurrent(lease: Lease): Promise<void> {
    checkKey(lease, lease.workerId);
    const s = await this.classify(lease);
    if (s !== 'ok') this.refuse(s);
  }

  async holder(key: LeaseKey): Promise<Lease | null> {
    checkKey(key);
    const r = await this.pool.query<{ worker_id: string; token: string; expires_at: Date }>(
      'select worker_id, token, expires_at from public.worker_task_leases where tenant_id=$1 and run_id=$2 and task_id=$3 and held and expires_at > coalesce($4::timestamptz, clock_timestamp())',
      [key.tenantId, key.runId, key.taskId, this.at()],
    );
    const row = r.rows[0];
    return row ? { ...key, workerId: row.worker_id, token: Number(row.token), expiresAt: row.expires_at.getTime() } : null;
  }
}
