/**
 * One-click provision of the USER's Supabase project:
 * - schema (app + Xroga AI memory)
 * - storage buckets
 * - optional Management API (PAT) to fetch keys + run SQL
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import {
  getUserProviderKey,
  getUserSupabaseStatus,
  saveUserProviderKey,
} from './userProviderKeys.js';

const MGMT = 'https://api.supabase.com/v1';

export function projectRefFromUrl(projectUrl: string): string | null {
  try {
    const host = new URL(projectUrl.trim()).hostname;
    const m = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

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

async function mgmtFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${MGMT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  if (!res.ok) {
    const msg =
      (body as { message?: string })?.message ||
      (body as { error?: string })?.error ||
      `Supabase Management API ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export async function listSupabaseProjects(accessToken: string): Promise<MgmtProject[]> {
  const data = await mgmtFetch<Array<Record<string, unknown>>>('/projects', accessToken);
  return (data || []).map((p) => ({
    id: String(p.id || p.ref || ''),
    ref: String(p.id || p.ref || ''),
    name: String(p.name || p.id || 'project'),
    organization_id: p.organization_id ? String(p.organization_id) : undefined,
    region: p.region ? String(p.region) : undefined,
  }));
}

export async function fetchProjectApiKeys(
  accessToken: string,
  projectRef: string,
): Promise<{ url: string; anonKey: string; serviceRoleKey: string }> {
  // Current Management API requires reveal=true for secret values
  const keys = await mgmtFetch<
    Array<{
      name?: string;
      api_key?: string;
      type?: string;
      id?: string;
    }>
  >(`/projects/${encodeURIComponent(projectRef)}/api-keys?reveal=true`, accessToken);

  const pick = (...preds: Array<(k: (typeof keys)[number]) => boolean>) => {
    for (const pred of preds) {
      const hit = keys.find(pred)?.api_key?.trim();
      if (hit) return hit;
    }
    return undefined;
  };

  const anon = pick(
    (k) => k.name === 'anon' || k.type === 'legacyAnonKey' || k.type === 'anon',
    (k) => k.type === 'publishable' || /publishable|anon/i.test(String(k.name)),
  );
  const service = pick(
    (k) => k.name === 'service_role' || k.type === 'legacyServiceRoleKey' || k.type === 'service_role',
    (k) => k.type === 'secret' || /service|secret/i.test(String(k.name)),
  );

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
}

export async function runSqlViaManagementApi(
  accessToken: string,
  projectRef: string,
  query: string,
): Promise<void> {
  await mgmtFetch(`/projects/${encodeURIComponent(projectRef)}/database/query`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export async function runSqlViaDatabasePassword(
  projectRef: string,
  dbPassword: string,
  query: string,
  regionHint?: string,
): Promise<void> {
  const password = dbPassword.trim().replace(/^["']|["']$/g, '');
  const hosts = [
    regionHint
      ? `aws-1-${regionHint}.pooler.supabase.com`
      : 'aws-1-ap-southeast-1.pooler.supabase.com',
    'aws-0-us-east-1.pooler.supabase.com',
    'aws-1-us-east-1.pooler.supabase.com',
    'aws-0-eu-central-1.pooler.supabase.com',
    `${projectRef}.supabase.co`,
  ];
  const ports = [6543, 5432];
  let lastError: Error | undefined;

  for (const host of hosts) {
    for (const port of ports) {
      const user = host.includes('pooler') ? `postgres.${projectRef}` : 'postgres';
      const client = new pg.Client({
        host,
        port,
        user,
        password,
        database: 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 12_000,
      });
      try {
        await client.connect();
        await client.query(query);
        await client.end();
        return;
      } catch (err) {
        lastError = err as Error;
        try {
          await client.end();
        } catch {
          /* ignore */
        }
      }
    }
  }
  throw new Error(lastError?.message || 'Could not connect with database password');
}

export async function ensureStorageBuckets(
  url: string,
  serviceRoleKey: string,
  bucketIds: string[] = ['xroga-uploads'],
): Promise<string[]> {
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const created: string[] = [];
  for (const id of bucketIds) {
    const { data: existing } = await supabase.storage.getBucket(id);
    if (existing) {
      created.push(id);
      continue;
    }
    const { error } = await supabase.storage.createBucket(id, {
      public: false,
      fileSizeLimit: 52_428_800,
    });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      console.warn(`[supabaseProvision] bucket ${id}:`, error.message);
    } else {
      created.push(id);
    }
  }
  return created;
}

export interface ProvisionResult {
  ok: boolean;
  method: 'management_api' | 'database_password' | 'keys_only';
  projectRef?: string;
  projectUrl?: string;
  buckets: string[];
  schemaApplied: boolean;
  memoryTablesReady: boolean;
  message: string;
  error?: string;
}

