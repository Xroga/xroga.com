/**
 * One-click provision of the USER's Supabase project:
 * - schema (app + Xroga AI memory)
 * - storage buckets
 * - optional Management API (PAT) to fetch keys + run SQL
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import {requireTenantContext,requireResourceOwner,type TenantContext} from '../../security/tenantContext.js';
import {AuthorityError} from '../../security/authority/enforce.js';
import {captureSupabaseAccess,requireSupabaseAccess,beforeSupabaseWrite,installSupabaseWriteGuard,type SupabaseAccess} from './supabaseAccess.js';
import {
  getUserProviderKey,
  getUserSupabaseStatus,
  prepareUserProviderKeyWrite,
  saveUserProviderKey,
  type ProviderKeyWriteAdmission,
  prepareSupabaseBundleWrite, saveSupabaseBundle, readUserSupabaseBundle, type SupabaseBundleAdmission,
} from './userProviderKeys.js';

const MGMT = 'https://api.supabase.com/v1';
import {isDeepStrictEqual} from 'node:util';
import type {AuthorityPermit} from '../../security/authority/types.js';
import type {BusinessActionPlan} from './businessAction.js';
import {nativeReleaseActor} from '../publish/nativeReleaseAdmission.js';
import {prepareSupabaseNativeAction,readSupabaseNativeAction} from './supabaseApproval.js';
import { projectRefFromUrl } from './supabaseProjectUrl.js';
export { projectRefFromUrl } from './supabaseProjectUrl.js';

/** SQL applied to the user's project — app data + Xroga memory/storage. */
export function buildUserSupabaseProvisionSql(opts?: {
  projectName?: string;
  includeAppSchema?: boolean;
  includeStorage?: boolean;
}): string {
  const slug =
    (opts?.projectName || 'xroga')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'xroga';
  const includeApp = opts?.includeAppSchema !== false;
  const includeStorage = opts?.includeStorage !== false;

  const appSql = includeApp
    ? `
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  plan text not null default 'free',
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles_select_own') then
    create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles_insert_own') then
    create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='profiles_update_own') then
    create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.app_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_items_user_id_idx on public.app_items (user_id);
alter table public.app_items enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='app_items' and policyname='app_items_select_own') then
    create policy "app_items_select_own" on public.app_items for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='app_items' and policyname='app_items_insert_own') then
    create policy "app_items_insert_own" on public.app_items for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='app_items' and policyname='app_items_update_own') then
    create policy "app_items_update_own" on public.app_items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='app_items' and policyname='app_items_delete_own') then
    create policy "app_items_delete_own" on public.app_items for delete using (auth.uid() = user_id);
  end if;
end $$;
`
    : '';

  // Xroga AI memory on the USER's DB — keyed by Xroga platform user id (no FK to their auth.users)
  const memorySql = `
create table if not exists public.xroga_project_memory (
  id uuid primary key default gen_random_uuid(),
  xroga_user_id uuid not null,
  repo text not null default '_local',
  branch text not null default 'main',
  project_name text,
  files jsonb not null default '[]'::jsonb,
  paths jsonb not null default '[]'::jsonb,
  ai_summary text,
  ai_summary_model text,
  commit_sha text,
  hits integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (xroga_user_id, repo, branch)
);
create index if not exists xroga_project_memory_user_idx on public.xroga_project_memory (xroga_user_id);

create table if not exists public.xroga_session_memory (
  id uuid primary key default gen_random_uuid(),
  xroga_user_id uuid not null,
  repo text not null default '_workspace',
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (xroga_user_id, repo)
);
create index if not exists xroga_session_memory_user_idx on public.xroga_session_memory (xroga_user_id);

-- Platform identities do not identify users in this separately owned project.
-- Only the server credential may access AI memory; never grant its app users access.
alter table public.xroga_project_memory enable row level security;
alter table public.xroga_session_memory enable row level security;
revoke all on table public.xroga_project_memory from public, anon, authenticated;
revoke all on table public.xroga_session_memory from public, anon, authenticated;
drop policy if exists xroga_memory_server_only on public.xroga_project_memory;
create policy xroga_memory_server_only on public.xroga_project_memory as restrictive
  for all to anon, authenticated using (false) with check (false);
drop policy if exists xroga_memory_server_only on public.xroga_session_memory;
create policy xroga_memory_server_only on public.xroga_session_memory as restrictive
  for all to anon, authenticated using (false) with check (false);
grant all on table public.xroga_project_memory to service_role;
grant all on table public.xroga_session_memory to service_role;
`;

  const storageSql = includeStorage
    ? `
insert into storage.buckets (id, name, public)
values ('xroga-uploads', 'xroga-uploads', false),
       ('${slug}-uploads', '${slug}-uploads', false)
on conflict (id) do nothing;

-- User-owned objects under {user_id}/... in both buckets
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='xroga_uploads_select_own') then
    create policy "xroga_uploads_select_own" on storage.objects for select
      using (bucket_id in ('xroga-uploads', '${slug}-uploads') and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='xroga_uploads_insert_own') then
    create policy "xroga_uploads_insert_own" on storage.objects for insert
      with check (bucket_id in ('xroga-uploads', '${slug}-uploads') and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='xroga_uploads_update_own') then
    create policy "xroga_uploads_update_own" on storage.objects for update
      using (bucket_id in ('xroga-uploads', '${slug}-uploads') and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='xroga_uploads_delete_own') then
    create policy "xroga_uploads_delete_own" on storage.objects for delete
      using (bucket_id in ('xroga-uploads', '${slug}-uploads') and auth.uid()::text = (storage.foldername(name))[1]);
  end if;
end $$;
`
    : '';

  return `${appSql}${memorySql}${storageSql}
notify pgrst, 'reload schema';
`;
}

