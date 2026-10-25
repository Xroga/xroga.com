-- Manual rollback for 20261024000000_worker_task_leases.sql. NOT in supabase/migrations/ (never auto-applied).
-- Safe at any time workers are stopped: a lease row is coordination state only. Dropping it forgets which worker held which task and
-- restarts every fencing-token sequence, so run it only when no worker is running.
begin;
drop function if exists public.worker_lease_release(text, text, text, text, bigint);
drop function if exists public.worker_lease_renew(text, text, text, text, bigint, integer, timestamptz);
drop function if exists public.worker_lease_check(text, text, text, text, bigint, timestamptz);
drop function if exists public.worker_lease_acquire(text, text, text, text, integer, timestamptz);
drop table if exists public.worker_task_leases;
commit;
