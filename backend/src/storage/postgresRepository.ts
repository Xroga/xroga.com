import { StorageError, type ObjectState, type StorageObject } from './types.js';
import type {
  AuditEvent, CommitResult, ListFilter, NewObject, ObjectPatch, ReserveResult, StorageRepository, Usage,
} from './repository.js';

/** The subset of `pg.Pool` this repository needs. */
export interface SqlClient {
  query<R = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

type Row = Record<string, unknown>;
const d = (v: unknown) => (v == null ? null : v instanceof Date ? v : new Date(String(v)));
const n = (v: unknown) => (v == null ? null : Number(v));

function toObject(r: Row): StorageObject {
  return {
    id: String(r.id), tenantId: String(r.tenant_id), ownerUserId: String(r.owner_user_id),
    projectId: (r.project_id as string | null) ?? null, objectClass: r.object_class as StorageObject['objectClass'],
    originalFilename: String(r.original_filename), safeFilename: String(r.safe_filename),
    provider: r.provider as StorageObject['provider'], bucket: String(r.bucket), objectKey: String(r.object_key),
    contentType: String(r.content_type), declaredSize: Number(r.declared_size), sizeBytes: n(r.size_bytes),
    sha256Declared: (r.sha256_declared as string | null) ?? null, sha256Verified: (r.sha256_verified as string | null) ?? null,
    state: r.state as ObjectState, visibility: r.visibility as StorageObject['visibility'],
    uploadMode: r.upload_mode as StorageObject['uploadMode'], multipartUploadId: (r.multipart_upload_id as string | null) ?? null,
    uploadExpiresAt: d(r.upload_expires_at), retentionUntil: d(r.retention_until),
    providerVersion: (r.provider_version as string | null) ?? null, migrationJobId: (r.migration_job_id as string | null) ?? null,
    legacySource: (r.legacy_source as Record<string, unknown> | null) ?? null, verifiedAt: d(r.verified_at),
    verificationResult: (r.verification_result as Record<string, unknown> | null) ?? null,
    errorCode: (r.error_code as string | null) ?? null, errorDetail: (r.error_detail as string | null) ?? null,
    version: Number(r.version), createdAt: d(r.created_at) as Date, updatedAt: d(r.updated_at) as Date,
  };
}

const PATCH_COLUMNS: Record<string, string> = {
  state: 'state', sizeBytes: 'size_bytes', sha256Verified: 'sha256_verified', verifiedAt: 'verified_at',
  verificationResult: 'verification_result', errorCode: 'error_code', errorDetail: 'error_detail',
  providerVersion: 'provider_version', multipartUploadId: 'multipart_upload_id', uploadExpiresAt: 'upload_expires_at',
  retentionUntil: 'retention_until', visibility: 'visibility', deletingAt: 'deleting_at', deletedAt: 'deleted_at',
};

export class PostgresStorageRepository implements StorageRepository {
  constructor(private readonly db: SqlClient) {}