export interface MgmtProject {
  id: string;
  ref: string;
  name: string;
  organization_id?: string;
  region?: string;
}

export class SupabaseManagementDenied extends Error {
  readonly code = 'SUPABASE_MANAGEMENT_DENIED';
  readonly retryable = false;
  constructor() { super('Supabase management request was denied by security policy.'); }
}
const validProjectRef = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]{1,63}$/.test(value);
const managementDenied = () => new SupabaseManagementDenied();
const terminalSupabaseDenial = (error: unknown) => error instanceof SupabaseManagementDenied
  || error instanceof AuthorityError
  || error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
  || !!error && typeof error === 'object' && 'code' in error && ['SUPABASE_TRANSPORT_DENIED','TENANT_AUTH_REQUIRED','CREDENTIAL_WRITE_CONFLICT'].includes(String(error.code));

/** Fixed management operations only. A bounded authenticated transport does not
 * grant project ownership, schema authority or consent to create resources. */
async function mgmtFetch<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
  context?: TenantContext,
  source?: SupabaseAccess,
  storageOrigin?: string,
): Promise<T> {
  const actor = requireTenantContext(context);
  const access = requireSupabaseAccess(source, actor);
  await access.check();
  const method = init.method ?? 'GET', storageRef = storageOrigin ? projectRefFromUrl(storageOrigin) : null;
  if (storageOrigin && !storageRef) throw managementDenied();
  if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 16384 || /[\x00-\x20\x7f]/.test(accessToken)
    || !(storageRef && path === '/storage/v1/bucket' && (method === 'GET' || method === 'POST')
      || !storageRef && method === 'GET' && (path === '/projects' || /^\/projects\/[a-z0-9]{1,63}\/api-keys\?reveal=true$/.test(path))
      || !storageRef && method === 'POST' && /^\/projects\/[a-z0-9]{1,63}\/database\/query$/.test(path))) throw managementDenied();
  if (method === 'POST') {
    if (typeof init.body !== 'string' || Buffer.byteLength(init.body) > 512 * 1024) throw managementDenied();
    let body: unknown; try { body = JSON.parse(init.body); } catch { throw managementDenied(); }
    if (storageRef) {
      const bucket = body as {id?:unknown;name?:unknown;public?:unknown;file_size_limit?:unknown};
      if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket) || Object.keys(bucket).some(key=>!['id','name','public','file_size_limit'].includes(key))
        || typeof bucket.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(bucket.id) || bucket.name!==bucket.id || bucket.public!==false || bucket.file_size_limit!==52428800) throw managementDenied();
      await beforeSupabaseWrite(access,'bucket-create',{projectRef:storageRef,id:bucket.id,public:false,fileSizeLimit:52428800});
    } else {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).join() !== 'query'
        || typeof (body as {query?:unknown}).query !== 'string' || !(body as {query:string}).query.trim()) throw managementDenied();
      await beforeSupabaseWrite(access,'management-sql',{projectRef:path.split('/')[2],query:(body as {query:string}).query});
    }
  } else if (init.body != null) throw managementDenied();
  const signal = AbortSignal.any([AbortSignal.timeout(20000), ...(init.signal ? [init.signal] : [])]);
  signal.throwIfAborted();
  await access.check();
  let res: Response;
  try {
    res = await fetch(`${storageOrigin ?? MGMT}${path}`, {
      method, body: init.body, redirect: 'manual', signal,
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json', ...(storageRef ? {apikey:accessToken} : {}) },
    });
  } catch { signal.throwIfAborted(); if (method === 'POST') throw managementDenied();
    throw new Error('Supabase management service is unavailable. No automatic retry was made.'); }
  if (res.redirected || res.status >= 300 && res.status < 400 || res.status === 401 || res.status === 403 || res.status === 429) {
    await res.body?.cancel().catch(() => undefined); throw managementDenied();
  }
  if (storageRef && method==='POST' && res.status===409) { await res.body?.cancel().catch(()=>undefined); await access.check(); throw new SupabaseStorageConflict(); }
  if (!res.ok) { await res.body?.cancel().catch(() => undefined); await access.check(); throw new Error('Supabase could not complete this request. Check your connection permissions and retry.'); }
  const reader = res.body?.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try {
    if (reader) for (;;) { const next = await reader.read(); if (next.done) break;
      signal.throwIfAborted(); bytes += next.value.length; if (bytes > 2 * 1024 * 1024) throw managementDenied(); chunks.push(next.value);
    }
  } catch (error) { signal.throwIfAborted(); if (error instanceof SupabaseManagementDenied || method === 'POST') throw managementDenied();
    throw new Error('Supabase management response is unavailable. No automatic retry was made.');
  } finally { await reader?.cancel().catch(() => undefined); reader?.releaseLock(); }
  signal.throwIfAborted();
  await access.check();
  let body: unknown; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw managementDenied(); }
  if (storageRef && method==='POST') { if(!body || typeof body!=='object' || Array.isArray(body)) throw managementDenied(); }
  else if (!Array.isArray(body)) throw managementDenied();
  return body as T;
}

