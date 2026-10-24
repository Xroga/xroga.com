begin;

-- Command007, frozen B1-P2-392b9b628a9b92be: a reservation's owner
-- must also own its CURRENT billing-cycle parent. Preserve existing accounting
-- and RPC contracts. No row rewrite, deletion, FK or NOT NULL tightening.
-- Rollback: restore these three definitions from20260728010000, only after
-- reviewing the lost parent fence. Do not delete or silently repair old rows.
create or replace function public.reserve_xroga_provider_budget(
  p_user_id uuid, p_idempotency_key uuid, p_purpose text, p_internal_route text,
  p_price_version text, p_estimated_input_tokens bigint, p_maximum_output_tokens bigint,
  p_reservation_micro_usd bigint, p_now timestamptz default now()
)
returns public.xroga_provider_reservations
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cycle public.xroga_billing_cycles;
  v_existing public.xroga_provider_reservations;
  v_unlocked bigint;
  v_reservation public.xroga_provider_reservations;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  if p_purpose not in ('daily_work','complexity','completion') then raise exception 'invalid_budget_purpose'; end if;
  if p_reservation_micro_usd <= 0 then raise exception 'invalid_reservation_amount'; end if;

  -- Reuse the canonical free-cycle mutex. Consistent owner-first admission
  -- avoids an inverse row/cycle lock order during concurrent reserve/settle.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,45));

  select * into v_existing from public.xroga_provider_reservations
    where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if found then
    perform 1 from public.xroga_billing_cycles where id=v_existing.cycle_id and user_id=p_user_id for update;
    if not found then raise exception 'provider_cycle_owner_mismatch' using errcode='42501'; end if;
    return v_existing;
  end if;

  select * into v_cycle from public.xroga_billing_cycles
    where user_id=p_user_id and status='active' for update;
  if not found then raise exception 'active_billing_cycle_required'; end if;
  if p_now >= v_cycle.ends_at then raise exception 'billing_cycle_expired'; end if;
  select * into v_existing from public.xroga_provider_reservations
    where user_id=p_user_id and idempotency_key=p_idempotency_key for update;
  if found then
    perform 1 from public.xroga_billing_cycles where id=v_existing.cycle_id and user_id=p_user_id for update;
    if not found then raise exception 'provider_cycle_owner_mismatch' using errcode='42501'; end if;
    return v_existing;
  end if;
  v_unlocked:=public.xroga_unlocked_entitlement_micro_usd(v_cycle,p_purpose,p_now);
  if v_cycle.settled_micro_usd+v_cycle.reserved_micro_usd+v_cycle.accounting_safety_hold_micro_usd+p_reservation_micro_usd > v_unlocked then
    raise exception 'currently_unlocked_entitlement_exceeded';
  end if;
  update public.xroga_billing_cycles set reserved_micro_usd=reserved_micro_usd+p_reservation_micro_usd,updated_at=now()
    where id=v_cycle.id and user_id=p_user_id;
  insert into public.xroga_provider_reservations(
    cycle_id,user_id,idempotency_key,purpose,internal_route,price_version,
    estimated_input_tokens,maximum_output_tokens,reserved_micro_usd,status
  ) values(v_cycle.id,p_user_id,p_idempotency_key,p_purpose,p_internal_route,p_price_version,
    greatest(0,p_estimated_input_tokens),greatest(0,p_maximum_output_tokens),p_reservation_micro_usd,'reserved')
    returning * into v_reservation;
  return v_reservation;
end;
$$;

