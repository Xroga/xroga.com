-- Minimal stand-in for the Supabase objects the storage migration depends on.
-- Used ONLY by tests against a disposable local Postgres. It is not a migration.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid());
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table if not exists public.projects (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null, file_path text, file_type text, file_url text, content text,
  version integer default 1, created_at timestamptz default now()
);
grant all on public.projects, public.project_files to service_role;