export async function listSupabaseProjects(accessToken: string, context?: TenantContext, source?: SupabaseAccess): Promise<MgmtProject[]> {
  const actor = requireTenantContext(context);
  const access = source ? requireSupabaseAccess(source, actor) : await captureSupabaseAccess(actor);
  try {
  const data = await mgmtFetch<Array<Record<string, unknown>>>('/projects', accessToken, undefined, actor, access);
  if (data.length > 1000 || data.some(p => !p || typeof p !== 'object' || Array.isArray(p)
    || p.id !== undefined && (typeof p.id !== 'string' || !p.id || p.id.length > 128)
    || !validProjectRef(p.ref ?? p.id) || typeof p.name !== 'string' || !p.name || p.name.length > 256
    || p.organization_id !== undefined && (typeof p.organization_id !== 'string' || p.organization_id.length > 128)
    || p.region !== undefined && (typeof p.region !== 'string' || !/^[a-z0-9-]{1,64}$/.test(p.region)))) throw managementDenied();
  const projects = data.map(p => ({ id: String(p.id ?? p.ref), ref: String(p.ref ?? p.id), name: String(p.name),
    organization_id: p.organization_id as string | undefined, region: p.region as string | undefined }));
  if (new Set(projects.map(p => p.ref)).size !== projects.length) throw managementDenied();
  return projects;
  } finally { if (!source) access.close(); }
}

