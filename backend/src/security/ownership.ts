import type { SupabaseClient } from '@supabase/supabase-js';
import { getTenantSupabaseAdmin } from './serviceRoleGuard.js';
import { requireTenantContext, type TenantContext } from './tenantContext.js';
import { TenantAccessError, resourceNotFound } from './tenantErrors.js';

/** Only names/keys inspected in the actual schema; no client-supplied table/column. */
const resources = {
  project: { table: 'projects', key: 'id' },
  chat: { table: 'chats', key: 'id' },
  provider_connection: { table: 'user_integrations', key: 'id' },
  run: { table: 'swarm_runs', key: 'id' },
  runtime_session: { table: 'project_runtime_sessions', key: 'session_id' },
  cost_record: { table: 'ai_usage_ledger', key: 'id' },
} as const;
export type OwnedResourceKind = keyof typeof resources;

export async function requireOwnedResource(context: TenantContext, kind: OwnedResourceKind, id: string, client?: SupabaseClient): Promise<void> {
  const scope = requireTenantContext(context);
  const policy = resources[kind];
  if (!policy || typeof id !== 'string' || !id.trim() || id.length > 200) resourceNotFound();
  const { data, error } = await (client ?? getTenantSupabaseAdmin(scope)).from(policy.table).select(policy.key).eq(policy.key, id).eq('user_id', scope.userId).maybeSingle();
  if (error) throw new TenantAccessError(503, 'RESOURCE_ACCESS_UNAVAILABLE');
  if (!data) resourceNotFound();
}

export async function requireOwnedFile(context: TenantContext, fileId: string, client?: SupabaseClient): Promise<void> {
  const scope = requireTenantContext(context), db = client ?? getTenantSupabaseAdmin(scope);
  if (!fileId.trim() || fileId.length > 200) resourceNotFound();
  // PostgREST inner join applies both predicates in one request; don't fetch the foreign file first.
  const { data, error } = await db.from('project_files').select('id, projects!inner(user_id)').eq('id', fileId).eq('projects.user_id', scope.userId).maybeSingle();
  if (error) throw new TenantAccessError(503, 'RESOURCE_ACCESS_UNAVAILABLE');
  if (!data) resourceNotFound();
}

export const requireOwnedProject = (context: TenantContext, id: string, client?: SupabaseClient) => requireOwnedResource(context, 'project', id, client);
