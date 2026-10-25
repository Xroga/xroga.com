-- Xroga Drive foundation (Batch 1.5 / INFRA-002 + INFRA-003).
--
-- Additive only: new tables, one additive column on project_files, new functions.
-- Nothing here changes an existing table's behaviour, entitlement or policy.
-- Private by default: every table has RLS enabled, only service_role writes, and the only
-- authenticated read is "my own READY objects" (column-limited, no bucket/key exposure).
--
-- tenant_id: until Batch 1 TenantContext is accepted into main (WAITING_FOR_BATCH1_ACCEPTED_INTERFACE)
-- the backend sets tenant_id = owner user id. The column and every quota/ownership check are already
-- keyed by tenant_id so the TenantContext boundary can replace that mapping without a schema change.

-- ---------------------------------------------------------------------------------------------
-- Objects
-- ---------------------------------------------------------------------------------------------
create table if not exists public.storage_objects (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  owner_user_id       uuid not null,
  project_id          uuid references public.projects(id) on delete set null,
  object_class        text not null
                      check (object_class in ('upload','artifact','media','evidence','source_archive','screenshot','export')),
  original_filename   text not null,
  safe_filename       text not null,
  provider            text not null default 'r2' check (provider in ('r2','memory')),
  bucket              text not null,
  object_key          text not null,
  content_type        text not null,
  declared_size       bigint not null check (declared_size >= 0),
  size_bytes          bigint check (size_bytes is null or size_bytes >= 0),
  sha256_declared     text check (sha256_declared is null or sha256_declared ~ '^[0-9a-f]{64}$'),
  sha256_verified     text check (sha256_verified is null or sha256_verified ~ '^[0-9a-f]{64}$'),
  state               text not null default 'PENDING'
                      check (state in ('PENDING','UPLOADING','VERIFYING','READY','FAILED','QUARANTINED','CORRUPT','DELETING','DELETED')),
  visibility          text not null default 'private' check (visibility in ('private','public')),
  upload_mode         text not null default 'single' check (upload_mode in ('single','multipart')),
  multipart_upload_id text,
  upload_expires_at   timestamptz,
  retention_until     timestamptz,
  provider_version    text,
  migration_job_id    uuid,
  legacy_source       jsonb,
  verified_at         timestamptz,
  verification_result jsonb,
  deleting_at         timestamptz,
  deleted_at          timestamptz,
  error_code          text,
  error_detail        text,
  version             integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint storage_objects_provider_key_uniq unique (provider, bucket, object_key),
  -- A READY object must carry a verified size and a verified SHA-256: no metadata-only READY.
  constraint storage_objects_ready_is_verified
    check (state <> 'READY' or (size_bytes is not null and sha256_verified is not null and verified_at is not null))
);

create index if not exists idx_storage_objects_tenant_state on public.storage_objects (tenant_id, state);
create index if not exists idx_storage_objects_project on public.storage_objects (project_id) where project_id is not null;
create index if not exists idx_storage_objects_upload_expiry on public.storage_objects (upload_expires_at)
  where state in ('PENDING','UPLOADING');

create or replace function public.storage_objects_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  ok boolean;
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.tenant_id is distinct from old.tenant_id
       or new.owner_user_id is distinct from old.owner_user_id
       or new.bucket is distinct from old.bucket
       or new.object_key is distinct from old.object_key
       or new.provider is distinct from old.provider
       or new.created_at is distinct from old.created_at then
      raise exception 'storage_objects: immutable identity column changed' using errcode = '23514';
    end if;
    if new.state is distinct from old.state then
      ok := (old.state, new.state) in (
        ('PENDING','UPLOADING'), ('PENDING','VERIFYING'), ('PENDING','FAILED'), ('PENDING','DELETING'),
        ('UPLOADING','VERIFYING'), ('UPLOADING','FAILED'), ('UPLOADING','DELETING'),
        ('VERIFYING','READY'), ('VERIFYING','CORRUPT'), ('VERIFYING','QUARANTINED'), ('VERIFYING','FAILED'),
        ('READY','DELETING'), ('READY','QUARANTINED'), ('READY','CORRUPT'),
        ('QUARANTINED','VERIFYING'), ('QUARANTINED','DELETING'),
        ('CORRUPT','VERIFYING'), ('CORRUPT','DELETING'),
        ('FAILED','DELETING'),
        ('DELETING','DELETED')
      );
      if not ok then
        raise exception 'storage_objects: illegal state transition % -> %', old.state, new.state using errcode = '23514';
      end if;
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_storage_objects_guard on public.storage_objects;
create trigger trg_storage_objects_guard before insert or update on public.storage_objects
  for each row execute function public.storage_objects_guard();

