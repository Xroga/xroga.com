/**
 * Tenant-isolated storage of derived code maps. The map is derived private-code metadata (symbols, signatures, paths), never
 * authoritative and never shared: every method names the verified owner AND the binding, a map for another owner reads as absent,
 * and everything for a binding is deleted when the binding is unlinked or loses its connection.
 */
import { getTenantSupabaseAdmin } from '../../security/serviceRoleGuard.js';
import { requireTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { ExistingSourceError } from '../types.js';
import type { CodeIndex } from './types.js';

/** Largest serialized map persisted for one commit. A bigger one is kept in memory for the request and reported as not persisted. */
export const MAX_PERSISTED_INDEX_BYTES = 8 * 1024 * 1024;
/** Maps kept per binding: the current commit and the previous one (the source of reuse for the next refresh). */
export const MAPS_KEPT_PER_BINDING = 2;

export interface CodeIndexStore {
  load(userId: string, bindingId: string, commitSha: string): Promise<CodeIndex | null>;
  /** The most recently built map for the binding at any commit: the reuse source for an incremental refresh. Never served as current. */
  latest(userId: string, bindingId: string): Promise<CodeIndex | null>;
  /** Returns false when the map is too large to persist. */
  save(userId: string, bindingId: string, index: CodeIndex): Promise<boolean>;
  deleteForBinding(userId: string, bindingId: string): Promise<void>;
}

export class InMemoryCodeIndexStore implements CodeIndexStore {
  private readonly rows = new Map<string, CodeIndex[]>();
  private key(userId: string, bindingId: string) { return `${userId}::${bindingId}`; }

  async load(userId: string, bindingId: string, commitSha: string) { return structuredClone(this.rows.get(this.key(userId, bindingId))?.find((i) => i.commitSha === commitSha) ?? null); }
  async latest(userId: string, bindingId: string) {
    const list = this.rows.get(this.key(userId, bindingId)) ?? [];
    return structuredClone(list.length ? list[list.length - 1]! : null);
  }
  async save(userId: string, bindingId: string, index: CodeIndex) {
    const k = this.key(userId, bindingId);
    const list = (this.rows.get(k) ?? []).filter((i) => i.commitSha !== index.commitSha);
    list.push(structuredClone(index));
    this.rows.set(k, list.slice(-MAPS_KEPT_PER_BINDING));
    return true;
  }
  async deleteForBinding(userId: string, bindingId: string) { this.rows.delete(this.key(userId, bindingId)); }
  /** Test seam: how many maps a binding holds. */
  count(userId: string, bindingId: string): number { return this.rows.get(this.key(userId, bindingId))?.length ?? 0; }
}

interface Row { commit_sha: string; payload: CodeIndex; built_at: string }

const failed = (what: string): never => { throw new ExistingSourceError('STORAGE_FAILED', `Could not ${what}. Retry shortly.`); };

export class SupabaseCodeIndexStore implements CodeIndexStore {
  constructor(private readonly tenant: TenantContext) { requireTenantContext(tenant); }
  private db() { return getTenantSupabaseAdmin(this.tenant); }
  private owner(userId: string): string {
    if (userId !== requireTenantContext(this.tenant).userId) throw new ExistingSourceError('BINDING_NOT_FOUND', 'Linked repository not found.');
    return userId;
  }

  async load(userId: string, bindingId: string, commitSha: string) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('existing_source_indexes').select('commit_sha,payload,built_at').eq('owner_user_id', owner).eq('binding_id', bindingId).eq('commit_sha', commitSha).maybeSingle();
    if (error) failed('read the code map');
    return data ? ((data as Row).payload) : null;
  }

  async latest(userId: string, bindingId: string) {
    const owner = this.owner(userId);
    const { data, error } = await this.db().from('existing_source_indexes').select('commit_sha,payload,built_at').eq('owner_user_id', owner).eq('binding_id', bindingId).order('built_at', { ascending: false }).limit(1);
    if (error) failed('read the code map');
    return data && data.length ? ((data[0] as Row).payload) : null;
  }

  async save(userId: string, bindingId: string, index: CodeIndex) {
    const owner = this.owner(userId);
    const text = JSON.stringify(index);
    if (Buffer.byteLength(text, 'utf8') > MAX_PERSISTED_INDEX_BYTES) return false;
    const { error } = await this.db().from('existing_source_indexes').upsert({
      owner_user_id: owner, binding_id: bindingId, commit_sha: index.commitSha, schema_version: index.schemaVersion, parser_version: index.parserVersion,
      status: index.status, file_count: index.files.length, content_fingerprint: index.contentFingerprint, size_bytes: Buffer.byteLength(text, 'utf8'), payload: index, built_at: index.builtAt,
    }, { onConflict: 'binding_id,commit_sha' });
    if (error) failed('save the code map');
    // keep only the newest maps for this binding
    const all = await this.db().from('existing_source_indexes').select('commit_sha,built_at').eq('owner_user_id', owner).eq('binding_id', bindingId).order('built_at', { ascending: false });
    if (!all.error) {
      const stale = ((all.data ?? []) as Array<{ commit_sha: string }>).slice(MAPS_KEPT_PER_BINDING).map((r) => r.commit_sha);
      if (stale.length) await this.db().from('existing_source_indexes').delete().eq('owner_user_id', owner).eq('binding_id', bindingId).in('commit_sha', stale);
    }
    return true;
  }

  async deleteForBinding(userId: string, bindingId: string) {
    const owner = this.owner(userId);
    const { error } = await this.db().from('existing_source_indexes').delete().eq('owner_user_id', owner).eq('binding_id', bindingId);
    if (error) failed('remove the code map');
  }
}