export async function fetchProjectApiKeys(
  accessToken: string,
  projectRef: string,
  context?: TenantContext,
  source?: SupabaseAccess,
): Promise<{ url: string; anonKey: string; serviceRoleKey: string }> {
  const actor = requireTenantContext(context);
  if (!validProjectRef(projectRef)) throw managementDenied();
  const access = source ? requireSupabaseAccess(source, actor) : await captureSupabaseAccess(actor);
  try {
  if (!(await listSupabaseProjects(accessToken, actor, access)).some(project => project.ref === projectRef)) throw new AuthorityError('SUPABASE_SOURCE_ADMISSION_DENIED');
  // Current Management API requires reveal=true for secret values
  const keys = await mgmtFetch<
    Array<{
      name?: string;
      api_key?: string;
      type?: string;
      id?: string;
    }>
  >(`/projects/${encodeURIComponent(projectRef)}/api-keys?reveal=true`, accessToken, undefined, actor, access);

  if (keys.length > 100 || keys.some(key => !key || typeof key !== 'object' || Array.isArray(key)
    || key.api_key !== undefined && (typeof key.api_key !== 'string' || !key.api_key || key.api_key.length > 48000 || /[\x00-\x20\x7f]/.test(key.api_key))
    || key.name !== undefined && (typeof key.name !== 'string' || key.name.length > 128)
    || key.type !== undefined && (typeof key.type !== 'string' || key.type.length > 128))) throw managementDenied();
  const pick = (...preds: Array<(k: (typeof keys)[number]) => boolean>) => {
    for (const pred of preds) {
      const hit = keys.find(pred)?.api_key?.trim();
      if (hit) return hit;
    }
    return undefined;
  };

  const anon = pick(
    (k) => (k.type === undefined || k.type === 'legacy') && k.name === 'anon' || k.type === 'legacyAnonKey' || k.type === 'anon',
    (k) => k.type === 'publishable',
  );
  const service = pick(
    (k) => (k.type === undefined || k.type === 'legacy') && k.name === 'service_role' || k.type === 'legacyServiceRoleKey' || k.type === 'service_role',
    (k) => k.type === 'secret',
  );

  if (anon && /^sb_secret_/i.test(anon) || service && /^sb_publishable_/i.test(service) || anon && service && anon===service) throw managementDenied();
  if (!anon || !service) {
    throw new Error(
      'Could not read anon/service_role keys from Supabase Management API. Ensure the OAuth app has Secrets Read (and try re-authorize).',
    );
  }
  return {
    url: `https://${projectRef}.supabase.co`,
    anonKey: anon,
    serviceRoleKey: service,
  };
  } finally { if (!source) access.close(); }
}

export async function runSqlViaManagementApi(
  accessToken: string,
  projectRef: string,
  query: string,
  context?: TenantContext,
  source?: SupabaseAccess,
): Promise<void> {
  const actor = requireTenantContext(context);
  if (!validProjectRef(projectRef)) throw managementDenied();
  const access = source ? requireSupabaseAccess(source, actor) : await captureSupabaseAccess(actor);
  try {
  if (!(await listSupabaseProjects(accessToken, actor, access)).some(project => project.ref === projectRef)) throw new AuthorityError('SUPABASE_SOURCE_ADMISSION_DENIED');
  await mgmtFetch(`/projects/${encodeURIComponent(projectRef)}/database/query`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ query }),
  }, actor, access);
  } finally { if (!source) access.close(); }
}

