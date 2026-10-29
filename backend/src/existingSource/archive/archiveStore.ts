/**
 * Tenant-isolated storage of imported archives. Every method names the verified owner; an archive of another owner reads as absent.
 * An archive is deleted together with the binding it was linked to (unlink, or the binding row being removed).
 */
import { getTenantSupabaseAdmin } from '../../security/serviceRoleGuard.js';
import { requireTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { ExistingSourceError } from '../types.js';
import type { ArchiveFile, ArchiveRecord } from './archivePort.js';

export interface ArchiveStore {
  /** Idempotent by (owner, content digest): importing the same archive again returns the existing record. */
  save(userId: string, input: { name: string; digest: string; files: readonly ArchiveFile[] }): Promise<{ record: ArchiveRecord; created: boolean }>;
  load(userId: string, archiveNumber: string): Promise<ArchiveRecord | null>;
  attach(userId: string, archiveNumber: string, bindingId: string): Promise<void>;
  deleteForBinding(userId: string, bindingId: string): Promise<void>;
}

const failed = (what: string): never => { throw new ExistingSourceError('STORAGE_FAILED', `Could not ${what}. Retry shortly.`); };

export class InMemoryArchiveStore implements ArchiveStore {
  private next = 1000;
  private readonly rows = new Map<string, ArchiveRecord & { bindingId: string | null }>();
  async save(userId: string, input: { name: string; digest: string; files: readonly ArchiveFile[] }) {
    for (const r of this.rows.values()) if (r.ownerUserId === userId && r.digest === input.digest) return { record: structuredClone(r), created: false };
    const record = { number: String(this.next++), ownerUserId: userId, name: input.name, digest: input.digest, files: structuredClone([...input.files]), createdAt: new Date().toISOString(), bindingId: null };
    this.rows.set(record.number, record);
    return { record: structuredClone(record), created: true };
  }
  async load(userId: string, archiveNumber: string) { const r = this.rows.get(archiveNumber); return r && r.ownerUserId === userId ? structuredClone(r) : null; }
  async attach(userId: string, archiveNumber: string, bindingId: string) { const r = this.rows.get(archiveNumber); if (r && r.ownerUserId === userId) r.bindingId = bindingId; }
  async deleteForBinding(userId: string, bindingId: string) { for (const [k, r] of this.rows) if (r.ownerUserId === userId && r.bindingId === bindingId) this.rows.delete(k); }
  count(userId: string): number { return [...this.rows.values()].filter((r) => r.ownerUserId === userId).length; }
}

interface Row { archive_number: number | string; owner_user_id: string; name: string; digest: string; files: ArchiveFile[]; created_at: string }
const toRecord = (r: Row): ArchiveRecord => ({ number: String(r.archive_number), ownerUserId: r.owner_user_id, name: r.name, digest: r.digest, files: r.files, createdAt: r.created_at });
const COLUMNS = 'archive_number,owner_user_id,name,digest,files,created_at';

export class SupabaseArchiveStore implements ArchiveStore {
  constructor(private readonly tenant: TenantContext) { requireTenantContext(tenant); }
  private db() { return getTenantSupabaseAdmin(this.tenant); }
  private owner(userId: string): string {
    if (userId !== requireTenantContext(this.tenant).userId) throw new ExistingSourceError('BINDING_NOT_FOUND', 'Linked repository not found.');
    return userId;
  }

  async save(userId: string, input: { name: string; digest: string; files: readonly ArchiveFile[] }) {
    const owner = this.owner(userId);
    const existing = await this.db().from('existing_source_archives').select(COLUMNS).eq('owner_user_id', owner).eq('digest', input.digest).maybeSingle();
    if (existing.error) failed('read the archive');
    if (existing.data) return { record: toRecord(existing.data as Row), created: false };
    const keptBytes = input.files.reduce((n, f) => n + (f.text === null ? 0 : Buffer.byteLength(f.text)), 0);
    const inserted = await this.db().from('existing_source_archives').insert({ owner_user_id: owner, name: input.name, digest: input.digest, file_count: input.files.length, kept_bytes: keptBytes, files: input.files }).select(COLUMNS).single();
    if (inserted.error) {
      const raced = await this.db().from('existing_source_archives').select(COLUMNS).eq('owner_user_id', owner).eq('digest', input.digest).maybeSingle();
      if (!raced.error && raced.data) return { record: toRecord(raced.data as Row), created: false };
      failed('store the archive');
    }
    return { record: toRecord(inserted.data as Row), created: true };
  }

  async load(userId: string, archiveNumber: string) {
    const owner = this.owner(userId);
    if (!/^[0-9]{1,18}$/.test(archiveNumber)) return null;
    const { data, error } = await this.db().from('existing_source_archives').select(COLUMNS).eq('owner_user_id', owner).eq('archive_number', archiveNumber).maybeSingle();
    if (error) failed('read the archive');
    return data ? toRecord(data as Row) : null;
  }

  async attach(userId: string, archiveNumber: string, bindingId: string) {
    const owner = this.owner(userId);
    const { error } = await this.db().from('existing_source_archives').update({ binding_id: bindingId }).eq('owner_user_id', owner).eq('archive_number', archiveNumber);
    if (error) failed('link the archive');
  }

  async deleteForBinding(userId: string, bindingId: string) {
    const owner = this.owner(userId);
    const { error } = await this.db().from('existing_source_archives').delete().eq('owner_user_id', owner).eq('binding_id', bindingId);
    if (error) failed('remove the archive');
  }
}
