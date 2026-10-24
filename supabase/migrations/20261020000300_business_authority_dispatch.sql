-- Extend the existing approval claim. This records dispatch admission, never
-- proof that an external effect completed. No transaction spans a provider call.
alter table public.business_action_confirmations
  add column if not exists effect_started_at timestamptz,
  add column if not exists effect_receipt jsonb;

-- Serialize policy INSERT as well as UPDATE/DELETE. A row lock cannot protect
-- the absence of a toolkit/global preference. The decision holds this owner
-- mutex until admission commits, and reads policy with MVCC, not row locks.
create or replace function public.serialize_business_action_policy()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare before_owner uuid;after_owner uuid;policy_owner uuid;
begin
  if tg_op in ('UPDATE','DELETE') then
    if old.provider ~ '^xroga_plugin_permission_policy(__[a-z0-9_-]{1,90})?$' then before_owner:=old.user_id;end if;
  end if;
  if tg_op in ('INSERT','UPDATE') then
    if new.provider ~ '^xroga_plugin_permission_policy(__[a-z0-9_-]{1,90})?$' then after_owner:=new.user_id;end if;
  end if;
  for policy_owner in select distinct owner_id from unnest(array[before_owner,after_owner]) as owners(owner_id)
    where owner_id is not null order by owner_id
  loop
    perform pg_advisory_xact_lock(hashtextextended('xroga-business-policy:'||policy_owner::text,0));
  end loop;
  if tg_op='DELETE' then return old;else return new;end if;
end;
$$;
revoke all on function public.serialize_business_action_policy() from public,anon,authenticated;
grant execute on function public.serialize_business_action_policy() to service_role;
drop trigger if exists serialize_business_action_policy on public.user_integrations;
create trigger serialize_business_action_policy before insert or update or delete on public.user_integrations
  for each row execute function public.serialize_business_action_policy();

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
  perform pg_advisory_xact_lock(hashtextextended('xroga-business-policy:'||p_owner::text,0));
  select * into confirmation from public.business_action_confirmations
    where id=expected.id and user_id=p_owner for update;
  if not found or confirmation is distinct from expected then return;end if;
  if confirmation.plan->'authority'->>'userId' is distinct from p_owner::text
    or confirmation.plan->'authority'->>'tenantId' is distinct from p_owner::text
    or confirmation.plan->>'planDigest' is distinct from confirmation.plan_digest
    or confirmation.plan->'requiresConfirmation' is distinct from 'true'::jsonb then return;end if;

  -- Same lookup semantics as pluginPermissionPolicy. The shared owner mutex
  -- protects existing and absent rows without a policy-row/mutex lock cycle.
  specific:='xroga_plugin_permission_policy__'||left(trim(both '_' from
    regexp_replace(lower(trim(confirmation.toolkit)),'[^a-z0-9_-]+','_','g')),90);
  for policy in select * from public.user_integrations where user_id=p_owner
    and provider in ('xroga_plugin_permission_policy',specific) order by provider
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

-- Keep the established terminal RPC and its original immutable claim contract.
-- New scoped grants additionally persist a minimal, non-secret effect receipt.
create or replace function public.finish_business_action_confirmation(
  p_owner uuid,p_expected jsonb,p_status text,p_failure_code text
) returns setof public.business_action_confirmations
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.business_action_confirmations%rowtype;
  confirmation public.business_action_confirmations%rowtype;
  receipt jsonb;
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
  select * into confirmation from public.business_action_confirmations where id=expected.id and user_id=p_owner for update;
  if not found or row(confirmation.plan,confirmation.plan_digest,confirmation.summary,confirmation.toolkit,confirmation.risk,
    confirmation.created_at,confirmation.expires_at,confirmation.claimed_at)
    is distinct from row(expected.plan,expected.plan_digest,expected.summary,expected.toolkit,expected.risk,
      expected.created_at,expected.expires_at,expected.claimed_at) then
    raise exception 'confirmation claim changed' using errcode='40001';
  end if;
  if confirmation.plan ? 'authority' then
    receipt:=expected.effect_receipt;
    if jsonb_typeof(receipt) is distinct from 'object' or length(receipt::text)>4000
      or (receipt - array['version','grantId','planDigest','provider','account','operation','resultDigest'])<>'{}'::jsonb
      or receipt->'version' is distinct from '1'::jsonb
      or receipt->>'grantId' is distinct from confirmation.id::text
      or receipt->>'planDigest' is distinct from confirmation.plan_digest
      or receipt->>'provider' is distinct from confirmation.toolkit
      or receipt->>'account' is distinct from confirmation.plan->'authority'->>'connectedAccountId'
      or receipt->>'operation' is distinct from confirmation.plan->>'toolSlug'
      or (p_status='consumed' and (confirmation.effect_started_at is null or coalesce(receipt->>'resultDigest','') !~ '^[a-f0-9]{64}$'))
      or (p_status='failed' and receipt ? 'resultDigest') then
      raise exception 'invalid authority receipt' using errcode='22023';
    end if;
    if confirmation.status=p_status and confirmation.failure_code is not distinct from p_failure_code
      and confirmation.completed_at is not null and (confirmation.effect_receipt-array['outcome','recordedAt'])=receipt then
      return next confirmation;return;
    end if;
    receipt:=receipt||jsonb_build_object('outcome',case when p_status='consumed' then 'provider_reported_success'
      when confirmation.effect_started_at is not null then 'dispatch_uncertain' else 'not_dispatched' end,'recordedAt',clock_timestamp());
  else
    if expected.effect_receipt is not null then raise exception 'unexpected legacy receipt' using errcode='22023';end if;
    if confirmation.status=p_status and confirmation.failure_code is not distinct from p_failure_code and confirmation.completed_at is not null then
      return next confirmation;return;
    end if;
  end if;
  if confirmation.status<>'executing' then raise exception 'confirmation already finalized' using errcode='40001';end if;
  return query update public.business_action_confirmations set status=p_status,completed_at=clock_timestamp(),failure_code=p_failure_code,effect_receipt=receipt
    where id=expected.id and user_id=p_owner returning *;
end;
$$;
revoke all on function public.finish_business_action_confirmation(uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.finish_business_action_confirmation(uuid,jsonb,text,text) to service_role;