export async function runSqlViaDatabasePassword(
 projectRef:string,dbPassword:string,query:string,regionHint?:string,context?:TenantContext,source?:SupabaseAccess,
):Promise<void>{
 const actor=requireTenantContext(context);
 if(!validProjectRef(projectRef)||typeof dbPassword!=='string'||!dbPassword||dbPassword.length>16384||dbPassword.includes('\0')
  ||regionHint!==undefined&&!/^[a-z]{2}-(?:[a-z]+-)+[1-9]$/.test(regionHint))throw managementDenied();
 const access=source?requireSupabaseAccess(source,actor):await captureSupabaseAccess(actor);
 const hosts=[...new Set([`db.${projectRef}.supabase.co`,regionHint?`aws-1-${regionHint}.pooler.supabase.com`:'aws-1-ap-southeast-1.pooler.supabase.com',
  'aws-0-us-east-1.pooler.supabase.com','aws-1-us-east-1.pooler.supabase.com','aws-0-eu-central-1.pooler.supabase.com'])];
 try{
  for(const host of hosts)for(const port of host.startsWith('db.')?[5432]:[5432,6543]){
   await beforeSupabaseWrite(access,'password-connect',{projectRef});
   const client=new pg.Client({host,port,user:host.includes('.pooler.')?`postgres.${projectRef}`:'postgres',password:dbPassword,database:'postgres',
    ssl:{rejectUnauthorized:true},connectionTimeoutMillis:3000,statement_timeout:20000,query_timeout:25000});
   let connected=false;
   try{
    try{await client.connect();connected=true;}catch(error){
     await access.check();const code=String((error as {code?:unknown})?.code??'');
     if(!['ENETUNREACH','EHOSTUNREACH','ENOTFOUND','ECONNREFUSED','ETIMEDOUT'].includes(code))throw provisionDenied();
     continue;
    }
    await beforeSupabaseWrite(access,'password-sql',{projectRef,query});await client.query(query);await access.check();
    await beforeSupabaseWrite(access,'password-sql',{projectRef,query:schemaVerificationSql});
    const verification=await client.query(schemaVerificationSql);await access.check();
    if(!schemaVerified(verification.rows))throw provisionDenied();return;
   }catch(error){if(terminalSupabaseDenial(error))throw error;throw provisionDenied();}
   finally{await client.end().catch(()=>undefined);if(connected)await access.check();}
  }
  throw new Error('Supabase database connection is unavailable. No SQL was retried.');
 }finally{if(!source)access.close();}
}

class SupabaseStorageConflict extends Error { constructor(){super('Supabase bucket already exists.');} }
export async function ensureStorageBuckets(
  url:string,serviceRoleKey:string,bucketIds:string[]=['xroga-uploads'],context?:TenantContext,source?:SupabaseAccess,
):Promise<string[]>{
 const actor=requireTenantContext(context),ref=projectRefFromUrl(url);
 if(!ref)throw new Error('Invalid Supabase project URL');
 if(bucketIds.length>2||bucketIds.some(id=>!/^[a-z0-9][a-z0-9-]{0,62}$/.test(id))||new Set(bucketIds).size!==bucketIds.length)throw new Error('Invalid storage bucket name');
 const access=source?requireSupabaseAccess(source,actor):await captureSupabaseAccess(actor);
 const readBuckets=async()=>{
  const rows=await mgmtFetch<Array<{id?:unknown;public?:unknown}>>('/storage/v1/bucket',serviceRoleKey,undefined,actor,access,url);
  if(rows.length>1000||rows.some(row=>!row||typeof row.id!=='string')||new Set(rows.map(row=>row.id)).size!==rows.length)throw managementDenied();
  return rows;
 };
 try{
  const confirmed:string[]=[];
  for(const id of bucketIds){
   let rows;try{rows=await readBuckets();}catch(error){if(terminalSupabaseDenial(error))throw error;throw new Error('Storage access could not be verified. Check your connection and retry.');}
   const existing=rows.find(row=>row.id===id);
   if(existing){if(existing.public!==false)throw new Error('Storage privacy could not be verified. Review the bucket settings before retrying.');confirmed.push(id);continue;}
   try{await mgmtFetch('/storage/v1/bucket',serviceRoleKey,{method:'POST',body:JSON.stringify({id,name:id,public:false,file_size_limit:52428800})},actor,access,url);}
   catch(error){if(!(error instanceof SupabaseStorageConflict))throw error;}
   if((await readBuckets()).find(row=>row.id===id)?.public!==false)throw new Error('Storage privacy could not be verified. Review the bucket settings before retrying.');
   confirmed.push(id);
  }
  await access.check();return confirmed;
 }finally{if(!source)access.close();}
}

export interface ProvisionResult {
  ok: boolean;
  needsConfirmation?: boolean;
  reviewUrl?: string;
  method: 'management_api' | 'database_password' | 'keys_only';
  projectRef?: string;
  projectUrl?: string;
  buckets: string[];
  schemaApplied: boolean;
  memoryTablesReady: boolean;
  message: string;
  error?: string;
}

