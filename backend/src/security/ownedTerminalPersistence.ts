import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { requireTenantContext, type TenantContext } from './tenantContext.js';
import { TenantAccessError } from './tenantErrors.js';

/** Existing terminal autosave with collision-safe, owner-bound writes and metadata-only return. */
export async function persistOwnedTerminal(db: SupabaseClient, context: TenantContext, row: {id:string;user_id:string;[key:string]:unknown}, columns: string): Promise<{data:Record<string,unknown>|null;error:PostgrestError|null}> {
  const scope=requireTenantContext(context);
  if(row.user_id!==scope.userId)throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
  const insertion=await db.from('terminal_sessions').upsert(row,{onConflict:'id',ignoreDuplicates:true});
  if(insertion.error)return {data:null,error:insertion.error};
  const {data,error}=await db.from('terminal_sessions').update(row).eq('id',row.id).eq('user_id',scope.userId).select(columns).maybeSingle();
  if(!error&&!data)throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
  return {data,error};
}