  async insertObject(o: NewObject): Promise<StorageObject> {
    try {
      const r = await this.db.query(
        `insert into public.storage_objects
          (id, tenant_id, owner_user_id, project_id, object_class, original_filename, safe_filename, provider, bucket, object_key,
           content_type, declared_size, sha256_declared, upload_mode, upload_expires_at, migration_job_id, legacy_source)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,
        [o.id, o.tenantId, o.ownerUserId, o.projectId, o.objectClass, o.originalFilename, o.safeFilename, o.provider, o.bucket,
         o.objectKey, o.contentType, o.declaredSize, o.sha256Declared, o.uploadMode, o.uploadExpiresAt, o.migrationJobId ?? null,
         o.legacySource ? JSON.stringify(o.legacySource) : null],
      );
      return toObject(r.rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new StorageError('CONFLICT', 'object key already exists', 409);
      throw err;
    }
  }

  async getObject(id: string) {
    const r = await this.db.query('select * from public.storage_objects where id = $1', [id]);
    return r.rows[0] ? toObject(r.rows[0]) : null;
  }

  async updateObject(id: string, from: ObjectState[], patch: ObjectPatch): Promise<StorageObject | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, from];
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      const col = PATCH_COLUMNS[k];
      if (!col) throw new Error(`unpatchable column ${k}`);
      params.push(k === 'verificationResult' && v ? JSON.stringify(v) : v);
      sets.push(`${col} = $${params.length}`);
    }
    if (!sets.length) return this.getObject(id);
    try {
      const r = await this.db.query(`update public.storage_objects set ${sets.join(', ')} where id = $1 and state = any($2::text[]) returning *`, params);
      return r.rows[0] ? toObject(r.rows[0]) : null;
    } catch (err) {
      if ((err as { code?: string }).code === '23514') throw new StorageError('BAD_STATE', 'state transition rejected by database', 409);
      throw err;
    }
  }

  async listObjects(tenantId: string, f: ListFilter) {
    const params: unknown[] = [tenantId];
    let where = 'tenant_id = $1';
    if (f.projectId !== undefined) { params.push(f.projectId); where += f.projectId === null ? ' and project_id is null' : ` and project_id = $${params.length}`; if (f.projectId === null) params.pop(); }
    if (f.states) { params.push(f.states); where += ` and state = any($${params.length}::text[])`; }
    if (f.afterId) { params.push(f.afterId); where += ` and id > $${params.length}`; }
    params.push(f.limit ?? 100);
    const r = await this.db.query(`select * from public.storage_objects where ${where} order by id limit $${params.length}`, params);
    return r.rows.map(toObject);
  }
  async findByKey(provider: string, bucket: string, key: string) {
    const r = await this.db.query('select * from public.storage_objects where provider=$1 and bucket=$2 and object_key=$3', [provider, bucket, key]);
    return r.rows[0] ? toObject(r.rows[0]) : null;
  }
  async listExpiredUploads(now: Date, limit: number) {
    const r = await this.db.query(`select * from public.storage_objects where state in ('PENDING','UPLOADING') and upload_expires_at <= $1 order by upload_expires_at limit $2`, [now, limit]);
    return r.rows.map(toObject);
  }
  async listByState(states: ObjectState[], olderThan: Date, limit: number) {
    const r = await this.db.query('select * from public.storage_objects where state = any($1::text[]) and updated_at <= $2 order by updated_at limit $3', [states, olderThan, limit]);
    return r.rows.map(toObject);
  }

  async reserve(objectId: string, tenantId: string, bytes: number, expiresAt: Date, quota: number | null): Promise<ReserveResult> {
    const r = await this.db.query<{ v: ReserveResult }>('select public.storage_reserve($1,$2,$3,$4,$5) as v', [objectId, tenantId, bytes, expiresAt, quota]);
    return r.rows[0].v;
  }
  async commit(objectId: string, actual: number): Promise<CommitResult> {
    const r = await this.db.query<{ v: CommitResult }>('select public.storage_commit($1,$2) as v', [objectId, actual]);
    return r.rows[0].v;
  }
  async release(objectId: string, finalState: 'RELEASED' | 'EXPIRED' = 'RELEASED') {
    const r = await this.db.query<{ v: 'OK' | 'NOOP' }>('select public.storage_release($1,$2) as v', [objectId, finalState]);
    return r.rows[0].v;
  }
  async free(objectId: string) {
    const r = await this.db.query<{ v: 'OK' | 'NOOP' }>('select public.storage_free($1) as v', [objectId]);
    return r.rows[0].v;
  }
  async expireReservations(now: Date) {
    const r = await this.db.query<{ v: number }>('select public.storage_expire_reservations($1) as v', [now]);
    return Number(r.rows[0].v);
  }
  async reconcileUsage(tenantId: string) {
    const r = await this.db.query<{ old_reserved: string; old_committed: string; new_reserved: string; new_committed: string }>('select * from public.storage_reconcile_usage($1)', [tenantId]);
    const x = r.rows[0];
    return {
      before: { tenantId, reservedBytes: Number(x.old_reserved), committedBytes: Number(x.old_committed), quotaBytes: null },
      after: { tenantId, reservedBytes: Number(x.new_reserved), committedBytes: Number(x.new_committed), quotaBytes: null },
    };
  }
  async getUsage(tenantId: string): Promise<Usage> {
    const r = await this.db.query('select * from public.storage_usage where tenant_id = $1', [tenantId]);
    const x = r.rows[0];
    return x ? { tenantId, reservedBytes: Number(x.reserved_bytes), committedBytes: Number(x.committed_bytes), quotaBytes: n(x.quota_bytes) }
             : { tenantId, reservedBytes: 0, committedBytes: 0, quotaBytes: null };
  }
  async audit(e: AuditEvent) {
    await this.db.query('insert into public.storage_audit_events (tenant_id, actor_user_id, object_id, action, outcome, detail) values ($1,$2,$3,$4,$5,$6)',
      [e.tenantId, e.actorUserId, e.objectId, e.action, e.outcome, JSON.stringify(e.detail ?? {})]);
  }
  async getProjectOwner(projectId: string) {
    const r = await this.db.query<{ user_id: string }>('select user_id from public.projects where id = $1', [projectId]);
    return r.rows[0]?.user_id ?? null;
  }
}