/** Verification query reads schema metadata only, never customer records. */
const schemaVerificationSql = `select count(*)::int as table_count, bool_and(c.relrowsecurity) as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','app_items','xroga_project_memory','xroga_session_memory') and c.relkind='r'`;
const schemaVerified = (rows:unknown) => Array.isArray(rows) && rows.length===1 && Number(rows[0]?.table_count)===4 && rows[0]?.rls_enabled===true;
const provisionDenied = () => new AuthorityError('SUPABASE_PROVISION_ADMISSION_DENIED');
export interface SupabaseProvisionInput {
  userId:string; tenantContext?:TenantContext; projectUrl:string; serviceRoleKey:string;
  accessToken?:string; dbPassword?:string; projectName?:string; region?:string; signal?:AbortSignal;
  plan?:BusinessActionPlan; authorityPermit?:AuthorityPermit;
}

/** Prepare one exact action. SQL and bucket writes belong only to the existing
 * canonical confirmation executor, never connection, model text or a raw ID. */
export async function provisionUserSupabase(input:SupabaseProvisionInput):Promise<ProvisionResult>{
 const opts={...input},actor=nativeReleaseActor(opts.userId,opts.tenantContext,opts.plan,opts.authorityPermit),context=actor.context;
 requireResourceOwner(context,opts.userId);opts.signal?.throwIfAborted();
 const native=actor.plan?await readSupabaseNativeAction(actor,opts.authorityPermit):undefined;
 const access=await captureSupabaseAccess(context,opts.signal,native?.checkClaim);
 try{
  if(native && native.plan.arguments.connection!==access.fingerprint)throw provisionDenied();
  const ref=projectRefFromUrl(opts.projectUrl);if(!ref)throw managementDenied();
  opts.projectUrl=`https://${ref}.supabase.co`;
  const bundle=await readUserSupabaseBundle(context.userId);await access.check();
  if(!bundle||bundle.projectUrl!==opts.projectUrl||bundle.serviceRoleKey!==opts.serviceRoleKey||!opts.serviceRoleKey)throw provisionDenied();
  const selected=actor.plan?.arguments.connectionMethod;
  let source:string,token:string|undefined,password:string|undefined;
  if(selected==='storage_only'||!actor.plan&&!opts.accessToken&&!opts.dbPassword)source='storage_only';
  else if(selected==='database_password'||!actor.plan&&!opts.accessToken&&opts.dbPassword){
   if(!bundle.dbPassword||opts.dbPassword!==bundle.dbPassword)throw provisionDenied();source='database_password';password=bundle.dbPassword;
  }else{
   const{getSupabaseOAuthAccessToken}=await import('./supabaseAuth.js');
   const oauth=await getSupabaseOAuthAccessToken(context.userId),pat=await getUserProviderKey(context.userId,'supabase_pat');await access.check();
   source=selected==='supabase_oauth'?'supabase_oauth':selected==='apikey_supabase_pat'?'apikey_supabase_pat':opts.accessToken&&opts.accessToken===oauth?'supabase_oauth':'apikey_supabase_pat';
   token=source==='supabase_oauth'?oauth??undefined:pat??undefined;
   if(!token||opts.accessToken!==token)throw provisionDenied();
   if(!(await listSupabaseProjects(token,context,access)).some(project=>project.ref===ref))throw provisionDenied();
  }
  const name=opts.projectName??ref;if(typeof name!=='string'||!name||name.length>120||opts.region!==undefined&&!/^[a-z]{2}-(?:[a-z]+-)+[1-9]$/.test(opts.region))throw provisionDenied();
  const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,24)||'xroga';
  const buckets=[...new Set(['xroga-uploads',`${slug}-uploads`])];
  const sql=source==='storage_only'?null:buildUserSupabaseProvisionSql({projectName:name,includeAppSchema:true,includeStorage:true});
  const parameters={projectRef:ref,projectUrl:opts.projectUrl,projectName:name,region:opts.region??null,connectionMethod:source,sql,buckets,connection:access.fingerprint};
  for(const value of [bundle.serviceRoleKey,bundle.dbPassword,token])if(value&&value.length>=8&&JSON.stringify(parameters).includes(value))throw provisionDenied();
  if(!native){const prepared=await prepareSupabaseNativeAction(access,parameters);return{ok:false,method:'keys_only',projectRef:ref,projectUrl:opts.projectUrl,buckets:[],schemaApplied:false,memoryTablesReady:false,...prepared};}
  native.assertArguments(parameters);
  let applied=false,verified=false;const written=new Set<string>();
  installSupabaseWriteGuard(access,opts.authorityPermit,native.binding,async(operation,payload)=>{
   await access.check();
   if(operation==='management-sql'&&token&&source!=='database_password'){
    if(isDeepStrictEqual(payload,{projectRef:ref,query:sql})&&!applied){applied=true;return;}
    if(isDeepStrictEqual(payload,{projectRef:ref,query:schemaVerificationSql})&&applied&&!verified){verified=true;return;}
   }
   if(operation==='password-connect'&&source==='database_password'&&!applied&&isDeepStrictEqual(payload,{projectRef:ref}))return;
   if(operation==='password-sql'&&source==='database_password'){
    if(isDeepStrictEqual(payload,{projectRef:ref,query:sql})&&!applied){applied=true;return;}
    if(isDeepStrictEqual(payload,{projectRef:ref,query:schemaVerificationSql})&&applied&&!verified){verified=true;return;}
   }
   if(operation==='bucket-create'&&buckets.includes(String(payload.id))&&!written.has(String(payload.id))
     &&(source==='storage_only'||verified)&&isDeepStrictEqual(payload,{projectRef:ref,id:payload.id,public:false,fileSizeLimit:52428800})){written.add(String(payload.id));return;}
   throw provisionDenied();
  });
  await native.begin(access.check);
  let schemaApplied=false;
  if(token&&sql){
   await runSqlViaManagementApi(token,ref,sql,context,access);
   const rows=await mgmtFetch<unknown[]>(`/projects/${ref}/database/query`,token,{method:'POST',body:JSON.stringify({query:schemaVerificationSql})},context,access);
   if(!schemaVerified(rows))throw provisionDenied();schemaApplied=true;
  }else if(password&&sql){
   await runSqlViaDatabasePassword(ref,password,sql,opts.region,context,access);schemaApplied=true;
  }
  const confirmed=await ensureStorageBuckets(opts.projectUrl,bundle.serviceRoleKey,buckets,context,access);await access.check();
  return{ok:source==='storage_only'?confirmed.length===buckets.length:schemaApplied&&confirmed.length===buckets.length,
   method:token?'management_api':password?'database_password':'keys_only',projectRef:ref,projectUrl:opts.projectUrl,buckets:confirmed,schemaApplied,memoryTablesReady:schemaApplied,
   message:source==='storage_only'?'Private storage verified. Schema and memory tables were not changed.':'Approved SQL executed. Expected tables have RLS enabled, and private storage was independently verified.'};
 }finally{access.close();}
}

