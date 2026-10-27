-- Fenced task leases for workers (Batch 1.5 Phase 2 / INFRA-006).
--
-- Additive only: one new table and four new functions. Nothing here touches an existing table, policy or function.
-- The table is private: RLS enabled and forced, no grant to anon or authenticated, only service_role (the API and workers).
--
-- A lease says WHICH worker is running a task. `token` is a fencing token: it increases on every acquisition of the same
-- (tenant, run, task) and never repeats, so a worker that stalled and woke up after another took over can be refused at
-- every effect boundary by comparing its token with the current one. The row is kept after release (held = false) so the
-- token sequence never restarts.
--
-- Time: callers normally pass NULL and the database clock decides (no worker clock skew can extend a lease). Tests pass an
-- explicit instant to make expiry deterministic.

create table if not exists public.worker_task_leases (
  tenant_id   text        not null check (length(tenant_id) between 1 and 128),
  run_id      text        not null check (length(run_id)    between 1 and 128),
  task_id     text        not null check (length(task_id)   between 1 and 128),
  worker_id   text        not null check (length(worker_id) between 1 and 128),
  token       bigint      not null check (token >= 1),
  expires_at  timestamptz not null,
  held        boolean     not null default true,
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, run_id, task_id)
);

-- Takes the lease when it is free, released or expired. Returns the new fencing token, or NULL while another worker holds a live lease.
create or replace function public.worker_lease_acquire(
  p_tenant text, p_run text, p_task text, p_worker text, p_ttl_ms integer, p_now timestamptz default null
) returns bigint language plpgsql set search_path = public, pg_temp as $$
declare
  v_now   timestamptz := coalesce(p_now, clock_timestamp());
  v_token bigint;
begin
  if p_ttl_ms is null or p_ttl_ms < 1 or p_ttl_ms > 900000 then
    raise exception 'lease ttl out of range' using errcode = '22023';
  end if;
  insert into public.worker_task_leases as l (tenant_id, run_id, task_id, worker_id, token, expires_at, held, updated_at)
  values (p_tenant, p_run, p_task, p_worker, 1, v_now + make_interval(secs => p_ttl_ms / 1000.0), true, v_now)
  on conflict (tenant_id, run_id, task_id) do update
    set worker_id = excluded.worker_id,
        token     = l.token + 1,
        expires_at = excluded.expires_at,
        held      = true,
        updated_at = v_now
    where (not l.held) or l.expires_at <= v_now
  returning l.token into v_token;
  return v_token; -- NULL when the conflict row was not updated: a live lease is held
end $$;

-- 'ok' | 'expired' | 'lost'. 'lost' covers: no row, released, another worker, another token. 'expired' is our own lease past its time.
create or replace function public.worker_lease_check(
  p_tenant text, p_run text, p_task text, p_worker text, p_token bigint, p_now timestamptz default null
) returns text language plpgsql stable set search_path = public, pg_temp as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  r public.worker_task_leases%rowtype;
begin
  select * into r from public.worker_task_leases where tenant_id = p_tenant and run_id = p_run and task_id = p_task;
  if not found or not r.held or r.worker_id <> p_worker or r.token <> p_token then return 'lost'; end if;
  if r.expires_at <= v_now then return 'expired'; end if;
  return 'ok';
end $$;

-- Extends a lease this worker still holds. Returns the same classification as the check; only 'ok' changed the row.
create or replace function public.worker_lease_renew(
  p_tenant text, p_run text, p_task text, p_worker text, p_token bigint, p_ttl_ms integer, p_now timestamptz default null
) returns text language plpgsql set search_path = public, pg_temp as $$
declare
  v_now timestamptz := coalesce(p_now, clock_timestamp());
  v_status text;
begin
  if p_ttl_ms is null or p_ttl_ms < 1 or p_ttl_ms > 900000 then
    raise exception 'lease ttl out of range' using errcode = '22023';
  end if;
  update public.worker_task_leases
     set expires_at = v_now + make_interval(secs => p_ttl_ms / 1000.0), updated_at = v_now
   where tenant_id = p_tenant and run_id = p_run and task_id = p_task
     and worker_id = p_worker and token = p_token and held and expires_at > v_now;
  if found then return 'ok'; end if;
  v_status := public.worker_lease_check(p_tenant, p_run, p_task, p_worker, p_token, v_now);
  return v_status;
end $$;

-- Releases a lease only if it is still exactly ours. A stale release is a silent no-op and never frees the new holder.
create or replace function public.worker_lease_release(
  p_tenant text, p_run text, p_task text, p_worker text, p_token bigint
) returns void language sql set search_path = public, pg_temp as $$
  update public.worker_task_leases set held = false, updated_at = clock_timestamp()
   where tenant_id = p_tenant and run_id = p_run and task_id = p_task and worker_id = p_worker and token = p_token and held;
$$;

alter table public.worker_task_leases enable row level security;
alter table public.worker_task_leases force row level security;
revoke all on public.worker_task_leases from public, anon, authenticated;
grant all on public.worker_task_leases to service_role;

revoke all on function
  public.worker_lease_acquire(text, text, text, text, integer, timestamptz),
  public.worker_lease_check(text, text, text, text, bigint, timestamptz),
  public.worker_lease_renew(text, text, text, text, bigint, integer, timestamptz),
  public.worker_lease_release(text, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function
  public.worker_lease_acquire(text, text, text, text, integer, timestamptz),
  public.worker_lease_check(text, text, text, text, bigint, timestamptz),
  public.worker_lease_renew(text, text, text, text, bigint, integer, timestamptz),
  public.worker_lease_release(text, text, text, text, bigint)
  to service_role;
