begin;

alter table public.user_actions drop constraint if exists user_actions_plan_tier_check;
alter table public.user_actions add constraint user_actions_plan_tier_check
  check (plan_tier in ('free', 'unpaid', 'spark', 'pulse', 'nova', 'zenith', 'singularity'));

update public.user_actions
set plan_tier = 'free', total_actions = 50,
    used_actions = least(coalesce(used_actions, 0), 50), concurrency_limit = 1,
    updated_at = now()
where plan_tier = 'unpaid'
  and not exists (
    select 1 from public.xroga_billing_cycles c
    where c.user_id = user_actions.user_id and c.cycle_kind = 'promotion'
      and c.status = 'active' and c.ends_at > now()
  );

alter table public.xroga_billing_cycles drop constraint if exists xroga_billing_cycles_cycle_kind_check;
alter table public.xroga_billing_cycles add constraint xroga_billing_cycles_cycle_kind_check
  check (cycle_kind in ('free', 'promotion', 'paid'));

create table if not exists public.whop_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  whop_membership_id text not null unique,
  whop_member_id text,
  whop_payment_id text,
  whop_checkout_configuration_id text,
  whop_plan_id text not null,
  whop_account_id text not null,
  billing_provider text not null default 'whop' check (billing_provider = 'whop'),
  status text not null,
  renewal_period_start timestamptz,
  renewal_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  manage_url text,
  recovery_url text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whop_memberships_user_synced_idx
  on public.whop_memberships (user_id, last_synced_at desc);

create table if not exists public.whop_payment_fulfillments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  whop_payment_id text not null unique,
  webhook_id text not null,
  provider_reference text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  fulfilled_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (ends_at <= starts_at + interval '31 days')
);

alter table public.whop_memberships enable row level security;
alter table public.whop_payment_fulfillments enable row level security;
revoke all on public.whop_memberships, public.whop_payment_fulfillments from public, anon, authenticated;
grant all on public.whop_memberships, public.whop_payment_fulfillments to service_role;

create or replace function public.ensure_xroga_free_cycle(p_user_id uuid)
returns public.xroga_billing_cycles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_cycle public.xroga_billing_cycles;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 45));
  select * into v_cycle from public.xroga_billing_cycles
    where user_id = p_user_id and status = 'active' and ends_at > v_now
    order by created_at desc limit 1;
  if found then return v_cycle; end if;

  update public.xroga_billing_cycles set status = 'expired', updated_at = v_now
    where user_id = p_user_id and status = 'active' and ends_at <= v_now;
  update public.user_actions
    set plan_tier = 'free', total_actions = 50, used_actions = least(used_actions, 50),
        concurrency_limit = 1, reset_date = v_now + interval '30 days', updated_at = v_now
    where user_id = p_user_id and plan_tier = 'spark';
  perform public.set_user_ai_plan_budget(p_user_id, 'free', 1.65);

  insert into public.xroga_billing_cycles (
    user_id, cycle_kind, status, starts_at, ends_at, entitlement_micro_usd, pacing
  ) values (p_user_id, 'free', 'active', v_now, v_now + interval '30 days', 1650000, 'balanced_month')
  returning * into v_cycle;
  return v_cycle;
end;
$$;

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
  v_reference text := 'whop:payment:' || trim(p_payment_id);
begin
  if p_plan_id <> 'plan_hlV1A10I5QfSP' or p_account_id <> 'biz_qhYONL4RebGX96' then
    raise exception 'whop_contract_mismatch';
  end if;
  if nullif(trim(p_payment_id), '') is null or nullif(trim(p_webhook_id), '') is null then
    raise exception 'payment_evidence_required';
  end if;
  if p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '31 days' then
    raise exception 'invalid_paid_cycle_period';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 46));
  insert into public.whop_payment_fulfillments (
    user_id, whop_payment_id, webhook_id, provider_reference, starts_at, ends_at
  ) values (p_user_id, trim(p_payment_id), trim(p_webhook_id), v_reference, p_starts_at, p_ends_at)
  on conflict (whop_payment_id) do nothing returning id into v_inserted;
  if v_inserted is null then return false; end if;

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
      last_synced_at = now(), updated_at = now();
  end if;
  return true;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, username, display_name, role)
  values (
    new.id,
    'xroga_' || replace(left(new.id::text, 12), '-', ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), 'Xroga Builder'),
    'member'
  ) on conflict (id) do nothing;
  insert into public.user_actions (user_id, plan_tier, total_actions, used_actions, concurrency_limit)
  values (new.id, 'free', 50, 0, 1) on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.ensure_xroga_free_cycle(uuid) from public, anon, authenticated;
revoke all on function public.fulfill_whop_payment(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,text) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.ensure_xroga_free_cycle(uuid) to service_role;
grant execute on function public.fulfill_whop_payment(uuid,text,text,text,text,text,text,text,timestamptz,timestamptz,text) to service_role;

notify pgrst, 'reload schema';
commit;
