-- Serialize deduplication and rate admission on the existing rule. This reserves
-- one durable run before the existing canonical action creator is called.
create index if not exists operations_automation_runs_rule_started_idx on public.operations_automation_runs(rule_id,started_at desc);
create or replace function public.admit_operations_automation_run(
  p_actor uuid,p_owner uuid,p_project uuid,p_expected_rule jsonb,p_digest text,p_attributes jsonb,p_evidence text
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.operations_automation_rules%rowtype; rule_row public.operations_automation_rules%rowtype;
  run_row public.operations_automation_runs%rowtype; project_owner uuid; actor_role text;
  admitted_time timestamptz; window_seconds int; maximum_runs int; recent_runs bigint;
  conditions_match boolean; excluded boolean; maintenance_blocked boolean; decision text; initial_status text;
begin
  if p_actor is null or p_owner is null or p_project is null or jsonb_typeof(p_expected_rule) is distinct from 'object'
    or p_digest is null or p_digest !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_attributes) is distinct from 'object'
    or (p_evidence is not null and length(p_evidence)>500) then
    raise exception 'invalid automation signal' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_each(p_attributes) as attribute where jsonb_typeof(attribute.value) not in ('string','number','boolean','null')) then
    raise exception 'invalid signal attributes' using errcode='22023';
  end if;
  expected:=jsonb_populate_record(null::public.operations_automation_rules,p_expected_rule);
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
  select * into rule_row from public.operations_automation_rules where id=expected.id for update;
  if not found or rule_row.user_id is distinct from p_owner or rule_row.project_id is distinct from p_project then
    raise exception 'automation rule is not permitted' using errcode='42501';
  end if;
  if rule_row is distinct from expected then raise exception 'automation rule changed' using errcode='40001'; end if;
  select * into run_row from public.operations_automation_runs where rule_id=rule_row.id and trigger_digest=p_digest for share;
  if found then
    if run_row.user_id is distinct from p_owner or run_row.evidence_reference is distinct from p_evidence then
      raise exception 'automation replay changed' using errcode='40001';
    end if;
    return jsonb_build_object('run',to_jsonb(run_row),'decision','duplicate','replayed',true);
  end if;
  perform id from public.operations_maintenance_windows where user_id=p_owner and project_id=p_project order by id for share;
  admitted_time:=clock_timestamp();
  window_seconds:=greatest(60,least(86400,coalesce((rule_row.rate_limit->>'windowSeconds')::int,3600)));
  maximum_runs:=greatest(1,least(20,coalesce((rule_row.rate_limit->>'maxRuns')::int,3)));
  select count(*) into recent_runs from public.operations_automation_runs
    where rule_id=rule_row.id and started_at>=admitted_time-make_interval(secs=>window_seconds);
  conditions_match:=not exists(select 1 from jsonb_each(rule_row.conditions) as condition
    where (p_attributes->condition.key) is distinct from condition.value);
  excluded:=exists(select 1 from jsonb_each(rule_row.exclusions) as exclusion
    where (p_attributes->exclusion.key) is not distinct from exclusion.value);
  maintenance_blocked:=exists(select 1 from public.operations_maintenance_windows as window_row
    where window_row.user_id=p_owner and window_row.project_id=p_project and window_row.starts_at<=admitted_time and window_row.ends_at>admitted_time
      and not rule_row.action_type=any(window_row.allowed_actions)
      and (cardinality(window_row.blocked_actions)=0 or rule_row.action_type=any(window_row.blocked_actions)));
  decision:=case when rule_row.emergency_stopped then 'stopped'
    when not rule_row.enabled or not conditions_match or excluded then 'disabled'
    when maintenance_blocked then 'maintenance_blocked' when recent_runs>=maximum_runs then 'rate_limited'
    when rule_row.risk_level in ('high','critical') then 'approval_required' else 'execute' end;
  initial_status:=case when decision in ('execute','approval_required') then 'evaluating'
    when decision='stopped' then 'stopped' when decision='rate_limited' then 'rate_limited' else 'blocked' end;
  insert into public.operations_automation_runs(user_id,rule_id,trigger_digest,status,evidence_reference,safe_error,started_at,completed_at)
  values(p_owner,rule_row.id,p_digest,initial_status,p_evidence,
    case when decision in ('execute','approval_required') then null else decision end,admitted_time,
    case when decision in ('execute','approval_required') then null else admitted_time end) returning * into run_row;
  insert into public.production_audit_log(user_id,actor_id,project_id,environment_id,action,target_type,target_id,outcome,correlation_id,metadata,evidence_reference)
  values(p_owner,p_actor,p_project,rule_row.environment_id,'operations.automation.admitted','automation_run',run_row.id::text,initial_status,p_digest,
    jsonb_build_object('ruleId',rule_row.id,'triggerDigest',p_digest),p_evidence);
  return jsonb_build_object('run',to_jsonb(run_row),'decision',decision,'replayed',false);
end;
$$;
revoke all on function public.admit_operations_automation_run(uuid,uuid,uuid,jsonb,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.admit_operations_automation_run(uuid,uuid,uuid,jsonb,text,jsonb,text) to service_role;
