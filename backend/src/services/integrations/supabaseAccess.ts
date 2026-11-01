import {preparedActionDigest} from '../../security/authority/digest.js';
import {AuthorityError,authorityContextForPermit} from '../../security/authority/enforce.js';
import type {AuthorityPermit,AuthorityDispatchBinding} from '../../security/authority/types.js';
import {requireTenantContext,type TenantContext} from '../../security/tenantContext.js';
import {getTenantSupabaseAdmin} from '../../security/serviceRoleGuard.js';

const providers=['supabase_oauth','apikey_supabase_url','apikey_supabase_anon','apikey_supabase','apikey_supabase_db_password','apikey_supabase_pat'] as const;
const allowed=new Set<string>(providers);
const denied=()=>new AuthorityError('SUPABASE_SOURCE_ADMISSION_DENIED');
const digest=(value:unknown)=>preparedActionDigest(JSON.parse(JSON.stringify(value)));
interface State {context:TenantContext;fingerprint:string;check:()=>Promise<void>;signal?:AbortSignal;closed:boolean;write?:(operation:string,payload:Record<string,unknown>)=>Promise<void>}
const issued=new WeakMap<object,State>();
export interface SupabaseAccess {readonly context:TenantContext;readonly fingerprint:string;check:()=>Promise<void>;close:()=>void}

/** Pin every canonical connection component, including absent rows and tombstones.
 * A fresh credential can be used only by a new operation after revocation. */
async function fingerprint(context:TenantContext):Promise<string>{
 const actor=requireTenantContext(context);
 const {data,error}=await getTenantSupabaseAdmin(actor).from('user_integrations')
  .select('user_id,provider,access_token,refresh_token,credential_revision,metadata').eq('user_id',actor.userId).in('provider',[...providers]);
 if(error||!Array.isArray(data)||data.length>providers.length)throw denied();
 if(data.some(row=>!row||row.user_id!==actor.userId||!allowed.has(row.provider)
  ||row.access_token!==null&&typeof row.access_token!=='string'
  ||row.refresh_token!==undefined&&row.refresh_token!==null&&typeof row.refresh_token!=='string')
  ||new Set(data.map(row=>row.provider)).size!==data.length)throw denied();
 return digest(providers.map(provider=>{const row=data.find(row=>row.provider===provider);return row?[row.user_id,row.provider,row.access_token,row.refresh_token??null,row.credential_revision??null,row.metadata??{}]:[actor.userId,provider,null];}));
}
export async function captureSupabaseAccess(supplied?:TenantContext,signal?:AbortSignal,claim?:()=>Promise<void>):Promise<SupabaseAccess>{
 const context=requireTenantContext(supplied);signal?.throwIfAborted();const original=await fingerprint(context);
 let state:State;
 const check=async()=>{if(state?.closed)throw denied();requireTenantContext(context);signal?.throwIfAborted();
  if(await fingerprint(context)!==original)throw denied();if(claim)await claim();signal?.throwIfAborted();if(state?.closed)throw denied();};
 const access=Object.freeze({context,fingerprint:original,check,close:()=>{state.closed=true;issued.delete(access);}});
 state={context,fingerprint:original,check,signal,closed:false};issued.set(access,state);await check();return access;
}
export function requireSupabaseAccess(value:SupabaseAccess|undefined,context:TenantContext):SupabaseAccess{
 const state=value&&issued.get(value);if(!value||!state||state.closed||state.context!==requireTenantContext(context))throw denied();return value;
}

/** Only the canonical native permit can install an exact write guard. */
export function installSupabaseWriteGuard(access:SupabaseAccess,permit:AuthorityPermit|undefined,binding:AuthorityDispatchBinding,guard:(operation:string,payload:Record<string,unknown>)=>Promise<void>){
 const state=issued.get(access);
 if(!state||state.closed||state.write||binding.provider!=='xroga-native-supabase'||binding.operation!=='XROGA_SUPABASE_PROVISION'||authorityContextForPermit(permit,binding)!==state.context)throw denied();
 state.write=guard;
}
export async function beforeSupabaseWrite(access:SupabaseAccess,operation:string,payload:Record<string,unknown>){
 const state=issued.get(access);if(!state||state.closed||!state.write)throw new AuthorityError('SUPABASE_PROVISION_ADMISSION_DENIED');
 await state.check();await state.write(operation,payload);await state.check();
}
