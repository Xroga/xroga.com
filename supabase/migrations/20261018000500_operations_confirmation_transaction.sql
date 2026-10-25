-- Canonical service definitions supply allowed roles and the optional approval
-- role. Browser roles cannot select these parameters or execute this function.
create or replace function public.confirm_operations_action(
  p_actor uuid,p_expected jsonb,p_allowed_roles text[],p_approval_role text
) returns setof public.operations_actions
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.operations_actions%rowtype; action_row public.operations_actions%rowtype;
  actor_role text; owner_id uuid; confirmed_time timestamptz; next_status text;
begin
  if p_actor is null or jsonb_typeof(p_expected) is distinct from 'object'
    or p_allowed_roles is null or cardinality(p_allowed_roles)=0
    or not p_allowed_roles <@ array['viewer','operator','release_manager','recovery_manager','admin']::text[]
    or (p_approval_role is not null and p_approval_role not in ('release_manager','recovery_manager')) then
    raise exception 'invalid confirmation request' using errcode='22023';
  end if;
  expected:=jsonb_populate_record(null::public.operations_actions,p_expected);
  select role into actor_role from public.profiles where id=p_actor for share;
  select user_id into owner_id from public.projects where id=expected.project_id for share;
  if not found or owner_id is distinct from expected.user_id or p_actor is distinct from expected.requested_by then
    raise exception 'confirmation is not permitted' using errcode='42501';
  end if;
  if actor_role is distinct from 'admin' then
    if p_actor=owner_id then actor_role:='operator';
    else
      select role into actor_role from public.operations_memberships
        where project_id=expected.project_id and user_id=owner_id and member_user_id=p_actor for share;
    end if;
  end if;
  if actor_role is null or not actor_role=any(p_allowed_roles) then
    raise exception 'confirmation is not permitted' using errcode='42501';
  end if;
  select * into action_row from public.operations_actions where id=expected.id for update;
  if not found or action_row.status<>'confirmation_required' or expected.status is distinct from 'confirmation_required'
    or row(action_row.user_id,action_row.project_id,action_row.environment_id,action_row.requested_by,
      action_row.action_type,action_row.target_type,action_row.target_id,action_row.target_version,
      action_row.action_plan_digest,action_row.confirmation_digest,action_row.execution_plan,action_row.idempotency_key,
      action_row.permission_required,action_row.risk_level,action_row.max_attempts)
    is distinct from row(expected.user_id,expected.project_id,expected.environment_id,expected.requested_by,
      expected.action_type,expected.target_type,expected.target_id,expected.target_version,
      expected.action_plan_digest,expected.confirmation_digest,expected.execution_plan,expected.idempotency_key,
      expected.permission_required,expected.risk_level,expected.max_attempts)
    or action_row.confirmation_digest is not null then
    raise exception 'confirmation action changed' using errcode='40001';
  end if;
  confirmed_time:=clock_timestamp();
  next_status:=case when p_approval_role is null then 'queued' else 'approval_required' end;
  update public.operations_actions set confirmation_digest=action_row.action_plan_digest,status=next_status,
    updated_at=confirmed_time where id=action_row.id;
  if p_approval_role is not null then
    insert into public.operations_action_approvals(action_id,user_id,requester_id,required_role,target_version,action_plan_digest,expires_at)
    values(action_row.id,owner_id,p_actor,p_approval_role,action_row.target_version,action_row.action_plan_digest,confirmed_time+interval '30 minutes');
  end if;
  insert into public.production_audit_log(user_id,actor_id,project_id,environment_id,action,target_type,target_id,outcome,correlation_id,metadata)
  values(owner_id,p_actor,action_row.project_id,action_row.environment_id,'operations.action.confirmed','action',
    action_row.id::text,next_status,action_row.idempotency_key,'{}');
  return query select * from public.operations_actions where id=action_row.id;
end;
$$;
revoke all on function public.confirm_operations_action(uuid,jsonb,text[],text) from public,anon,authenticated;
grant execute on function public.confirm_operations_action(uuid,jsonb,text[],text) to service_role;