export async function executeSupabaseNativeAction(userId:string,plan:BusinessActionPlan,authorityPermit?:AuthorityPermit){
 const actor=nativeReleaseActor(userId,undefined,plan,authorityPermit);await readSupabaseNativeAction(actor,authorityPermit);
 const bundle=await readUserSupabaseBundle(actor.context.userId);if(!bundle?.serviceRoleKey)throw provisionDenied();
 const source=actor.plan!.arguments.connectionMethod;
 const token=source==='supabase_oauth'?(await import('./supabaseAuth.js')).getSupabaseOAuthAccessToken(userId):source==='apikey_supabase_pat'?getUserProviderKey(userId,'supabase_pat'):Promise.resolve(null);
 return provisionUserSupabase({userId,tenantContext:actor.context,projectUrl:String(actor.plan!.arguments.projectUrl),serviceRoleKey:bundle.serviceRoleKey,
  accessToken:await token??undefined,dbPassword:source==='database_password'?bundle.dbPassword??undefined:undefined,
  projectName:String(actor.plan!.arguments.projectName),region:actor.plan!.arguments.region===null?undefined:String(actor.plan!.arguments.region),plan:actor.plan,authorityPermit});
}

export type SupabaseWriteAdmissions = Readonly<{
  url: ProviderKeyWriteAdmission;
  anon: ProviderKeyWriteAdmission;
  service: ProviderKeyWriteAdmission;
  pat: ProviderKeyWriteAdmission;
}>;

