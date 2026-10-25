-- The existing service supplies the canonical action definition's approval role.
-- Current persisted actor/project/membership and plan are rechecked under locks.
create or replace function public.decide_operations_action_approval(
  p_actor uuid, p_expected jsonb, p_required_role text, p_decision text, p_reason text
) returns setof public.operations_actions
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.operations_actions%rowtype; action_row public.operations_actions%rowtype;
  approval public.operations_action_approvals%rowtype; owner_id uuid; actor_role text; membership_role text;
  decided_time timestamptz; next_status text;
begin
  if p_actor is null or jsonb_typeof(p_expected) is distinct from 'object'
    or p_required_role is null or p_required_role not in ('release_manager','recovery_manager')
    or p_decision is null or p_decision not in ('approved','rejected')
    or p_reason is null or length(p_reason) not between 3 and 500 then
    raise exception 'invalid approval request' using errcode='22023';
  end if;
  expected:=jsonb_populate_record(null::public.operations_actions,p_expected);
  select role into actor_role from public.profiles where id=p_actor for share;
  select user_id into owner_id from public.projects where id=expected.project_id for share;
  if not found or owner_id is distinct from expected.user_id or p_actor=expected.requested_by then
    raise exception 'approval is not permitted' using errcode='42501';
  end if;
  if actor_role is distinct from 'admin' then
    -- Project owners retain the existing operator role, which cannot grant
    -- release/recovery approval. Membership is considered only for non-owners.
    if p_actor=owner_id then raise exception 'approval is not permitted' using errcode='42501'; end if;
    select role into membership_role from public.operations_memberships
      where project_id=expected.project_id and user_id=owner_id and member_user_id=p_actor for share;
    if not found or membership_role not in (p_required_role,'admin') then
      raise exception 'approval is not permitted' using errcode='42501';
    end if;
  end if;
  select * into action_row from public.operations_actions where id=expected.id for update;
  if not found or action_row.status<>'approval_required' or expected.status is distinct from 'approval_required'
    or row(action_row.user_id,action_row.project_id,action_row.environment_id,action_row.requested_by,
      action_row.action_type,action_row.target_type,action_row.target_id,action_row.target_version,
      action_row.action_plan_digest,action_row.confirmation_digest,action_row.execution_plan,action_row.idempotency_key)
    is distinct from row(expected.user_id,expected.project_id,expected.environment_id,expected.requested_by,
      expected.action_type,expected.target_type,expected.target_id,expected.target_version,
      expected.action_plan_digest,expected.confirmation_digest,expected.execution_plan,expected.idempotency_key)
    or action_row.confirmation_digest is distinct from action_row.action_plan_digest then
    raise exception 'approval action changed' using errcode='40001';
  end if;
  select * into approval from public.operations_action_approvals
    where action_id=action_row.id and user_id=owner_id and required_role=p_required_role for update;
  if not found or approval.decision<>'pending' or approval.requester_id is distinct from action_row.requested_by
    or approval.target_version is distinct from action_row.target_version
    or approval.action_plan_digest is distinct from action_row.action_plan_digest then
    raise exception 'approval request changed' using errcode='40001';
  end if;
  if approval.expires_at<=clock_timestamp() then raise exception 'approval expired' using errcode='P0001'; end if;
  decided_time:=clock_timestamp(); next_status:=case when p_decision='approved' then 'approved' else 'blocked' end;
  update public.operations_action_approvals set decision=p_decision,reason=p_reason,approver_id=p_actor,
    decided_at=decided_time where id=approval.id;
  update public.operations_actions set status=next_status,
    status_reason=case when p_decision='rejected' then 'approval_rejected' else null end,updated_at=decided_time where id=action_row.id;
  insert into public.production_audit_log(user_id,actor_id,project_id,environment_id,action,target_type,target_id,
    outcome,reason,correlation_id,metadata)
  values(owner_id,p_actor,action_row.project_id,action_row.environment_id,'operations.approval.'||p_decision,
    'action',action_row.id::text,next_status,p_reason,action_row.idempotency_key,'{}');
  return query select * from public.operations_actions where id=action_row.id;
end;
$$;
revoke all on function public.decide_operations_action_approval(uuid,jsonb,text,text,text) from public,anon,authenticated;
grant execute on function public.decide_operations_action_approval(uuid,jsonb,text,text,text) to service_role;