/** Apply schema + storage on the user's project. */
export async function provisionUserSupabase(opts: {
  projectUrl: string;
  serviceRoleKey: string;
  accessToken?: string;
  dbPassword?: string;
  projectName?: string;
  region?: string;
}): Promise<ProvisionResult> {
  const ref = projectRefFromUrl(opts.projectUrl);
  if (!ref) {
    return {
      ok: false,
      method: 'keys_only',
      buckets: [],
      schemaApplied: false,
      memoryTablesReady: false,
      message: 'Invalid Supabase project URL',
      error: 'Invalid URL',
    };
  }

  const sql = buildUserSupabaseProvisionSql({
    projectName: opts.projectName || ref,
    includeAppSchema: true,
    includeStorage: true,
  });

  let schemaApplied = false;
  let method: ProvisionResult['method'] = 'keys_only';
  let lastError: string | undefined;

  if (opts.accessToken?.trim()) {
    try {
      await runSqlViaManagementApi(opts.accessToken.trim(), ref, sql);
      schemaApplied = true;
      method = 'management_api';
    } catch (err) {
      lastError = (err as Error).message;
    }
  }

  if (!schemaApplied && opts.dbPassword?.trim()) {
    try {
      await runSqlViaDatabasePassword(ref, opts.dbPassword, sql, opts.region);
      schemaApplied = true;
      method = 'database_password';
    } catch (err) {
      lastError = (err as Error).message;
    }
  }

  let buckets: string[] = [];
  try {
    buckets = await ensureStorageBuckets(opts.projectUrl, opts.serviceRoleKey, [
      'xroga-uploads',
      `${(opts.projectName || ref).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24)}-uploads`,
    ]);
  } catch (err) {
    lastError = lastError || (err as Error).message;
  }

  const ok = schemaApplied || buckets.length > 0;
  return {
    ok,
    method,
    projectRef: ref,
    projectUrl: opts.projectUrl,
    buckets,
    schemaApplied,
    memoryTablesReady: schemaApplied,
    message: schemaApplied
      ? `Provisioned on your Supabase (${method}): schema + memory tables + storage.`
      : buckets.length
        ? `Storage ready on your Supabase. Schema needs Access Token or DB password for full auto-setup. ${lastError || ''}`
        : `Could not provision automatically. ${lastError || 'Add Access Token or DB password.'}`,
    error: ok ? undefined : lastError,
  };
}

/** One-click: PAT + project ref → save keys + provision everything. */
export async function oneClickConnectSupabase(opts: {
  userId: string;
  accessToken: string;
  projectRef: string;
  vercelProject?: string;
  projectName?: string;
}): Promise<{
  status: Awaited<ReturnType<typeof getUserSupabaseStatus>>;
  provision: ProvisionResult;
  keysSaved: boolean;
}> {
  const accessToken = opts.accessToken.trim();
  const keys = await fetchProjectApiKeys(accessToken, opts.projectRef);
  await saveUserProviderKey(opts.userId, 'supabase_url', keys.url);
  await saveUserProviderKey(opts.userId, 'supabase_anon', keys.anonKey);
  await saveUserProviderKey(opts.userId, 'supabase', keys.serviceRoleKey);
  await saveUserProviderKey(opts.userId, 'supabase_pat', accessToken);

  const provision = await provisionUserSupabase({
    projectUrl: keys.url,
    serviceRoleKey: keys.serviceRoleKey,
    accessToken,
    projectName: opts.projectName || opts.projectRef,
  });

  // Mark provision metadata on status via a lightweight custom key note — stored in PAT metadata already
  const status = await getUserSupabaseStatus(opts.userId);
  return {
    status: {
      ...status,
      message: provision.message,
      ready: status.ready && (provision.schemaApplied || provision.buckets.length > 0),
    },
    provision,
    keysSaved: true,
  };
}

/** Client for the user's project (service role) — for AI memory/storage. */
export async function getUserSupabaseAdmin(userId: string): Promise<SupabaseClient | null> {
  const [url, service] = await Promise.all([
    getUserProviderKey(userId, 'supabase_url'),
    getUserProviderKey(userId, 'supabase'),
  ]);
  if (!url || !service) return null;
  return createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Prefer OAuth Management token, then pasted PAT. */
export async function getUserSupabaseManagementToken(userId: string): Promise<string | null> {
  try {
    const { getSupabaseOAuthAccessToken } = await import('./supabaseAuth.js');
    const oauth = await getSupabaseOAuthAccessToken(userId);
    if (oauth) return oauth;
  } catch {
    /* oauth module optional at boot */
  }
  return getUserProviderKey(userId, 'supabase_pat');
}

export async function userSupabaseMemoryReady(userId: string): Promise<boolean> {
  const client = await getUserSupabaseAdmin(userId);
  if (!client) return false;
  const { error } = await client.from('xroga_session_memory').select('id').limit(1);
  return !error;
}
