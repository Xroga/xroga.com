import { getSupabaseAdmin } from '../config/supabase.js';
import { requireTenantContext, type TenantContext } from './tenantContext.js';

/** Does not magically apply RLS: every query must also use the explicit owner predicate. */
export function getTenantSupabaseAdmin(context: TenantContext) {
  requireTenantContext(context);
  return getSupabaseAdmin();
}

/** Narrow registered global operation, not an unbounded administrative client grant. */
export const globalServiceExceptions = Object.freeze({
  signed_runtime_preview_resolution: Object.freeze({ source: 'backend/src/synthesis/livePreview/store.ts', table: 'project_preview_grants', action: 'select', reason: 'Internal exact UUID capability lookup only. No returned grant payload is sent to the visitor; gateway independently verifies signature, revocation, finite expiry, owner/project/session binding and declared port before resolving its private machine. Not a private-file share or client-selectable admin grant.' }),
  readiness_profile_probe: Object.freeze({ source: 'backend/src/index.ts', table: 'profiles', action: 'select', columns: 'id', limit: 1, reason: 'Infrastructure readiness; only error presence is returned, never rows or identities.' }),
  stale_run_reconcile: Object.freeze({ source: 'backend/src/ai/runReconciler.ts', table: 'swarm_runs', action: 'update', reason: 'Internal startup only; running rows with stale heartbeat/legacy creation, minimum five-minute grace. No provider replay or external effect.' }),
  leased_worker_shutdown: Object.freeze({ source: 'backend/src/ai/runReconciler.ts', table: 'swarm_runs', action: 'update', reason: 'Internal shutdown only; explicit local active IDs AND persisted worker lease identity AND running status. No general user API.' }),
  platform_provider_health: Object.freeze({ source: 'backend/src/ai/providerHealthStore.ts', table: 'model_provider_health', action: 'select/upsert', reason: 'Inspected server-only platform model circuit aggregates; no user/tenant/customer fields or raw failure text. Not connected-account credentials.' }),
  message_share_resolution: Object.freeze({ source: 'backend/src/routes/messageShares.ts', table: 'message_shares', action: 'select', reason: 'Validated random token and unrevoked row only; public visibility explicitly chosen by owner, private payload withheld unless independently verified viewer equals owner. Fixed columns, no cache after revocation.' }),
  authorized_platform_errors: Object.freeze({ source: 'backend/src/routes/admin.ts', table: 'system_errors', action: 'select', reason: 'Existing auth-issued context plus current database admin/owner middleware required at index mount. Platform-wide read, bounded 200 rows. Broader than founder-exclusive; no founder preview integration or new role grant. Payload redaction remains a separate release-review obligation.' }),
  authorized_deployment_history: Object.freeze({ source: 'backend/src/routes/admin.ts', table: 'deployment_status', action: 'select', reason: 'Existing auth-issued context plus database admin/owner middleware at index mount; platform-wide read bounded 100 rows. Not founder-exclusive or permission for production mutations.' }),
  authorized_release_readiness: Object.freeze({ source: 'backend/src/routes/operations.ts', table: 'production_evidence', action: 'select', reason: 'Route-specific adminMiddleware independently checks server-issued identity and current database admin/owner role; bounded 50 read-only operational records, no raw credentials. Founder preview does not consume this feed.' }),
});

/** Internal reviewed exceptions, not a client-selectable admin endpoint or RLS proxy. */
export function getGlobalSupabaseAdmin(operation: keyof typeof globalServiceExceptions) {
  if (!Object.hasOwn(globalServiceExceptions, operation)) throw new Error('Unregistered service operation');
  return getSupabaseAdmin();
}

export async function probeDatabaseReadiness() {
  const { error } = await getGlobalSupabaseAdmin('readiness_profile_probe').from('profiles').select('id').limit(1);
  if (error) throw new Error('Database readiness unavailable');
}
