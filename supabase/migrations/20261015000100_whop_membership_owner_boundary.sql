begin;

-- Compatible replacement of the existing service-only fulfillment transaction.
-- An ID collision with another owner must roll back ALL entitlements, including
-- earlier statements in this function. Existing prices and allowances are unchanged.
create or replace function public.fulfill_whop_payment(
  p_user_id uuid,
  p_webhook_id text,
  p_payment_id text,
  p_membership_id text,
  p_member_id text,
  p_checkout_configuration_id text,
  p_plan_id text,
  p_account_id text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_manage_url text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted uuid;
  v_existing_owner uuid;
  v_membership_owner uuid;
  v_reference text := 'whop:payment:' || trim(p_payment_id);
begin
  if p_plan_id is distinct from 'plan_hlV1A10I5QfSP'
     or p_account_id is distinct from 'biz_qhYONL4RebGX96' then
    raise exception 'whop_contract_mismatch';
  end if;
  if p_user_id is null or nullif(trim(p_payment_id), '') is null
     or nullif(trim(p_webhook_id), '') is null then
    raise exception 'payment_evidence_required';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
     or p_ends_at > p_starts_at + interval '31 days' then
    raise exception 'invalid_paid_cycle_period';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 46));
  insert into public.whop_payment_fulfillments (
    user_id, whop_payment_id, webhook_id, provider_reference, starts_at, ends_at
  ) values (p_user_id, trim(p_payment_id), trim(p_webhook_id), v_reference, p_starts_at, p_ends_at)
  on conflict (whop_payment_id) do nothing returning id into v_inserted;
  if v_inserted is null then
    select user_id into v_existing_owner from public.whop_payment_fulfillments
      where whop_payment_id = trim(p_payment_id);
    if v_existing_owner is distinct from p_user_id then
      raise exception 'payment_owner_mismatch';
    end if;
    return false;
  end if;

  update public.xroga_billing_cycles set status = 'expired', updated_at = now()
    where user_id = p_user_id and status = 'active';
  insert into public.xroga_billing_cycles (
    user_id, cycle_kind, provider_reference, status, starts_at, ends_at,
    entitlement_micro_usd, pacing
  ) values (p_user_id, 'paid', v_reference, 'active', p_starts_at, p_ends_at, 16500000, 'balanced_month');

  insert into public.user_actions (user_id, plan_tier, total_actions, used_actions, concurrency_limit, reset_date)
  values (p_user_id, 'spark', 1500, 0, 2, p_ends_at)
  on conflict (user_id) do update set
    plan_tier = 'spark', total_actions = 1500, used_actions = 0,
    concurrency_limit = 2, reset_date = p_ends_at, updated_at = now();
  insert into public.action_transactions (user_id, task_type, actions_cost, description)
  values (p_user_id, 'chat', 0, 'Xroga Pro paid cycle activated through Whop');
  perform public.set_user_ai_plan_budget(p_user_id, 'spark', 16.5);

  if nullif(trim(coalesce(p_membership_id, '')), '') is not null then
    insert into public.whop_memberships (
      user_id, whop_membership_id, whop_member_id, whop_payment_id,
      whop_checkout_configuration_id, whop_plan_id, whop_account_id,
      status, renewal_period_start, renewal_period_end, manage_url, last_synced_at, updated_at
    ) values (
      p_user_id, trim(p_membership_id), nullif(trim(coalesce(p_member_id, '')), ''), trim(p_payment_id),
      nullif(trim(coalesce(p_checkout_configuration_id, '')), ''), p_plan_id, p_account_id,
      'active', p_starts_at, p_ends_at, nullif(trim(coalesce(p_manage_url, '')), ''), now(), now()
    ) on conflict (whop_membership_id) do update set
      whop_payment_id = excluded.whop_payment_id,
      whop_checkout_configuration_id = coalesce(excluded.whop_checkout_configuration_id, whop_memberships.whop_checkout_configuration_id),
      status = 'active', renewal_period_start = excluded.renewal_period_start,
      renewal_period_end = excluded.renewal_period_end,
      manage_url = coalesce(excluded.manage_url, whop_memberships.manage_url),
      last_synced_at = now(), updated_at = now()
    where whop_memberships.user_id = excluded.user_id
    returning user_id into v_membership_owner;
    if not found or v_membership_owner is distinct from p_user_id then
      raise exception 'membership_owner_mismatch';
    end if;
  end if;
  return true;
end;
$$;

revoke all on function public.fulfill_whop_payment(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,text) from public, anon, authenticated;
grant execute on function public.fulfill_whop_payment(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,text) to service_role;
notify pgrst, 'reload schema';
commit;
