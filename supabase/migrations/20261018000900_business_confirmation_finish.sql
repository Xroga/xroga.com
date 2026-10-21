-- Record the outcome of the exact executing claim. Finishing never executes a
-- provider, renews expiry, or permits a consumed/failed confirmation to retry.
create or replace function public.finish_business_action_confirmation(
  p_owner uuid,p_expected jsonb,p_status text,p_failure_code text
) returns setof public.business_action_confirmations
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.business_action_confirmations%rowtype;
  confirmation public.business_action_confirmations%rowtype;
begin
  if p_owner is null or jsonb_typeof(p_expected) is distinct from 'object'
    or p_status is null or p_status not in ('consumed','failed')
    or (p_status='consumed' and p_failure_code is not null)
    or (p_status='failed' and (p_failure_code is null or p_failure_code !~ '^[A-Za-z0-9_.:-]{1,120}$')) then
    raise exception 'invalid confirmation outcome' using errcode='22023';
  end if;
  expected:=jsonb_populate_record(null::public.business_action_confirmations,p_expected);
  if expected.user_id is distinct from p_owner or expected.status is distinct from 'executing' or expected.claimed_at is null then
    raise exception 'invalid confirmation claim' using errcode='22023';
  end if;
  select * into confirmation from public.business_action_confirmations
    where id=expected.id and user_id=p_owner for update;
  if not found or row(confirmation.plan,confirmation.plan_digest,confirmation.summary,confirmation.toolkit,confirmation.risk,
    confirmation.created_at,confirmation.expires_at,confirmation.claimed_at)
    is distinct from row(expected.plan,expected.plan_digest,expected.summary,expected.toolkit,expected.risk,
      expected.created_at,expected.expires_at,expected.claimed_at) then
    raise exception 'confirmation claim changed' using errcode='40001';
  end if;
  if confirmation.status=p_status and confirmation.failure_code is not distinct from p_failure_code
    and confirmation.completed_at is not null then return next confirmation;return; end if;
  if confirmation.status<>'executing' then raise exception 'confirmation already finalized' using errcode='40001'; end if;
  return query update public.business_action_confirmations set status=p_status,completed_at=clock_timestamp(),failure_code=p_failure_code
    where id=expected.id and user_id=p_owner returning *;
end;
$$;
revoke all on function public.finish_business_action_confirmation(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.finish_business_action_confirmation(uuid,jsonb,text,text) to service_role;
