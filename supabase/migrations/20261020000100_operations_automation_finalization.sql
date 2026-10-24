-- Finish the existing admitted run under the same current-authority/rule locks.
-- No action is created or executed here. Reconcile a single canonical action
-- using the existing run ID idempotency namespace, then commit its audit once.
begin;
create or replace function public.finalize_operations_automation_run(
  p_actor uuid,p_owner uuid,p_project uuid,p_expected_rule jsonb,p_expected_run jsonb,
  p_attributes jsonb,p_action jsonb,p_environment uuid
) returns setof public.operations_automation_runs
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.operations_automation_runs%rowtype; run_row public.operations_automation_runs%rowtype;
  expected_action public.operations_actions%rowtype; action_row public.operations_actions%rowtype;
  admission jsonb; status_next text; completed_time timestamptz; existing_audits bigint;
begin
  if jsonb_typeof(p_expected_run) is distinct from 'object'
    or (p_action is not null and jsonb_typeof(p_action) is distinct from 'object') then
    raise exception 'invalid automation completion' using errcode='22023';
  end if;
  expected:=jsonb_populate_record(null::public.operations_automation_runs,p_expected_run);
  -- Reuse the original actor/project/member/rule locks and exact rule comparison.
  -- A prior run must exist. Calling admission on it only revalidates its replay.
  if not exists(select 1 from public.operations_automation_runs where id=expected.id
    and user_id=p_owner and rule_id=(p_expected_rule->>'id')::uuid
    and trigger_digest=expected.trigger_digest) then
    raise exception 'automation run is not permitted' using errcode='42501';
  end if;
  admission:=public.admit_operations_automation_run(p_actor,p_owner,p_project,p_expected_rule,
    expected.trigger_digest,p_attributes,expected.evidence_reference);
  if admission->>'replayed' is distinct from 'true' or admission->'run'->>'id' is distinct from expected.id::text then
    raise exception 'automation admission changed' using errcode='40001';
  end if;
  if p_environment is not null then
    perform id from public.operations_environments where id=p_environment and user_id=p_owner and project_id=p_project for share;
    if not found then raise exception 'automation environment is not permitted' using errcode='42501'; end if;
  end if;
  select * into run_row from public.operations_automation_runs where id=expected.id for update;
  if not found or row(run_row.user_id,run_row.rule_id,run_row.trigger_digest,run_row.evidence_reference,run_row.started_at)
    is distinct from row(expected.user_id,expected.rule_id,expected.trigger_digest,expected.evidence_reference,expected.started_at)
    or run_row.user_id is distinct from p_owner then
    raise exception 'automation run changed' using errcode='40001';
  end if;
  if p_action is not null then
    expected_action:=jsonb_populate_record(null::public.operations_actions,p_action);
    select * into action_row from public.operations_actions where id=expected_action.id for update;
    if not found or action_row is distinct from expected_action or action_row.user_id is distinct from p_owner
      or action_row.project_id is distinct from p_project or action_row.requested_by is distinct from p_actor
      or action_row.environment_id is distinct from p_environment or action_row.idempotency_key is distinct from run_row.id::text
      or action_row.action_type is distinct from p_expected_rule->>'action_type' then
      raise exception 'automation action changed' using errcode='40001';
    end if;
    status_next:=case when action_row.status='approval_required' then 'approval_required'
      when action_row.status='verified' then 'verified' else 'action_created' end;
    if run_row.action_id is null and run_row.status='evaluating' then
      if expected.action_id is not null or expected.status<>'evaluating' or run_row.safe_error is not null then
        raise exception 'automation run changed' using errcode='40001';
      end if;
      completed_time:=case when status_next='verified' then clock_timestamp() else null end;
      update public.operations_automation_runs set action_id=action_row.id,status=status_next,completed_at=completed_time
        where id=run_row.id returning * into run_row;
    elsif run_row.action_id is distinct from action_row.id or run_row.status is distinct from status_next then
      raise exception 'automation run already linked differently' using errcode='40001';
    end if;
  elsif run_row is distinct from expected or run_row.action_id is not null
    or run_row.status not in ('blocked','rate_limited','stopped') then
    raise exception 'automation decision changed' using errcode='40001';
  end if;
  select count(*) into existing_audits from public.production_audit_log
    where action='operations.automation.evaluated' and target_type='automation_run' and target_id=run_row.id::text;
  if existing_audits=0 then
    insert into public.production_audit_log(user_id,actor_id,project_id,environment_id,action,target_type,target_id,
      outcome,reason,correlation_id,evidence_reference,metadata)
    values(p_owner,p_actor,p_project,p_environment,'operations.automation.evaluated','automation_run',run_row.id::text,
      run_row.status,left(run_row.safe_error,500),run_row.trigger_digest,run_row.evidence_reference,'{}');
  elsif existing_audits<>1 or not exists(select 1 from public.production_audit_log
    where action='operations.automation.evaluated' and target_type='automation_run' and target_id=run_row.id::text
      and user_id=p_owner and actor_id=p_actor and project_id=p_project and environment_id is not distinct from p_environment
      and outcome=run_row.status and correlation_id=run_row.trigger_digest
      and evidence_reference is not distinct from run_row.evidence_reference) then
    raise exception 'automation audit changed' using errcode='40001';
  end if;
  return next run_row;
end;
$$;
revoke all on function public.finalize_operations_automation_run(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.finalize_operations_automation_run(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
commit;
