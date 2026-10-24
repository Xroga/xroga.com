-- Preserve the existing claim API, advisory exclusion and bounded retry policy.
-- Transaction-start time can be stale after a row-lock wait. Inspect the locked
-- current row first, then use one database wall-clock instant for the new lease.
create or replace function public.operations_claim_action(
  p_action_id uuid, p_lease_owner text, p_lease_seconds int default 60
) returns setof public.operations_actions
language plpgsql security definer set search_path=pg_catalog,public
as $$
declare action_row public.operations_actions%rowtype; claimed_time timestamptz;
begin
  if p_action_id is null or p_lease_owner is null or length(btrim(p_lease_owner))=0
    or p_lease_seconds is null then
    raise exception 'invalid action lease' using errcode='22023';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended(p_action_id::text,0)) then return; end if;
  select * into action_row from public.operations_actions where id=p_action_id for update;
  if not found then return; end if;
  claimed_time:=clock_timestamp();
  if action_row.status not in ('queued','approved','failed','running')
    or action_row.attempt_count>=action_row.max_attempts
    or (action_row.lease_expires_at is not null and action_row.lease_expires_at>=claimed_time) then return; end if;
  return query update public.operations_actions
    set status='running',lease_owner=p_lease_owner,
      lease_expires_at=claimed_time+make_interval(secs=>least(greatest(p_lease_seconds,10),600)),
      attempt_count=attempt_count+1,started_at=coalesce(started_at,claimed_time),updated_at=claimed_time
    where id=action_row.id returning *;
end;
$$;
revoke all on function public.operations_claim_action(uuid,text,int) from public,anon,authenticated;
grant execute on function public.operations_claim_action(uuid,text,int) to service_role;
