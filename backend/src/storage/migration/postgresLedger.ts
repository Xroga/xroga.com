import type { SqlClient } from '../postgresRepository.js';
import type { ItemPatch, MigrationLedger, NewJob } from './ledger.js';
import type { DiscoveredItem, Item, ItemStatus, Job, SourceProvider, Stage } from './types.js';

type Row = Record<string, unknown>;
const d = (v: unknown) => (v == null ? null : v instanceof Date ? v : new Date(String(v)));
const n = (v: unknown) => (v == null ? null : Number(v));

const toJob = (r: Row): Job => ({
  id: String(r.id), name: String(r.name), sourceProvider: r.source_provider as SourceProvider, sourceSelector: (r.source_selector ?? {}) as Record<string, unknown>,
  destinationBucket: String(r.destination_bucket), mode: r.mode as Job['mode'], phase: r.phase as Job['phase'], status: r.status as Job['status'],
  cursor: (r.cursor ?? {}) as Record<string, unknown>, approvals: (r.approvals ?? {}) as Job['approvals'], createdBy: String(r.created_by),
});
const toItem = (r: Row): Item => ({
  id: String(r.id), jobId: String(r.job_id), sourceProvider: r.source_provider as SourceProvider, sourceId: String(r.source_id),
  tenantId: (r.tenant_id as string | null) ?? null, ownerUserId: (r.owner_user_id as string | null) ?? null, projectId: (r.project_id as string | null) ?? null,
  sourceSize: n(r.source_size), sourceSha256: (r.source_sha256 as string | null) ?? null, sourceFingerprint: (r.source_fingerprint as string | null) ?? null,
  sourceContentType: (r.source_content_type as string | null) ?? null, sourceFilename: (r.source_filename as string | null) ?? null,
  objectClass: (r.object_class as Item['objectClass']) ?? null, destinationObjectId: (r.destination_object_id as string | null) ?? null,
  destinationKey: (r.destination_key as string | null) ?? null, destinationSha256: (r.destination_sha256 as string | null) ?? null,
  status: r.status as ItemStatus, skipReason: (r.skip_reason as string | null) ?? null, attempts: Number(r.attempts), lastErrorClass: (r.last_error_class as string | null) ?? null,
  lastError: (r.last_error as string | null) ?? null, leaseOwner: (r.lease_owner as string | null) ?? null, leaseExpiresAt: d(r.lease_expires_at),
  readMode: r.read_mode as Item['readMode'], sourceRetention: r.source_retention as Item['sourceRetention'],
  rollbackRef: (r.rollback_ref as Record<string, unknown> | null) ?? null, startedAt: d(r.started_at), completedAt: d(r.completed_at), verifiedAt: d(r.verified_at),
});

const COL: Record<string, string> = {
  tenantId: 'tenant_id', ownerUserId: 'owner_user_id', projectId: 'project_id', sourceSize: 'source_size', sourceSha256: 'source_sha256',
  sourceFingerprint: 'source_fingerprint', sourceContentType: 'source_content_type', sourceFilename: 'source_filename', objectClass: 'object_class',
  destinationObjectId: 'destination_object_id', destinationKey: 'destination_key', destinationSha256: 'destination_sha256', status: 'status',
  skipReason: 'skip_reason', lastErrorClass: 'last_error_class', lastError: 'last_error', readMode: 'read_mode', sourceRetention: 'source_retention',
  rollbackRef: 'rollback_ref', completedAt: 'completed_at', verifiedAt: 'verified_at',
};

export class PostgresLedger implements MigrationLedger {
  constructor(private readonly db: SqlClient) {}

