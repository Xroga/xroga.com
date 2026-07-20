import type { ProjectFile } from '../integrations/githubDeploy.js';

function wantsStorage(prompt: string): boolean {
  return /\b(upload|storage|avatar|image|file|media|bucket|photo|document)\b/i.test(prompt);
}

function wantsSaaS(prompt: string): boolean {
  return /\b(saas|subscription|billing|stripe|tenant|dashboard|multi[- ]?tenant)\b/i.test(prompt);
}

/**
 * SQL that runs in the USER's Supabase project (not Xroga's).
 * Generated into supabase/migrations so builders can apply via SQL editor or CLI.
 */
export function buildSupabaseProjectSql(opts: {
  projectName: string;
  userPrompt?: string;
}): ProjectFile[] {
  const prompt = opts.userPrompt || '';
  const storage = wantsStorage(prompt);
  const saas = wantsSaaS(prompt);
  const slug =
    opts.projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'app';

  const sql = `-- ${opts.projectName} — initial schema for YOUR Supabase project
-- Apply in Supabase Dashboard → SQL Editor, or: supabase db push
-- Auth users live in auth.users; app data below uses auth.uid() RLS.

create extension if not exists "pgcrypto";

-- Profiles (1:1 with auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- App records owned by the signed-in user
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

create policy "app_items_select_own"
  on public.app_items for select
  using (auth.uid() = user_id);

create policy "app_items_insert_own"
  on public.app_items for insert
  with check (auth.uid() = user_id);

create policy "app_items_update_own"
  on public.app_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "app_items_delete_own"
  on public.app_items for delete
  using (auth.uid() = user_id);
${
  saas
    ? `
-- SaaS stub: plan entitlement on profile (billing via Stripe keys in Vercel env)
alter table public.profiles
  add column if not exists plan text not null default 'free',
  add column if not exists stripe_customer_id text;
`
    : ''
}${
  storage
    ? `
-- Storage: user-owned files under {user_id}/...
insert into storage.buckets (id, name, public)
values ('${slug}-uploads', '${slug}-uploads', false)
on conflict (id) do nothing;

create policy "uploads_select_own"
  on storage.objects for select
  using (
    bucket_id = '${slug}-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "uploads_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = '${slug}-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "uploads_update_own"
  on storage.objects for update
  using (
    bucket_id = '${slug}-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "uploads_delete_own"
  on storage.objects for delete
  using (
    bucket_id = '${slug}-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
`
    : ''
}
`;

  const readme = `# Supabase (YOUR project)

This app is wired so **auth, database, and storage hit your Supabase project** — not Xroga's.

## 1. Connect in Xroga (recommended)
1. Open **Ship setup → Authorize Supabase** (Org OAuth App — no paste)
2. Pick an existing project **or create one** in the panel
3. Xroga fetches keys and applies schema + AI memory + storage RLS automatically
4. Connect **Vercel** so keys sync as project env vars on deploy  
   (OAuth deploy works; env write may need a **Full Account** Vercel token)

## 2. This migration file
\`supabase/migrations/001_initial.sql\` matches what Xroga auto-applies on Authorize.
Keep it in the repo for \`supabase db push\` / SQL Editor if you rebuild outside Xroga.

## 3. Confirm
- \`/api/health\` on your Vercel deploy should show \`hasSupabase: true\`
- Sign-in at \`/login\` uses magic links against **your** Auth providers

${storage ? `## Storage\nBucket \`${slug}-uploads\` stores files under \`{user_id}/...\` with RLS.\n` : ''}${saas ? `## SaaS\n\`profiles.plan\` / \`stripe_customer_id\` are stubs — wire Stripe webhooks using your vault Stripe key.\n` : ''}
`;

  return [
    { path: 'supabase/migrations/001_initial.sql', content: sql },
    { path: 'supabase/README.md', content: readme },
  ];
}