create or replace function public.settle_xroga_provider_budget(
  p_user_id uuid,p_reservation_id uuid,p_actual_micro_usd bigint,p_provider_request_id text,
  p_actual_input_tokens bigint,p_cached_input_tokens bigint,p_output_tokens bigint,
  p_reasoning_tokens bigint default 0,p_tool_calls integer default 0,p_search_calls integer default 0
)
returns public.xroga_provider_reservations
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_reservation public.xroga_provider_reservations;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,45));
  select * into v_reservation from public.xroga_provider_reservations
    where id=p_reservation_id and user_id=p_user_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  -- The lock checks the owner again after any competing transfer commits.
  -- Check before terminal replay too, not only before balance updates.
  perform 1 from public.xroga_billing_cycles where id=v_reservation.cycle_id and user_id=p_user_id for update;
  if not found then raise exception 'provider_cycle_owner_mismatch' using errcode='42501'; end if;
  if v_reservation.status='settled' then return v_reservation; end if;
  if v_reservation.status='released' then raise exception 'reservation_already_released'; end if;
  if p_actual_micro_usd < 0 or p_actual_micro_usd > v_reservation.reserved_micro_usd then raise exception 'actual_cost_exceeds_reservation'; end if;
  update public.xroga_billing_cycles set reserved_micro_usd=reserved_micro_usd-v_reservation.reserved_micro_usd,
    settled_micro_usd=settled_micro_usd+p_actual_micro_usd,updated_at=now()
    where id=v_reservation.cycle_id and user_id=p_user_id;
  update public.xroga_provider_reservations set status='settled',settled_micro_usd=p_actual_micro_usd,
    provider_request_id=nullif(trim(p_provider_request_id),''),actual_input_tokens=greatest(0,p_actual_input_tokens),
    cached_input_tokens=greatest(0,p_cached_input_tokens),output_tokens=greatest(0,p_output_tokens),
    reasoning_tokens=greatest(0,p_reasoning_tokens),tool_calls=greatest(0,p_tool_calls),search_calls=greatest(0,p_search_calls),
    settled_at=now(),updated_at=now() where id=v_reservation.id and user_id=p_user_id returning * into v_reservation;
  return v_reservation;
end;
$$;

create or replace function public.release_xroga_provider_budget(
  p_user_id uuid,p_reservation_id uuid,p_error_category text default null,p_pending_reconciliation boolean default false
)
returns public.xroga_provider_reservations
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_reservation public.xroga_provider_reservations;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,45));
  select * into v_reservation from public.xroga_provider_reservations
    where id=p_reservation_id and user_id=p_user_id for update;
  if not found then raise exception 'reservation_not_found'; end if;
  perform 1 from public.xroga_billing_cycles where id=v_reservation.cycle_id and user_id=p_user_id for update;
  if not found then raise exception 'provider_cycle_owner_mismatch' using errcode='42501'; end if;
  if v_reservation.status in ('settled','released') then return v_reservation; end if;
  if p_pending_reconciliation then
    update public.xroga_provider_reservations set status='pending_reconciliation',error_category=p_error_category,updated_at=now()
      where id=v_reservation.id and user_id=p_user_id returning * into v_reservation;
    return v_reservation;
  end if;
  update public.xroga_billing_cycles set reserved_micro_usd=reserved_micro_usd-v_reservation.reserved_micro_usd,updated_at=now()
    where id=v_reservation.cycle_id and user_id=p_user_id;
  update public.xroga_provider_reservations set status='released',error_category=p_error_category,updated_at=now()
    where id=v_reservation.id and user_id=p_user_id returning * into v_reservation;
  return v_reservation;
end;
$$;

revoke all on function public.reserve_xroga_provider_budget(uuid,uuid,text,text,text,bigint,bigint,bigint,timestamptz) from public,anon,authenticated;
revoke all on function public.settle_xroga_provider_budget(uuid,uuid,bigint,text,bigint,bigint,bigint,bigint,integer,integer) from public,anon,authenticated;
revoke all on function public.release_xroga_provider_budget(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.reserve_xroga_provider_budget(uuid,uuid,text,text,text,bigint,bigint,bigint,timestamptz) to service_role;
grant execute on function public.settle_xroga_provider_budget(uuid,uuid,bigint,text,bigint,bigint,bigint,bigint,integer,integer) to service_role;
grant execute on function public.release_xroga_provider_budget(uuid,uuid,text,boolean) to service_role;
notify pgrst,'reload schema';
commit;
