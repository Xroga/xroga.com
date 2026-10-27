/**
 * Owner-scoped persistence for existing-source bindings. Every method takes the verified owner first and treats another owner's row
 * as absent, so a guessed binding id never reads, updates or reveals anything.
 */
import { randomUUID } from 'node:crypto';
import { getTenantSupabaseAdmin } from '../security/serviceRoleGuard.js';
import { requireTenantContext, type TenantContext } from '../security/tenantContext.js';
import type { BindingState, IndexStatus, RepositoryPermissions, SourceBinding } from './types.js';
import { ExistingSourceError } from './types.js';

export interface UpsertBindingInput {
  providerRepositoryId: string;
  accountBindingId: string;
  accountLogin: string;
  installationId: string | null;
  ownerAccountId: string;
  repositoryFullName: string;
  repositoryPrivate: boolean;
  repositoryArchived: boolean;
  baseBranch: string;
  baseCommitSha: string;
  permissions: RepositoryPermissions;
  projectId: string | null;
}

export type BindingPatch = Partial<Pick<SourceBinding,
  'projectId' | 'accountBindingId' | 'accountLogin' | 'repositoryFullName' | 'repositoryPrivate' | 'repositoryArchived' | 'baseBranch' | 'baseCommitSha'
  | 'permissions' | 'state' | 'stateReason' | 'indexStatus' | 'ownerAccountId'>> & { verifiedAt?: string };

export interface SourceBindingStore {
  /** Creates the binding, or refreshes the existing one for the same owner and repository (idempotent). */
  upsert(userId: string, input: UpsertBindingInput): Promise<{ binding: SourceBinding; created: boolean }>;
  get(userId: string, bindingId: string): Promise<SourceBinding | null>;
  list(userId: string): Promise<SourceBinding[]>;
  update(userId: string, bindingId: string, patch: BindingPatch): Promise<SourceBinding | null>;
  /** Marks every active binding of this owner as having lost access (the connection was removed or revoked). */
  markAllAccessLost(userId: string, reason: string): Promise<number>;
}

const clone = <T>(v: T): T => structuredClone(v);

export class InMemorySourceBindingStore implements SourceBindingStore {
  private readonly rows = new Map<string, SourceBinding>();
  constructor(private readonly clock: () => number = Date.now) {}
  private stamp(): string { return new Date(this.clock()).toISOString(); }

  async upsert(userId: string, input: UpsertBindingInput) {
    const now = this.stamp();
    for (const row of this.rows.values()) {
      if (row.ownerUserId === userId && row.providerRepositoryId === input.providerRepositoryId) {
        const next: SourceBinding = { ...row, ...input, projectId: input.projectId ?? row.projectId, state: 'linked', stateReason: '', lastVerifiedAt: now, updatedAt: now };
        this.rows.set(row.id, next);
        return { binding: clone(next), created: false };
      }
    }
    const binding: SourceBinding = {
      id: randomUUID(), ownerUserId: userId, originKind: 'github', ...input, state: 'linked', stateReason: '', indexStatus: 'not_indexed',
      linkedAt: now, lastVerifiedAt: now, updatedAt: now,
    };
    this.rows.set(binding.id, binding);
    return { binding: clone(binding), created: true };
  }

  async get(userId: string, bindingId: string) {
    const row = this.rows.get(bindingId);
    return row && row.ownerUserId === userId ? clone(row) : null;
  }

  async list(userId: string) {
    return [...this.rows.values()].filter((r) => r.ownerUserId === userId && r.state !== 'unlinked').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(clone);
  }

  async update(userId: string, bindingId: string, patch: BindingPatch) {
    const row = this.rows.get(bindingId);
    if (!row || row.ownerUserId !== userId) return null;
    const { verifiedAt, ...rest } = patch;
    const now = this.stamp();
    const next: SourceBinding = { ...row, ...rest, lastVerifiedAt: verifiedAt ?? row.lastVerifiedAt, updatedAt: now };
    this.rows.set(bindingId, next);
    return clone(next);
  }

  async markAllAccessLost(userId: string, reason: string) {
    let n = 0;
    for (const row of this.rows.values()) {
      if (row.ownerUserId === userId && row.state === 'linked') {
        this.rows.set(row.id, { ...row, state: 'access_lost', stateReason: reason.slice(0, 500), updatedAt: this.stamp() });
        n += 1;
      }
    }
    return n;
  }
}

interface Row {
  id: string; owner_user_id: string; project_id: string | null; origin_kind: 'github'; provider_repository_id: string; account_binding_id: string;
  account_login: string; installation_id: string | null; owner_account_id: string; repository_full_name: string; repository_private: boolean;
  repository_archived: boolean; base_branch: string; base_commit_sha: string; permissions: RepositoryPermissions; state: BindingState;
  state_reason: string; index_status: IndexStatus; linked_at: string; last_verified_at: string; updated_at: string;
}

const COLUMNS = 'id,owner_user_id,project_id,origin_kind,provider_repository_id,account_binding_id,account_login,installation_id,owner_account_id,repository_full_name,repository_private,repository_archived,base_branch,base_commit_sha,permissions,state,state_reason,index_status,linked_at,last_verified_at,updated_at';

