-- Bind paid Operations provider calls to the already admitted action and its approved ceiling.
alter table public.xroga_provider_reservations
  add column if not exists authority_action_id uuid references public.operations_actions(id) on delete restrict,
  add column if not exists authority_ceiling_micro_usd bigint
    check (authority_ceiling_micro_usd is null or authority_ceiling_micro_usd > 0);

create index if not exists xroga_provider_reservations_authority_idx
  on public.xroga_provider_reservations(authority_action_id,status);

create or replace function public.reserve_operations_provider_budget(
  p_actor uuid,p_expected jsonb,p_idempotency_key uuid,p_internal_route text,p_price_version text,
  p_estimated_input_tokens bigint,p_maximum_output_tokens bigint,p_reservation_micro_usd bigint
) returns public.xroga_provider_reservations
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.operations_actions%rowtype; current_action public.operations_actions%rowtype;
  approval public.operations_action_approvals%rowtype; existing public.xroga_provider_reservations%rowtype;
  reservation public.xroga_provider_reservations%rowtype; actor_role text; approver_role text;
  ceiling_micro_usd bigint; already_committed bigint;
begin
  if p_actor is null or p_idempotency_key is null or jsonb_typeof(p_expected) is distinct from 'object'
    or p_reservation_micro_usd<=0 or p_estimated_input_tokens<0 or p_maximum_output_tokens<0 then
    raise exception 'invalid operations reservation' using errcode='22023';
  end if;
  expected:=jsonb_populate_record(null::public.operations_actions,p_expected);
  select * into current_action from public.operations_actions where id=expected.id for update;
  if not found or current_action is distinct from expected or current_action.action_type<>'run_model_benchmark'
    or current_action.status<>'running' or current_action.lease_owner is distinct from 'api:'||p_actor::text
    or current_action.lease_expires_at<=clock_timestamp() or current_action.requested_by is distinct from p_actor then
    raise exception 'operations authority changed' using errcode='40001';
  end if;

  select role into actor_role from public.profiles where id=p_actor for share;
  if actor_role is distinct from 'admin' then
    select role into actor_role from public.operations_memberships
      where project_id=current_action.project_id and user_id=current_action.user_id and member_user_id=p_actor for share;
  end if;
  if actor_role is null or actor_role not in ('release_manager','admin') then raise exception 'operation is not permitted' using errcode='42501'; end if;

  select * into approval from public.operations_action_approvals
    where action_id=current_action.id and user_id=current_action.user_id and required_role='release_manager' for share;
  if not found or approval.decision<>'approved' or approval.approver_id is null
    or approval.approver_id=current_action.requested_by or approval.requester_id is distinct from current_action.requested_by
    or approval.target_version is distinct from current_action.target_version
    or approval.action_plan_digest is distinct from current_action.action_plan_digest
    or approval.expires_at<=clock_timestamp() then
    raise exception 'operations approval changed' using errcode='40001';
  end if;
  select role into approver_role from public.profiles where id=approval.approver_id for share;
  if approver_role is distinct from 'admin' then
    select role into approver_role from public.operations_memberships
      where project_id=current_action.project_id and user_id=current_action.user_id and member_user_id=approval.approver_id for share;
  end if;
  if approver_role is null or approver_role not in ('release_manager','admin') then raise exception 'approver authority changed' using errcode='42501'; end if;

  if jsonb_typeof(current_action.execution_plan->'maximumCostUsd')<>'number' then
    raise exception 'approved spend ceiling missing' using errcode='22023';
  end if;
  ceiling_micro_usd:=round((current_action.execution_plan->>'maximumCostUsd')::numeric*1000000)::bigint;
  if ceiling_micro_usd<=0 or ceiling_micro_usd>2000000 then raise exception 'approved spend ceiling invalid' using errcode='22023'; end if;

  select * into existing from public.xroga_provider_reservations
    where user_id=current_action.user_id and idempotency_key=p_idempotency_key;
  if found then
    if existing.authority_action_id is distinct from current_action.id
      or existing.authority_ceiling_micro_usd is distinct from ceiling_micro_usd
      or existing.internal_route is distinct from p_internal_route or existing.price_version is distinct from p_price_version
      or existing.estimated_input_tokens is distinct from p_estimated_input_tokens
      or existing.maximum_output_tokens is distinct from p_maximum_output_tokens
      or existing.reserved_micro_usd is distinct from p_reservation_micro_usd or existing.status<>'reserved' then
      raise exception 'reservation replay changed' using errcode='40001';
    end if;
    return existing;
  end if;

  select coalesce(sum(reserved_micro_usd),0) into already_committed
    from public.xroga_provider_reservations
    where authority_action_id=current_action.id and status in ('reserved','pending_reconciliation','settled');
  if already_committed+p_reservation_micro_usd>ceiling_micro_usd then
    raise exception 'approved operations spend exceeded' using errcode='P0001';
  end if;

  reservation:=public.reserve_xroga_provider_budget(current_action.user_id,p_idempotency_key,'completion',
    p_internal_route,p_price_version,p_estimated_input_tokens,p_maximum_output_tokens,p_reservation_micro_usd,clock_timestamp());
  update public.xroga_provider_reservations set authority_action_id=current_action.id,
    authority_ceiling_micro_usd=ceiling_micro_usd where id=reservation.id returning * into reservation;
  return reservation;
end;
$$;
revoke all on function public.reserve_operations_provider_budget(uuid,jsonb,uuid,text,text,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.reserve_operations_provider_budget(uuid,jsonb,uuid,text,text,bigint,bigint,bigint) to service_role;