  async createJob(j: NewJob) {
    const r = await this.db.query(`insert into public.storage_migration_jobs (name, source_provider, source_selector, destination_bucket, mode, created_by) values ($1,$2,$3,$4,$5,$6) returning *`,
      [j.name, j.sourceProvider, JSON.stringify(j.sourceSelector ?? {}), j.destinationBucket, j.mode, j.createdBy]);
    return toJob(r.rows[0]);
  }
  async getJob(id: string) { const r = await this.db.query('select * from public.storage_migration_jobs where id=$1', [id]); return r.rows[0] ? toJob(r.rows[0]) : null; }
  async updateJob(id: string, patch: Partial<Pick<Job, 'phase' | 'status' | 'cursor' | 'mode'>>) {
    const sets: string[] = ['updated_at = now()']; const p: unknown[] = [id];
    for (const [k, v] of Object.entries(patch)) { if (v === undefined) continue; p.push(k === 'cursor' ? JSON.stringify(v) : v); sets.push(`${k} = $${p.length}`); }
    const r = await this.db.query(`update public.storage_migration_jobs set ${sets.join(', ')} where id=$1 returning *`, p);
    return toJob(r.rows[0]);
  }
  async approve(id: string, stage: Stage, by: string, ref: string) {
    const r = await this.db.query(`update public.storage_migration_jobs set approvals = approvals || jsonb_build_object($2::text, jsonb_build_object('by',$3::text,'ref',$4::text,'at',now()::text)), updated_at=now() where id=$1 returning *`, [id, stage, by, ref]);
    return toJob(r.rows[0]);
  }
  async upsertDiscovered(jobId: string, provider: SourceProvider, items: DiscoveredItem[]) {
    let inserted = 0, unchanged = 0, changed = 0;
    for (const it of items) {
      const ins = await this.db.query(`insert into public.storage_migration_items (job_id, source_provider, source_id, tenant_id, owner_user_id, project_id, source_size, source_fingerprint, source_content_type, source_filename, object_class)
        values ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10) on conflict (source_provider, source_id) do nothing returning id`,
        [jobId, provider, it.sourceId, it.ownerUserId, it.projectId, it.size, it.fingerprint, it.contentType, it.filename, it.objectClass]);
      if (ins.rowCount) { inserted++; continue; }
      const up = await this.db.query(`update public.storage_migration_items set source_fingerprint=$3, source_size=$4, job_id=$5, source_sha256=null, updated_at=now(),
          status = case when status in ('VERIFIED','COPIED') then 'SOURCE_CHANGED' else 'DISCOVERED' end
        where source_provider=$1 and source_id=$2 and source_fingerprint is distinct from $3 returning id`, [provider, it.sourceId, it.fingerprint, it.size, jobId]);
      if (up.rowCount) changed++; else unchanged++;
    }
    return { inserted, unchanged, changed };
  }
  async claim(jobId: string, worker: string, limit: number, leaseSeconds: number) {
    const r = await this.db.query('select * from public.storage_migration_claim($1,$2,$3,$4)', [jobId, worker, limit, leaseSeconds]);
    return r.rows.map(toItem);
  }
  async updateItem(id: string, patch: ItemPatch, opts: { worker?: string } = {}) {
    const sets: string[] = ['updated_at = now()']; const p: unknown[] = [id];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || k === 'releaseLease' || k === 'backoffSeconds') continue;
      const col = COL[k]; if (!col) throw new Error(`unpatchable ${k}`);
      p.push(k === 'rollbackRef' && v ? JSON.stringify(v) : v); sets.push(`${col} = $${p.length}`);
    }
    if (patch.releaseLease) sets.push('lease_owner = null', 'lease_expires_at = null');
    if (patch.backoffSeconds !== undefined) { p.push(patch.backoffSeconds); sets.push('lease_owner = null', `lease_expires_at = now() + make_interval(secs => $${p.length})`); }
    let where = 'id = $1';
    if (opts.worker) { p.push(opts.worker); where += ` and lease_owner = $${p.length}`; }
    const r = await this.db.query(`update public.storage_migration_items set ${sets.join(', ')} where ${where} returning *`, p);
    return r.rows[0] ? toItem(r.rows[0]) : null;
  }
  async listItems(jobId: string, statuses: ItemStatus[] | null, limit: number, afterId?: string) {
    const p: unknown[] = [jobId]; let w = 'job_id = $1';
    if (statuses) { p.push(statuses); w += ` and status = any($${p.length}::text[])`; }
    if (afterId) { p.push(afterId); w += ` and id > $${p.length}`; }
    p.push(limit);
    return (await this.db.query(`select * from public.storage_migration_items where ${w} order by id limit $${p.length}`, p)).rows.map(toItem);
  }
  async getItemBySource(provider: SourceProvider, sourceId: string) {
    const r = await this.db.query('select * from public.storage_migration_items where source_provider=$1 and source_id=$2', [provider, sourceId]);
    return r.rows[0] ? toItem(r.rows[0]) : null;
  }
  async countsByStatus(jobId: string) {
    const r = await this.db.query(`select status, skip_reason, read_mode, source_retention, count(*)::int n, coalesce(sum(source_size),0)::bigint bytes from public.storage_migration_items where job_id=$1 group by 1,2,3,4`, [jobId]);
    return r.rows.map((x) => ({ status: x.status as ItemStatus, skipReason: (x.skip_reason as string | null) ?? null, readMode: String(x.read_mode), sourceRetention: String(x.source_retention), n: Number(x.n), bytes: Number(x.bytes) }));
  }
}
