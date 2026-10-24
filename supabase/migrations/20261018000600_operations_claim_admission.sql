-- Reuse the existing lease/retry implementation after locked current authority
-- and immutable intent checks. Canonical policy parameters come from the service,
-- not browser input. This does not certify provider effects after this transaction.
create or replace function public.claim_operations_action_admitted(
  p_actor uuid,p_expected jsonb,p_allowed_roles text[],p_approval_role text,
  p_confirmation_required boolean,p_lease_seconds int
) returns setof public.operations_actions
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.operations_actions%rowtype; action_row public.operations_actions%rowtype;
  approval public.operations_action_approvals%rowtype; owner_id uuid; actor_role text; approver_role text;
begin
  if p_actor is null or jsonb_typeof(p_expected) is distinct from 'object' or p_confirmation_required is null
    or p_allowed_roles is null or cardinality(p_allowed_roles)=0
    or not p_allowed_roles <@ array['viewer','operator','release_manager','recovery_manager','admin']::text[]
    or (p_approval_role is not null and p_approval_role not in ('release_manager','recovery_manager')) then
    raise exception 'invalid claim request' using errcode='22023';
  end if;
  expected:=jsonb_populate_record(null::public.operations_actions,p_expected);
  select role into actor_role from public.profiles where id=p_actor for share;
  select user_id into owner_id from public.projects where id=expected.project_id for share;
  if not found or owner_id is distinct from expected.user_id then
    raise exception 'action is not permitted' using errcode='42501';
  end if;
  if actor_role is distinct from 'admin' then
    if p_actor=owner_id then actor_role:='operator';
    else select role into actor_role from public.operations_memberships
      where project_id=expected.project_id and user_id=owner_id and member_user_id=p_actor for share;
    end if;
  end if;
  if actor_role is null or not actor_role=any(p_allowed_roles) then
    raise exception 'action is not permitted' using errcode='42501';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended(expected.id::text,0)) then return; end if;
  select * into action_row from public.operations_actions where id=expected.id for update;
  if not found or row(action_row.user_id,action_row.project_id,action_row.environment_id,action_row.requested_by,
    action_row.action_type,action_row.target_type,action_row.target_id,action_row.target_version,
    action_row.action_plan_digest,action_row.confirmation_digest,action_row.execution_plan,action_row.idempotency_key,
    action_row.permission_required,action_row.risk_level,action_row.max_attempts,action_row.attempt_count,
    action_row.status,action_row.lease_owner,action_row.lease_expires_at)
  is distinct from row(expected.user_id,expected.project_id,expected.environment_id,expected.requested_by,
    expected.action_type,expected.target_type,expected.target_id,expected.target_version,
    expected.action_plan_digest,expected.confirmation_digest,expected.execution_plan,expected.idempotency_key,
    expected.permission_required,expected.risk_level,expected.max_attempts,expected.attempt_count,
    expected.status,expected.lease_owner,expected.lease_expires_at)
    or (p_confirmation_required and action_row.confirmation_digest is distinct from action_row.action_plan_digest) then
    raise exception 'claim action changed' using errcode='40001';
  end if;
  if p_approval_role is not null then
    select * into approval from public.operations_action_approvals
      where action_id=action_row.id and user_id=owner_id and required_role=p_approval_role for share;
    if not found or approval.decision<>'approved' or approval.approver_id is null
      or approval.approver_id=action_row.requested_by or approval.requester_id is distinct from action_row.requested_by
      or approval.target_version is distinct from action_row.target_version
      or approval.action_plan_digest is distinct from action_row.action_plan_digest then
      raise exception 'claim approval changed' using errcode='40001';
    end if;
    select role into approver_role from public.profiles where id=approval.approver_id for share;
    if approver_role is distinct from 'admin' then
      if approval.approver_id=owner_id then approver_role:='operator';
      else select role into approver_role from public.operations_memberships
        where project_id=action_row.project_id and user_id=owner_id and member_user_id=approval.approver_id for share;
      end if;
    end if;
    if approver_role is null or approver_role not in (p_approval_role,'admin') then
      raise exception 'approver authority is no longer valid' using errcode='42501';
    end if;
    if approval.expires_at<=clock_timestamp() then
      raise exception 'claim approval expired' using errcode='40001';
    end if;
  end if;
  return query select * from public.operations_claim_action(action_row.id,'api:'||p_actor::text,p_lease_seconds);
end;
$$;
revoke all on function public.claim_operations_action_admitted(uuid,jsonb,text[],text,boolean,int) from public,anon,authenticated;
grant execute on function public.claim_operations_action_admitted(uuid,jsonb,text[],text,boolean,int) to service_role;
