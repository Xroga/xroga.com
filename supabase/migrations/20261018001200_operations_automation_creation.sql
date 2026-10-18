-- Keep the existing rule model and policy. Revalidate current authority and
-- persist the rule with its mandatory immutable audit in one transaction.
create or replace function public.create_operations_automation_rule(
  p_actor uuid,p_owner uuid,p_project uuid,p_rule jsonb,p_approval_role text
) returns setof public.operations_automation_rules
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.operations_automation_rules%rowtype; created public.operations_automation_rules%rowtype;
  project_owner uuid; actor_role text;
begin
  if p_actor is null or p_owner is null or p_project is null or jsonb_typeof(p_rule) is distinct from 'object' then
    raise exception 'invalid automation rule' using errcode='22023';
  end if;
  expected:=jsonb_populate_record(null::public.operations_automation_rules,p_rule);
  if expected.id is null or expected.user_id is distinct from p_owner or expected.project_id is distinct from p_project
    or expected.environment_id is not null or expected.version is distinct from 1 or expected.emergency_stopped is distinct from false
    or expected.rule_key is null or expected.rule_key !~ '^[a-z0-9][a-z0-9_.-]{2,79}$'
    or expected.name is null or length(expected.name) not between 3 and 120
    or expected.trigger_type is null or length(expected.trigger_type) not between 2 and 80
    or expected.action_type is null or length(expected.action_type) not between 2 and 80
    or expected.risk_level is null or expected.risk_level not in ('read_only','low','medium','high','critical')
    or expected.enabled is null or jsonb_typeof(expected.conditions) is distinct from 'object'
    or jsonb_typeof(expected.exclusions) is distinct from 'object' or jsonb_typeof(expected.rate_limit) is distinct from 'object'
    or (p_approval_role is not null and p_approval_role not in ('release_manager','recovery_manager'))
    or (expected.risk_level in ('high','critical') and p_approval_role is null)
    or expected.approval_policy is distinct from (case when p_approval_role is null then '{}'::jsonb else jsonb_build_object('requiredRole',p_approval_role) end)
    or expected.verification_plan is distinct from '{"required":true}'::jsonb then
    raise exception 'invalid automation rule' using errcode='22023';
  end if;
  if coalesce(expected.rate_limit->>'maxRuns','') !~ '^[0-9]{1,2}$'
    or coalesce(expected.rate_limit->>'windowSeconds','') !~ '^[0-9]{2,5}$' then
    raise exception 'invalid automation limits' using errcode='22023';
  end if;
  if (expected.rate_limit->>'maxRuns')::int not between 1 and 20
    or (expected.rate_limit->>'windowSeconds')::int not between 60 and 86400 then
    raise exception 'invalid automation limits' using errcode='22023';
  end if;
  select role into actor_role from public.profiles where id=p_actor for share;
  select user_id into project_owner from public.projects where id=p_project for share;
  if not found or project_owner is distinct from p_owner then raise exception 'automation is not permitted' using errcode='42501'; end if;
  if actor_role is distinct from 'admin' then
    if p_actor=p_owner then actor_role:='operator';
    else select role into actor_role from public.operations_memberships
      where project_id=p_project and user_id=p_owner and member_user_id=p_actor for share;
    end if;
  end if;
  if actor_role is null or actor_role not in ('operator','release_manager','recovery_manager','admin') then
    raise exception 'automation is not permitted' using errcode='42501';
  end if;
  insert into public.operations_automation_rules(id,user_id,project_id,rule_key,version,name,trigger_type,risk_level,action_type,
    conditions,exclusions,rate_limit,enabled,emergency_stopped,approval_policy,verification_plan)
  values(expected.id,p_owner,p_project,expected.rule_key,1,expected.name,expected.trigger_type,expected.risk_level,expected.action_type,
    expected.conditions,expected.exclusions,expected.rate_limit,expected.enabled,false,expected.approval_policy,expected.verification_plan)
  returning * into created;
  insert into public.production_audit_log(user_id,actor_id,project_id,action,target_type,target_id,outcome,correlation_id,metadata)
  values(p_owner,p_actor,p_project,'operations.automation.created','automation_rule',created.id::text,
    case when created.enabled then 'enabled' else 'disabled' end,created.id::text,'{}');
  return next created;
end;
$$;
revoke all on function public.create_operations_automation_rule(uuid,uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.create_operations_automation_rule(uuid,uuid,uuid,jsonb,text) to service_role;
