-- Heartbeat only. Do not replay a state snapshot or advance event sequence to
-- reuse the existing attempt-state writer, whose exact replays do not refresh it.
create or replace function public.heartbeat_swarm_run_attempt(
  p_run_id uuid,p_owner_id uuid,p_worker_id text,p_generation uuid
) returns table(id uuid,user_id uuid,worker_id text,lease_generation uuid,status text,heartbeat_at timestamptz)
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare current_run public.swarm_runs%rowtype;
begin
  if p_run_id is null or p_owner_id is null or p_generation is null or p_worker_id is null or length(p_worker_id) not between 1 and 200 then
    raise exception 'invalid run heartbeat' using errcode='22023';
  end if;
  select * into current_run from public.swarm_runs as run where run.id=p_run_id and run.user_id=p_owner_id for update;
  if not found or current_run.status<>'running' or current_run.completed_at is not null
    or current_run.worker_id is distinct from p_worker_id or current_run.lease_generation is distinct from p_generation then return; end if;
  return query update public.swarm_runs as run set heartbeat_at=clock_timestamp()
    where run.id=p_run_id and run.user_id=p_owner_id
    returning run.id,run.user_id,run.worker_id,run.lease_generation,run.status,run.heartbeat_at;
end;
$$;
revoke all on function public.heartbeat_swarm_run_attempt(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.heartbeat_swarm_run_attempt(uuid,uuid,text,uuid) to service_role;
