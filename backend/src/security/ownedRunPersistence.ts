import type { SupabaseClient } from '@supabase/supabase-js';
import { requireTenantContext, type TenantContext } from './tenantContext.js';
import { TenantAccessError } from './tenantErrors.js';

/** Extend the existing run store's writer: insert-ignore, then an owner-bound update. */
export async function persistOwnedRun(client: SupabaseClient, context: TenantContext, row: {id:string;user_id:string;[column:string]:unknown}): Promise<void> {
  return persistOwnerBoundRecord(client,context,'swarm_runs','id',row);
}

/** Same guard for the existing project-runtime store; never caller-selected table/column. */
export async function persistOwnedRuntimeSession(client: SupabaseClient, context: TenantContext, row: {session_id:string;user_id:string;[column:string]:unknown}): Promise<void> {
  return persistOwnerBoundRecord(client,context,'project_runtime_sessions','session_id',row);
}

/** Existing best-effort trace store shares the same global-ID collision boundary. */
export async function persistOwnedRunTrace(client: SupabaseClient, context: TenantContext, row: {run_id:string;user_id:string;[column:string]:unknown}): Promise<void> {
  return persistOwnerBoundRecord(client,context,'swarm_run_traces','run_id',row);
}

async function persistOwnerBoundRecord(client: SupabaseClient, context: TenantContext, table:'swarm_runs'|'project_runtime_sessions'|'swarm_run_traces', key:'id'|'session_id'|'run_id', row:{user_id:string;[column:string]:unknown}): Promise<void> {
  const scope = requireTenantContext(context);
  if (row.user_id !== scope.userId) throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
  const inserted = await client.from(table).upsert(row,{onConflict:key,ignoreDuplicates:true});
  if (inserted.error) throw new TenantAccessError(503,'RESOURCE_ACCESS_UNAVAILABLE');
  const {data,error} = await client.from(table).update(row).eq(key,row[key]).eq('user_id',scope.userId).select(key);
  if (error) throw new TenantAccessError(503,'RESOURCE_ACCESS_UNAVAILABLE');
  if (data?.length !== 1) throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
}
