import { getSupabaseAdmin } from '../config/supabase.js';
import { requireTenantContext, type TenantContext } from './tenantContext.js';

/** Does not magically apply RLS: every query must also use the explicit owner predicate. */
export function getTenantSupabaseAdmin(context: TenantContext) {
  requireTenantContext(context);
  return getSupabaseAdmin();
}

/** Narrow registered global operation, not an unbounded administrative client grant. */
export const globalServiceExceptions = Object.freeze({
  readiness_profile_probe: Object.freeze({ source: 'backend/src/index.ts', table: 'profiles', action: 'select', columns: 'id', limit: 1, reason: 'Infrastructure readiness; only error presence is returned, never rows or identities.' }),
});

export async function probeDatabaseReadiness() {
  const { error } = await getSupabaseAdmin().from('profiles').select('id').limit(1);
  if (error) throw new Error('Database readiness unavailable');
}
