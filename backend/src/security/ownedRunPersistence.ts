import type { SupabaseClient } from '@supabase/supabase-js';
import { requireTenantContext, type TenantContext } from './tenantContext.js';
import { TenantAccessError } from './tenantErrors.js';

/** Extend the existing run store's writer: insert-ignore, then an owner-bound update. */
export async function persistOwnedRun(client: SupabaseClient, context: TenantContext, row: {id:string;user_id:string;[column:string]:unknown}): Promise<void> {
  const scope = requireTenantContext(context);
  if (row.user_id !== scope.userId) throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
  const inserted = await client.from('swarm_runs').upsert(row,{onConflict:'id',ignoreDuplicates:true});
  if (inserted.error) throw new TenantAccessError(503,'RESOURCE_ACCESS_UNAVAILABLE');
  const {data,error} = await client.from('swarm_runs').update(row).eq('id',row.id).eq('user_id',scope.userId).select('id');
  if (error) throw new TenantAccessError(503,'RESOURCE_ACCESS_UNAVAILABLE');
  if (data?.length !== 1) throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
}