-- ---------------------------------------------------------------------------------------------
-- Quota ledger: usage per tenant, one reservation per object
-- ---------------------------------------------------------------------------------------------
create table if not exists public.storage_usage (
  tenant_id       uuid primary key,
  reserved_bytes  bigint not null default 0 check (reserved_bytes >= 0),
  committed_bytes bigint not null default 0 check (committed_bytes >= 0),
  quota_bytes     bigint check (quota_bytes is null or quota_bytes >= 0),
  updated_at      timestamptz not null default now()
);

create table if not exists public.storage_reservations (
  object_id  uuid primary key references public.storage_objects(id) on delete cascade,
  tenant_id  uuid not null,
  bytes      bigint not null check (bytes >= 0),
  state      text not null default 'ACTIVE' check (state in ('ACTIVE','COMMITTED','RELEASED','EXPIRED','FREED')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_storage_reservations_expiry on public.storage_reservations (expires_at) where state = 'ACTIVE';
create index if not exists idx_storage_reservations_tenant on public.storage_reservations (tenant_id, state);

-- Reserve: serialised per tenant by locking the usage row. Idempotent per object.
create or replace function public.storage_reserve(
  p_object_id uuid, p_tenant uuid, p_bytes bigint, p_expires timestamptz, p_quota bigint
) returns text language plpgsql set search_path = public, pg_temp as $$
declare
  u public.storage_usage%rowtype;
  existing public.storage_reservations%rowtype;
  had boolean;
begin
  if p_bytes < 0 then raise exception 'negative reservation' using errcode = '22003'; end if;
  insert into public.storage_usage (tenant_id) values (p_tenant) on conflict (tenant_id) do nothing;
  select * into u from public.storage_usage where tenant_id = p_tenant for update;
  select * into existing from public.storage_reservations where object_id = p_object_id for update;
  had := found;
  if had then
    if existing.tenant_id <> p_tenant then raise exception 'reservation tenant mismatch' using errcode = '42501'; end if;
    if existing.state in ('ACTIVE','COMMITTED') then return 'ALREADY_RESERVED'; end if;
  end if;
  if p_quota is not null then
    update public.storage_usage set quota_bytes = p_quota where tenant_id = p_tenant;
    u.quota_bytes := p_quota;
    if u.reserved_bytes + u.committed_bytes + p_bytes > p_quota then return 'QUOTA_EXCEEDED'; end if;
  end if;
  update public.storage_usage
     set reserved_bytes = reserved_bytes + p_bytes, updated_at = now()
   where tenant_id = p_tenant;
  if had then
    update public.storage_reservations
       set bytes = p_bytes, state = 'ACTIVE', expires_at = p_expires, updated_at = now()
     where object_id = p_object_id;
  else
    insert into public.storage_reservations (object_id, tenant_id, bytes, expires_at)
    values (p_object_id, p_tenant, p_bytes, p_expires);
  end if;
  return 'OK';
end $$;

-- Commit: ACTIVE -> COMMITTED with the authoritative size. Replays are no-ops.
create or replace function public.storage_commit(p_object_id uuid, p_actual bigint) returns text
language plpgsql set search_path = public, pg_temp as $$
declare
  r public.storage_reservations%rowtype;
begin
  select * into r from public.storage_reservations where object_id = p_object_id for update;
  if not found then return 'NO_RESERVATION'; end if;
  perform 1 from public.storage_usage where tenant_id = r.tenant_id for update;
  if r.state = 'COMMITTED' then return 'ALREADY_COMMITTED'; end if;
  if r.state <> 'ACTIVE' then return 'RESERVATION_LOST'; end if;
  if p_actual > r.bytes then return 'SIZE_EXCEEDS_RESERVATION'; end if;
  update public.storage_usage
     set reserved_bytes = reserved_bytes - r.bytes,
         committed_bytes = committed_bytes + p_actual,
         updated_at = now()
   where tenant_id = r.tenant_id;
  update public.storage_reservations
     set state = 'COMMITTED', bytes = p_actual, updated_at = now()
   where object_id = p_object_id;
  return 'OK';
end $$;

-- Release an ACTIVE reservation (failed / cancelled / expired upload).
create or replace function public.storage_release(p_object_id uuid, p_final_state text default 'RELEASED') returns text
language plpgsql set search_path = public, pg_temp as $$
declare
  r public.storage_reservations%rowtype;
begin
  if p_final_state not in ('RELEASED','EXPIRED') then raise exception 'bad final state'; end if;
  select * into r from public.storage_reservations where object_id = p_object_id for update;
  if not found then return 'NOOP'; end if;
  perform 1 from public.storage_usage where tenant_id = r.tenant_id for update;
  if r.state <> 'ACTIVE' then return 'NOOP'; end if;
  update public.storage_usage
     set reserved_bytes = greatest(reserved_bytes - r.bytes, 0), updated_at = now()
   where tenant_id = r.tenant_id;
  update public.storage_reservations set state = p_final_state, updated_at = now() where object_id = p_object_id;
  return 'OK';
end $$;

-- Free committed bytes when an object reaches DELETED. Idempotent.
create or replace function public.storage_free(p_object_id uuid) returns text
language plpgsql set search_path = public, pg_temp as $$
declare
  r public.storage_reservations%rowtype;
begin
  select * into r from public.storage_reservations where object_id = p_object_id for update;
  if not found then return 'NOOP'; end if;
  perform 1 from public.storage_usage where tenant_id = r.tenant_id for update;
  if r.state <> 'COMMITTED' then return 'NOOP'; end if;
  update public.storage_usage
     set committed_bytes = greatest(committed_bytes - r.bytes, 0), updated_at = now()
   where tenant_id = r.tenant_id;
  update public.storage_reservations set state = 'FREED', updated_at = now() where object_id = p_object_id;
  return 'OK';
end $$;

-- Expire stale ACTIVE reservations. Returns the number expired.
create or replace function public.storage_expire_reservations(p_now timestamptz) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare
  rid uuid;
  n integer := 0;
begin
  for rid in
    select object_id from public.storage_reservations where state = 'ACTIVE' and expires_at <= p_now
    order by expires_at limit 500
  loop
    if public.storage_release(rid, 'EXPIRED') = 'OK' then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Recompute a tenant's counters from the reservation rows (drift repair).
create or replace function public.storage_reconcile_usage(p_tenant uuid)
returns table (old_reserved bigint, old_committed bigint, new_reserved bigint, new_committed bigint)
language plpgsql set search_path = public, pg_temp as $$
declare
  u public.storage_usage%rowtype;
  nr bigint;
  nc bigint;
begin
  insert into public.storage_usage (tenant_id) values (p_tenant) on conflict (tenant_id) do nothing;
  select * into u from public.storage_usage where tenant_id = p_tenant for update;
  select coalesce(sum(bytes) filter (where state = 'ACTIVE'), 0),
         coalesce(sum(bytes) filter (where state = 'COMMITTED'), 0)
    into nr, nc from public.storage_reservations where tenant_id = p_tenant;
  update public.storage_usage set reserved_bytes = nr, committed_bytes = nc, updated_at = now() where tenant_id = p_tenant;
  return query select u.reserved_bytes, u.committed_bytes, nr, nc;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Audit (never stores URLs, signatures or credentials)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.storage_audit_events (
  id            bigint generated always as identity primary key,
  at            timestamptz not null default now(),
  tenant_id     uuid,
  actor_user_id uuid,
  object_id     uuid,
  action        text not null,
  outcome       text not null,
  detail        jsonb not null default '{}'::jsonb
);
create index if not exists idx_storage_audit_object on public.storage_audit_events (object_id, at desc);

-- ---------------------------------------------------------------------------------------------
-- Migration ledger (INFRA-003)
-- ---------------------------------------------------------------------------------------------
create table if not exists public.storage_migration_jobs (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  source_provider    text not null,
  source_selector    jsonb not null default '{}'::jsonb,
  destination_bucket text not null,
  mode               text not null default 'dry_run' check (mode in ('dry_run','copy')),
  phase              text not null default 'DISCOVER'
                     check (phase in ('DISCOVER','DRY_RUN','COPY','VERIFY','RECONCILE','READ_NEW','OBSERVE','FREEZE_OLD','RETAIN','APPROVED_DELETE')),
  status             text not null default 'CREATED'
                     check (status in ('CREATED','RUNNING','PAUSED','COMPLETED','FAILED','CANCELLED')),
  cursor             jsonb not null default '{}'::jsonb,
  -- stage -> Ed25519-signed approval token. A token stored here authorises nothing until the engine verifies its signature
  -- against the approver PUBLIC key (STORAGE_MIGRATION_APPROVER_PUBKEY); a database row alone cannot approve a stage.
  approvals          jsonb not null default '{}'::jsonb,
  -- digest of the exact object set the last dry-run planned (cleared when discovery adds or changes objects)
  plan               jsonb,
  created_by         text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.storage_migration_items (
  id                    uuid primary key default gen_random_uuid(),
  job_id                uuid not null references public.storage_migration_jobs(id) on delete restrict,
  source_provider       text not null,
  source_id             text not null,
  tenant_id             uuid,
  owner_user_id         uuid,
  project_id            uuid,
  source_size           bigint,
  source_sha256         text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  source_fingerprint    text,
  source_content_type   text,
  source_filename       text,
  object_class          text,
  destination_object_id uuid references public.storage_objects(id),
  destination_key       text,
  destination_sha256    text check (destination_sha256 is null or destination_sha256 ~ '^[0-9a-f]{64}$'),
  status                text not null default 'DISCOVERED'
                        check (status in ('DISCOVERED','ELIGIBLE','SKIPPED','BLOCKED','COPYING','COPIED','VERIFIED',
                                          'FAILED','MISSING_SOURCE','SOURCE_CHANGED','CORRUPT_DESTINATION')),
  skip_reason           text,
  attempts              integer not null default 0,
  last_error_class      text,
  last_error            text,
  lease_owner           text,
  lease_expires_at      timestamptz,
  read_mode             text not null default 'legacy' check (read_mode in ('legacy','new')),
  source_retention      text not null default 'RETAINED' check (source_retention in ('RETAINED','FROZEN','DELETE_APPROVED','DELETED')),
  rollback_ref          jsonb,
  started_at            timestamptz,
  completed_at          timestamptz,
  verified_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  -- One destination per source object, ever: replays and concurrent jobs converge on the same row.
  constraint storage_migration_items_source_uniq unique (source_provider, source_id)
);
create index if not exists idx_storage_migration_items_job_status on public.storage_migration_items (job_id, status);

-- Claim eligible items for a worker with a lease (no transaction is held during the transfer).
create or replace function public.storage_migration_claim(
  p_job uuid, p_worker text, p_limit integer, p_lease_seconds integer
) returns setof public.storage_migration_items language plpgsql set search_path = public, pg_temp as $$
begin
  return query
  with picked as (
    select id from public.storage_migration_items
     where job_id = p_job
       and (status in ('ELIGIBLE','FAILED') or (status = 'COPYING' and lease_expires_at < now()))
       and (lease_expires_at is null or lease_expires_at < now())
     order by created_at
     limit p_limit
     for update skip locked
  )
  update public.storage_migration_items i
     set status = 'COPYING', lease_owner = p_worker,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         attempts = i.attempts + 1, started_at = coalesce(i.started_at, now()), updated_at = now()
    from picked where i.id = picked.id
  returning i.*;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Additive link from the existing project_files rows to a canonical object
-- ---------------------------------------------------------------------------------------------
alter table public.project_files
  add column if not exists storage_object_id uuid references public.storage_objects(id) on delete set null;
create index if not exists idx_project_files_storage_object on public.project_files (storage_object_id)
  where storage_object_id is not null;

-- ---------------------------------------------------------------------------------------------
-- Access control: RLS everywhere, writes only through service_role
-- ---------------------------------------------------------------------------------------------
alter table public.storage_objects          enable row level security;
alter table public.storage_usage            enable row level security;
alter table public.storage_reservations     enable row level security;
alter table public.storage_audit_events     enable row level security;
alter table public.storage_migration_jobs   enable row level security;
alter table public.storage_migration_items  enable row level security;
-- FORCE: the table owner is subject to the policies too (service_role still bypasses by design; it is the only writer)
alter table public.storage_objects          force row level security;
alter table public.storage_usage            force row level security;
alter table public.storage_reservations     force row level security;
alter table public.storage_audit_events     force row level security;
alter table public.storage_migration_jobs   force row level security;
alter table public.storage_migration_items  force row level security;

revoke all on public.storage_objects, public.storage_usage, public.storage_reservations,
              public.storage_audit_events, public.storage_migration_jobs, public.storage_migration_items
  from public, anon, authenticated;

-- Owners may read the non-sensitive columns of their own READY objects. No bucket, key or upload id.
grant select (id, tenant_id, owner_user_id, project_id, object_class, original_filename, safe_filename,
              content_type, size_bytes, sha256_verified, state, visibility, created_at, updated_at)
  on public.storage_objects to authenticated;

drop policy if exists storage_objects_owner_read on public.storage_objects;
create policy storage_objects_owner_read on public.storage_objects
  for select to authenticated
  using (owner_user_id = auth.uid() and state = 'READY');

grant all on public.storage_objects, public.storage_usage, public.storage_reservations,
             public.storage_audit_events, public.storage_migration_jobs, public.storage_migration_items
  to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke all on function
  public.storage_reserve(uuid, uuid, bigint, timestamptz, bigint),
  public.storage_commit(uuid, bigint),
  public.storage_release(uuid, text),
  public.storage_free(uuid),
  public.storage_expire_reservations(timestamptz),
  public.storage_reconcile_usage(uuid),
  public.storage_migration_claim(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function
  public.storage_reserve(uuid, uuid, bigint, timestamptz, bigint),
  public.storage_commit(uuid, bigint),
  public.storage_release(uuid, text),
  public.storage_free(uuid),
  public.storage_expire_reservations(timestamptz),
  public.storage_reconcile_usage(uuid),
  public.storage_migration_claim(uuid, text, integer, integer)
  to service_role;
