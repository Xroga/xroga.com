-- Extend the existing approval claim. This records dispatch admission, never
-- proof that an external effect completed. No transaction spans a provider call.
alter table public.business_action_confirmations
  add column if not exists effect_started_at timestamptz;

create or replace function public.authorize_business_action_dispatch(p_owner uuid,p_expected jsonb)
returns setof public.business_action_confirmations
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.business_action_confirmations%rowtype;
  confirmation public.business_action_confirmations%rowtype;
  policy public.user_integrations%rowtype;
  selected_mode text;
  specific text;
begin
  if p_owner is null or jsonb_typeof(p_expected) is distinct from 'object' then return;end if;
  expected:=jsonb_populate_record(null::public.business_action_confirmations,p_expected);
  if expected.user_id is distinct from p_owner or expected.status is distinct from 'executing'
    or expected.claimed_at is null or expected.effect_started_at is not null then return;end if;
  select * into confirmation from public.business_action_confirmations
    where id=expected.id and user_id=p_owner for update;
  if not found or confirmation is distinct from expected then return;end if;
  if confirmation.plan->'authority'->>'userId' is distinct from p_owner::text
    or confirmation.plan->'authority'->>'tenantId' is distinct from p_owner::text
    or confirmation.plan->>'planDigest' is distinct from confirmation.plan_digest
    or confirmation.plan->'requiresConfirmation' is distinct from 'true'::jsonb then return;end if;

  -- Same lookup semantics as pluginPermissionPolicy. Lock existing policy rows
  -- before the final expiry check. New policy after admission cannot undo an
  -- external effect that has already started.
  specific:='xroga_plugin_permission_policy__'||left(trim(both '_' from
    regexp_replace(lower(trim(confirmation.toolkit)),'[^a-z0-9_-]+','_','g')),90);
  for policy in select * from public.user_integrations where user_id=p_owner
    and provider in ('xroga_plugin_permission_policy',specific) order by provider for update
  loop
    if policy.provider=specific or selected_mode is null then
      selected_mode:=coalesce(policy.metadata->>'mode',policy.access_token,'always_ask');
    end if;
  end loop;
  if selected_mode='read_only' then return;end if;
  if confirmation.expires_at<=clock_timestamp() then return;end if;
  return query update public.business_action_confirmations set effect_started_at=clock_timestamp()
    where id=expected.id and user_id=p_owner returning *;
end;
$$;
revoke all on function public.authorize_business_action_dispatch(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.authorize_business_action_dispatch(uuid,jsonb) to service_role;

-- Cancellation linearizes against dispatch on the existing confirmation lock.
-- After dispatch admission, the outcome may be uncertain and cannot be replayed.
create or replace function public.cancel_business_action_confirmation(p_owner uuid,p_id uuid)
returns setof public.business_action_confirmations
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare confirmation public.business_action_confirmations%rowtype;
begin
  if p_owner is null or p_id is null then return;end if;
  select * into confirmation from public.business_action_confirmations
    where id=p_id and user_id=p_owner for update;
  if not found then return;end if;
  if confirmation.status in ('pending','executing') and confirmation.effect_started_at is null then
    return query update public.business_action_confirmations set status='cancelled',completed_at=clock_timestamp()
      where id=p_id and user_id=p_owner returning *;
  else return next confirmation;
  end if;
end;
$$;
revoke all on function public.cancel_business_action_confirmation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_business_action_confirmation(uuid,uuid) to service_role;
