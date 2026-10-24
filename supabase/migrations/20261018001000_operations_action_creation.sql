-- Canonical action definitions and redacted audit state are supplied by the
-- existing service. Persist action, optional approval and audit together.
create or replace function public.create_operations_action(
  p_actor uuid,p_expected jsonb,p_allowed_roles text[],p_approval_role text,
  p_confirmation_required boolean,p_audit_after jsonb
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.operations_actions%rowtype; action_row public.operations_actions%rowtype;
  actor_role text; project_owner uuid; initial_status text; replayed boolean;
  admitted_time timestamptz;
begin
  if p_actor is null or jsonb_typeof(p_expected) is distinct from 'object'
    or jsonb_typeof(p_audit_after) is distinct from 'object' or p_confirmation_required is null
    or p_allowed_roles is null or cardinality(p_allowed_roles)=0
    or not p_allowed_roles <@ array['viewer','operator','release_manager','recovery_manager','admin']::text[]
    or (p_approval_role is not null and p_approval_role not in ('release_manager','recovery_manager')) then
    raise exception 'invalid action request' using errcode='22023';
  end if;
  expected:=jsonb_populate_record(null::public.operations_actions,p_expected);
  if expected.requested_by is distinct from p_actor or expected.action_plan_digest is null
    or expected.idempotency_key is null or length(expected.idempotency_key)=0
    or (expected.confirmation_digest is not null and expected.confirmation_digest is distinct from expected.action_plan_digest) then
    raise exception 'invalid action intent' using errcode='22023';
  end if;
  initial_status:=case when p_confirmation_required and expected.confirmation_digest is null then 'confirmation_required'
    when p_approval_role is not null then 'approval_required' else 'queued' end;
  if expected.status is distinct from initial_status then raise exception 'invalid initial action state' using errcode='22023'; end if;
  select role into actor_role from public.profiles where id=p_actor for share;
  select user_id into project_owner from public.projects where id=expected.project_id for share;
  if not found or project_owner is distinct from expected.user_id then raise exception 'action is not permitted' using errcode='42501'; end if;
  if actor_role is distinct from 'admin' then
    if p_actor=project_owner then actor_role:='operator';
    else select role into actor_role from public.operations_memberships
      where project_id=expected.project_id and user_id=project_owner and member_user_id=p_actor for share;
    end if;
  end if;
  if actor_role is null or not actor_role=any(p_allowed_roles) then raise exception 'action is not permitted' using errcode='42501'; end if;
  if expected.environment_id is not null then
    perform 1 from public.operations_environments where id=expected.environment_id and user_id=project_owner and project_id=expected.project_id for share;
    if not found then raise exception 'environment is not permitted' using errcode='42501'; end if;
  end if;
  perform id from public.operations_maintenance_windows where user_id=project_owner and project_id=expected.project_id order by id for share;
  admitted_time:=clock_timestamp();
  if exists(select 1 from public.operations_maintenance_windows as window_row
    where window_row.user_id=project_owner and window_row.project_id=expected.project_id
      and window_row.starts_at<=admitted_time and window_row.ends_at>admitted_time
      and not expected.action_type=any(window_row.allowed_actions)
      and (cardinality(window_row.blocked_actions)=0 or expected.action_type=any(window_row.blocked_actions))) then
    raise exception 'action blocked by maintenance' using errcode='P0001';
  end if;
  insert into public.operations_actions(user_id,project_id,environment_id,action_type,target_type,target_id,requested_by,
    permission_required,risk_level,status,idempotency_key,target_version,action_plan_digest,preconditions,execution_plan,
    rollback_plan,verification_plan,max_attempts,confirmation_digest)
  values(project_owner,expected.project_id,expected.environment_id,expected.action_type,expected.target_type,expected.target_id,p_actor,
    expected.permission_required,expected.risk_level,initial_status,expected.idempotency_key,expected.target_version,
    expected.action_plan_digest,expected.preconditions,expected.execution_plan,expected.rollback_plan,expected.verification_plan,
    expected.max_attempts,expected.confirmation_digest)
  on conflict(user_id,idempotency_key) do nothing returning * into action_row;
  replayed:=not found;
  if replayed then
    select * into action_row from public.operations_actions where user_id=project_owner and idempotency_key=expected.idempotency_key for share;
    if not found or row(action_row.user_id,action_row.project_id,action_row.environment_id,action_row.requested_by,
      action_row.action_type,action_row.target_type,action_row.target_id,action_row.target_version,action_row.idempotency_key,
      action_row.action_plan_digest,action_row.permission_required,action_row.risk_level,action_row.execution_plan,action_row.max_attempts)
    is distinct from row(expected.user_id,expected.project_id,expected.environment_id,expected.requested_by,
      expected.action_type,expected.target_type,expected.target_id,expected.target_version,expected.idempotency_key,
      expected.action_plan_digest,expected.permission_required,expected.risk_level,expected.execution_plan,expected.max_attempts) then
      raise exception 'action key has a different intent' using errcode='40001';
    end if;
    return jsonb_build_object('action',to_jsonb(action_row),'replayed',true);
  end if;
  if initial_status='approval_required' then
    insert into public.operations_action_approvals(action_id,user_id,requester_id,required_role,target_version,action_plan_digest,expires_at)
    values(action_row.id,project_owner,p_actor,p_approval_role,action_row.target_version,action_row.action_plan_digest,clock_timestamp()+interval '30 minutes');
  end if;
  insert into public.production_audit_log(user_id,actor_id,project_id,environment_id,action,target_type,target_id,outcome,after_state,correlation_id,metadata)
  values(project_owner,p_actor,action_row.project_id,action_row.environment_id,'operations.action.requested','action',action_row.id::text,
    initial_status,p_audit_after,action_row.idempotency_key,'{}');
  return jsonb_build_object('action',to_jsonb(action_row),'replayed',false);
end;
$$;
revoke all on function public.create_operations_action(uuid,jsonb,text[],text,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.create_operations_action(uuid,jsonb,text[],text,boolean,jsonb) to service_role;
