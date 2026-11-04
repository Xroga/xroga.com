/** Tenant-isolated persistence of change tasks. Every method names the verified owner; another owner's change reads as absent. */
import { getTenantSupabaseAdmin } from '../../security/serviceRoleGuard.js';
import { requireTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { ExistingSourceError } from '../types.js';
import type { ChangeTask } from './types.js';

export interface ChangeStore {
  /** Creates or replaces the task. The owner on the task must be the caller. */
  save(userId: string, task: ChangeTask): Promise<void>;
  get(userId: string, changeId: string): Promise<ChangeTask | null>;
  list(userId: string, bindingId: string, limit?: number): Promise<ChangeTask[]>;
  deleteForBinding(userId: string, bindingId: string): Promise<void>;
  /** Removes one change. Another owner's change reads as absent and is never touched. */
  delete(userId: string, changeId: string): Promise<void>;
}

const failed = (what: string): never => { throw new ExistingSourceError('STORAGE_FAILED', `Could not ${what}. Retry shortly.`); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InMemoryChangeStore implements ChangeStore {
  private readonly rows = new Map<string, ChangeTask>();
  async save(userId: string, task: ChangeTask) {
    if (task.ownerUserId !== userId) throw new ExistingSourceError('CHANGE_NOT_FOUND', 'Change not found.');
    const existing = this.rows.get(task.id);
    if (existing && existing.ownerUserId !== userId) throw new ExistingSourceError('CHANGE_NOT_FOUND', 'Change not found.');
    this.rows.set(task.id, structuredClone(task));
  }
  async get(userId: string, changeId: string) { const r = this.rows.get(changeId); return r && r.ownerUserId === userId ? structuredClone(r) : null; }
  async list(userId: string, bindingId: string, limit = 20) {
    return [...this.rows.values()].filter((r) => r.ownerUserId === userId && r.bindingId === bindingId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit).map((r) => structuredClone(r));
  }
  async deleteForBinding(userId: string, bindingId: string) { for (const [k, r] of this.rows) if (r.ownerUserId === userId && r.bindingId === bindingId) this.rows.delete(k); }
  async delete(userId: string, changeId: string) { const r = this.rows.get(changeId); if (r && r.ownerUserId === userId) this.rows.delete(changeId); }
  count(userId: string): number { return [...this.rows.values()].filter((r) => r.ownerUserId === userId).length; }
}

type Payload = Omit<ChangeTask, 'id' | 'ownerUserId' | 'bindingId' | 'instruction' | 'status' | 'baseCommitSha' | 'createdAt' | 'updatedAt'>;
interface Row { id: string; owner_user_id: string; binding_id: string; status: ChangeTask['status']; base_commit_sha: string; instruction: string; payload: Payload; created_at: string; updated_at: string }
const COLUMNS = 'id,owner_user_id,binding_id,status,base_commit_sha,instruction,payload,created_at,updated_at';
const toTask = (r: Row): ChangeTask => ({ id: r.id, ownerUserId: r.owner_user_id, bindingId: r.binding_id, instruction: r.instruction, status: r.status, baseCommitSha: r.base_commit_sha, createdAt: r.created_at, updatedAt: r.updated_at, ...r.payload });

export class SupabaseChangeStore implements ChangeStore {
  constructor(private readonly tenant: TenantContext) { requireTenantContext(tenant); }
  private db() { return getTenantSupabaseAdmin(this.tenant); }
  private owner(userId: string): string {
    if (userId !== requireTenantContext(this.tenant).userId) throw new ExistingSourceError('CHANGE_NOT_FOUND', 'Change not found.');
    return userId;
  }

  async save(userId: string, task: ChangeTask) {
    const owner = this.owner(userId);
    if (task.ownerUserId !== owner) throw new ExistingSourceError('CHANGE_NOT_FOUND', 'Change not found.');
    const { id, ownerUserId: _o, bindingId, instruction, status, baseCommitSha, createdAt, updatedAt, ...payload } = task;
    const body = JSON.stringify(payload);
    const { error } = await this.db().from('existing_source_changes').upsert({ id, owner_user_id: owner, binding_id: bindingId, instruction, status, base_commit_sha: baseCommitSha, payload, payload_bytes: Buffer.byteLength(body), created_at: createdAt, updated_at: updatedAt }, { onConflict: 'id' });
    if (error) failed('save the change');
  }

  async get(userId: string, changeId: string) {
    const owner = this.owner(userId);
    if (!UUID.test(changeId)) return null;
    const { data, error } = await this.db().from('existing_source_changes').select(COLUMNS).eq('owner_user_id', owner).eq('id', changeId).maybeSingle();
    if (error) failed('read the change');
    return data ? toTask(data as Row) : null;
  }

  async list(userId: string, bindingId: string, limit = 20) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('existing_source_changes').select(COLUMNS).eq('owner_user_id', owner).eq('binding_id', bindingId).order('created_at', { ascending: false }).limit(Math.min(50, Math.max(1, limit)));
    if (error) failed('list changes');
    return ((data ?? []) as Row[]).map(toTask);
  }

  async delete(userId: string, changeId: string) {
    const owner = this.owner(userId);
    if (!UUID.test(changeId)) return;
    const { error } = await this.db().from('existing_source_changes').delete().eq('owner_user_id', owner).eq('id', changeId);
    if (error) failed('remove the change');
  }

  async deleteForBinding(userId: string, bindingId: string) {
    const owner = this.owner(userId);
    const { error } = await this.db().from('existing_source_changes').delete().eq('owner_user_id', owner).eq('binding_id', bindingId);
    if (error) failed('remove the changes');
  }
}