function toBinding(r: Row): SourceBinding {
  return {
    id: r.id, ownerUserId: r.owner_user_id, projectId: r.project_id, originKind: r.origin_kind, providerRepositoryId: r.provider_repository_id,
    accountBindingId: r.account_binding_id, accountLogin: r.account_login, installationId: r.installation_id, ownerAccountId: r.owner_account_id,
    repositoryFullName: r.repository_full_name, repositoryPrivate: r.repository_private, repositoryArchived: r.repository_archived,
    baseBranch: r.base_branch, baseCommitSha: r.base_commit_sha, permissions: { pull: r.permissions?.pull === true, push: r.permissions?.push === true, admin: r.permissions?.admin === true },
    state: r.state, stateReason: r.state_reason, indexStatus: r.index_status, linkedAt: r.linked_at, lastVerifiedAt: r.last_verified_at, updatedAt: r.updated_at,
  };
}

const failed = (what: string): never => { throw new ExistingSourceError('STORAGE_FAILED', `Could not ${what}. Retry shortly.`); };

export class SupabaseSourceBindingStore implements SourceBindingStore {
  constructor(private readonly tenant: TenantContext) { requireTenantContext(tenant); }

  private db() { return getTenantSupabaseAdmin(this.tenant); }

  private owner(userId: string): string {
    // The verified issued context is the only authority; a mismatching argument is a programming error and reads as absent.
    if (userId !== requireTenantContext(this.tenant).userId) throw new ExistingSourceError('BINDING_NOT_FOUND', 'Linked repository not found.');
    return userId;
  }

  async upsert(userId: string, input: UpsertBindingInput) {
    const owner = this.owner(userId);
    const now = new Date().toISOString();
    const existing = await this.db().from('existing_source_projects').select(COLUMNS).eq('owner_user_id', owner).eq('origin_kind', 'github').eq('provider_repository_id', input.providerRepositoryId).maybeSingle();
    if (existing.error) failed('read the linked repository');
    const fields = {
      account_binding_id: input.accountBindingId, account_login: input.accountLogin, installation_id: input.installationId, owner_account_id: input.ownerAccountId,
      repository_full_name: input.repositoryFullName, repository_private: input.repositoryPrivate, repository_archived: input.repositoryArchived,
      base_branch: input.baseBranch, base_commit_sha: input.baseCommitSha, permissions: input.permissions, state: 'linked', state_reason: '',
      last_verified_at: now, updated_at: now, ...(input.projectId ? { project_id: input.projectId } : {}),
    };
    if (existing.data) {
      const updated = await this.db().from('existing_source_projects').update(fields).eq('owner_user_id', owner).eq('id', (existing.data as Row).id).select(COLUMNS).single();
      if (updated.error) failed('update the linked repository');
      return { binding: toBinding(updated.data as Row), created: false };
    }
    const inserted = await this.db().from('existing_source_projects').insert({ owner_user_id: owner, origin_kind: 'github', provider_repository_id: input.providerRepositoryId, ...fields }).select(COLUMNS).single();
    if (inserted.error) {
      // A concurrent identical link can win the unique (owner, kind, repository) race: resolve to it.
      const raced = await this.db().from('existing_source_projects').select(COLUMNS).eq('owner_user_id', owner).eq('origin_kind', 'github').eq('provider_repository_id', input.providerRepositoryId).maybeSingle();
      if (!raced.error && raced.data) return { binding: toBinding(raced.data as Row), created: false };
      failed('link the repository');
    }
    return { binding: toBinding(inserted.data as Row), created: true };
  }

  async get(userId: string, bindingId: string) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('existing_source_projects').select(COLUMNS).eq('owner_user_id', owner).eq('id', bindingId).maybeSingle();
    if (error) failed('read the linked repository');
    return data ? toBinding(data as Row) : null;
  }

  async list(userId: string) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('existing_source_projects').select(COLUMNS).eq('owner_user_id', owner).neq('state', 'unlinked').order('updated_at', { ascending: false }).limit(200);
    if (error) failed('list linked repositories');
    return ((data ?? []) as Row[]).map(toBinding);
  }

  async update(userId: string, bindingId: string, patch: BindingPatch) {
    const owner = this.owner(userId);
    const map: Record<string, unknown> = {};
    if (patch.projectId !== undefined) map.project_id = patch.projectId;
    if (patch.accountBindingId !== undefined) map.account_binding_id = patch.accountBindingId;
    if (patch.accountLogin !== undefined) map.account_login = patch.accountLogin;
    if (patch.ownerAccountId !== undefined) map.owner_account_id = patch.ownerAccountId;
    if (patch.repositoryFullName !== undefined) map.repository_full_name = patch.repositoryFullName;
    if (patch.repositoryPrivate !== undefined) map.repository_private = patch.repositoryPrivate;
    if (patch.repositoryArchived !== undefined) map.repository_archived = patch.repositoryArchived;
    if (patch.baseBranch !== undefined) map.base_branch = patch.baseBranch;
    if (patch.baseCommitSha !== undefined) map.base_commit_sha = patch.baseCommitSha;
    if (patch.permissions !== undefined) map.permissions = patch.permissions;
    if (patch.state !== undefined) map.state = patch.state;
    if (patch.stateReason !== undefined) map.state_reason = patch.stateReason.slice(0, 500);
    if (patch.indexStatus !== undefined) map.index_status = patch.indexStatus;
    if (patch.verifiedAt !== undefined) map.last_verified_at = patch.verifiedAt;
    map.updated_at = new Date().toISOString();
    const { data, error } = await this.db().from('existing_source_projects').update(map).eq('owner_user_id', owner).eq('id', bindingId).select(COLUMNS).maybeSingle();
    if (error) failed('update the linked repository');
    return data ? toBinding(data as Row) : null;
  }

  async markAllAccessLost(userId: string, reason: string) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('existing_source_projects')
      .update({ state: 'access_lost', state_reason: reason.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('owner_user_id', owner).eq('state', 'linked').select('id');
    if (error) failed('record the lost connection');
    return (data ?? []).length;
  }
}