/** Capture before OAuth exchange or other asynchronous credential acquisition. */
export async function prepareSupabaseWriteAdmissions(userId: string): Promise<SupabaseWriteAdmissions> {
  const [url, anon, service, pat] = await Promise.all(
    ['supabase_url', 'supabase_anon', 'supabase', 'supabase_pat'].map(provider => prepareUserProviderKeyWrite(userId, provider)),
  );
  return Object.freeze({ url: url!, anon: anon!, service: service!, pat: pat! });
}

export async function prepareSupabaseConnectionWrite(userId: string) {
  const [bundle, pat] = await Promise.all([prepareSupabaseBundleWrite(userId), prepareUserProviderKeyWrite(userId, 'supabase_pat')]);
  return Object.freeze({ bundle, pat });
}

/** One-click: PAT + project ref → save keys + provision everything. */
export async function oneClickConnectSupabase(opts: {
  userId: string;
  tenantContext?: TenantContext;
  accessToken: string;
  projectRef: string;
  vercelProject?: string;
  projectName?: string;
  writeAdmissions?: { bundle: SupabaseBundleAdmission; pat: ProviderKeyWriteAdmission };
}): Promise<{
  status: Awaited<ReturnType<typeof getUserSupabaseStatus>>;
  provision: ProvisionResult;
  keysSaved: boolean;
}> {
  const context = requireTenantContext(opts.tenantContext);
  requireResourceOwner(context, opts.userId);
  const { userId, projectRef, projectName, writeAdmissions } = opts;
  const accessToken = opts.accessToken.trim();
  const {bundle, pat} = writeAdmissions ?? await prepareSupabaseConnectionWrite(userId);
  const keys = await fetchProjectApiKeys(accessToken, projectRef, context);
  await saveSupabaseBundle(bundle, { projectUrl: keys.url, anonKey: keys.anonKey, serviceRoleKey: keys.serviceRoleKey });
  await saveUserProviderKey(userId, 'supabase_pat', accessToken,{writeAdmission:pat});

  const provision = await provisionUserSupabase({
    userId, tenantContext: context,
    projectUrl: keys.url,
    serviceRoleKey: keys.serviceRoleKey,
    accessToken,
    projectName: projectName || projectRef,
  });

  // Mark provision metadata on status via a lightweight custom key note — stored in PAT metadata already
  const status = await getUserSupabaseStatus(userId);
  return {
    status: {
      ...status,
      message: provision.message,
      ready: status.ready && provision.ok,
      provisioned: provision.ok && provision.schemaApplied && provision.memoryTablesReady,
    },
    provision,
    keysSaved: true,
  };
}

/** Client for the user's project (service role) — for AI memory/storage. */
export async function getUserSupabaseAdmin(userId: string): Promise<SupabaseClient | null> {
  const bundle = await readUserSupabaseBundle(userId);
  const url = bundle?.projectUrl, service = bundle?.serviceRoleKey;
  if (!url || !service || !projectRefFromUrl(url)) return null;
  return createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Prefer OAuth Management token, then pasted PAT. */
export async function getUserSupabaseManagementToken(userId: string, suppliedContext?: TenantContext): Promise<string | null> {
  const context = requireTenantContext(suppliedContext);
  requireResourceOwner(context, userId);
  const { getSupabaseOAuthAccessToken } = await import('./supabaseAuth.js');
  // The OAuth adapter returns null for ordinary refresh unavailability. A thrown
  // authority/transport failure must never select a different credential.
  const oauth = await getSupabaseOAuthAccessToken(userId);
  if (oauth) return oauth;
  return getUserProviderKey(userId, 'supabase_pat');
}

export async function userSupabaseMemoryReady(context: TenantContext): Promise<boolean> {
  const {userId}=requireTenantContext(context);
  const client = await getUserSupabaseAdmin(userId);
  if (!client) return false;
  const { error } = await client.from('xroga_session_memory').select('id').eq('xroga_user_id', userId).limit(1);
  return !error;
}
