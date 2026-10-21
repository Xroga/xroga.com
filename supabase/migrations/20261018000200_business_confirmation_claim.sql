-- Claim the exact reviewed plan after obtaining the row lock. A timestamp from
-- the API clock cannot authorize a request delayed past database expiry.
create or replace function public.claim_business_action_confirmation(
  p_owner uuid, p_id uuid, p_digest text, p_plan jsonb, p_expires timestamptz
) returns setof public.business_action_confirmations
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare confirmation public.business_action_confirmations%rowtype;
begin
  if p_owner is null or p_id is null or p_digest is null or p_expires is null
    or jsonb_typeof(p_plan) is distinct from 'object' then return; end if;
  select * into confirmation from public.business_action_confirmations
    where id=p_id and user_id=p_owner for update;
  if not found or confirmation.status<>'pending'
    or confirmation.expires_at<=clock_timestamp()
    or confirmation.expires_at is distinct from p_expires
    or confirmation.plan_digest is distinct from p_digest
    or confirmation.plan is distinct from p_plan
    or confirmation.plan->>'planDigest' is distinct from p_digest
    or confirmation.plan->'requiresConfirmation' is distinct from 'true'::jsonb
    or confirmation.summary is distinct from confirmation.plan->>'summary'
    or confirmation.toolkit is distinct from confirmation.plan->>'toolkit'
    or confirmation.risk is distinct from confirmation.plan->>'risk' then return; end if;
  return query update public.business_action_confirmations
    set status='executing',claimed_at=clock_timestamp()
    where id=p_id and user_id=p_owner returning *;
end;
$$;
revoke all on function public.claim_business_action_confirmation(uuid,uuid,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.claim_business_action_confirmation(uuid,uuid,text,jsonb,timestamptz) to service_role;
