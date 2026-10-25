-- Minimal stand-in for the Supabase objects the storage migration depends on.
-- Used ONLY by tests against a disposable local Postgres. It is not a migration.
-- Roles are cluster-wide and test files run in parallel against one server: "if not exists" alone races (two sessions both pass the check, the
-- second fails with a duplicate pg_authid key). Each create therefore swallows the duplicate and a transaction-level advisory lock serialises them.
do $$ begin
  perform pg_advisory_xact_lock(727274);
  begin create role anon nologin; exception when duplicate_object or unique_violation then null; end;
  begin create role authenticated nologin; exception when duplicate_object or unique_violation then null; end;
  begin create role service_role nologin bypassrls; exception when duplicate_object or unique_violation then null; end;
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
-- minimal swarm_runs (production: 002a_reconcile_foundation.sql) for the run-output artifact adapter tests
create table if not exists public.swarm_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid references public.projects(id) on delete set null,
  prompt text not null default '',
  status text default 'pending',
  output jsonb,
  created_at timestamptz default now()
);
grant all on public.swarm_runs to service_role;
