import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js';
import { requireTenantContext, type TenantContext } from './tenantContext.js';
import { TenantAccessError } from './tenantErrors.js';
const allowedMetadata=new Set(['id','github_repo_name','github_branch','terminal_number','title','preview','kind','status','message_count','created_at','updated_at']);

/** Existing terminal autosave with collision-safe, owner-bound writes and metadata-only return. */
export async function persistOwnedTerminal(db: SupabaseClient, context: TenantContext, row: {id:string;user_id:string;[key:string]:unknown}, columns: string): Promise<{data:Record<string,unknown>|null;error:PostgrestError|null}> {
  const scope=requireTenantContext(context);
  if(!columns.trim()||columns.split(',').some(column=>!allowedMetadata.has(column.trim())))throw new TenantAccessError(503,'RESOURCE_ACCESS_UNAVAILABLE');
  if(row.user_id!==scope.userId)throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
  const insertion=await db.from('terminal_sessions').upsert(row,{onConflict:'id',ignoreDuplicates:true});
  if(insertion.error)return {data:null,error:insertion.error};
  const {data,error}=await db.from('terminal_sessions').update(row).eq('id',row.id).eq('user_id',scope.userId).select(columns).maybeSingle();
  if(!error&&!data)throw new TenantAccessError(404,'RESOURCE_NOT_FOUND');
  if(!error&&(typeof data!=='object'||Array.isArray(data)))throw new TenantAccessError(503,'RESOURCE_ACCESS_UNAVAILABLE');
  // Dynamic metadata projection is intentionally checked, not asserted to an SDK query type.
  return {data:data&&typeof data==='object'?Object.fromEntries(Object.entries(data)):null,error};
}
