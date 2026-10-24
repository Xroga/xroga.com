-- Persist one admitted attempt's completion as one transaction. This cannot
-- undo an external provider effect, authorize an execution, or extend a lease.
create or replace function public.complete_operations_action(
  p_actor uuid, p_expected jsonb, p_evidence_id text, p_provider text, p_result jsonb
) returns setof public.operations_actions
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare
  expected public.operations_actions%rowtype;
  action_row public.operations_actions%rowtype;
  project_owner uuid;
  final_status text;
  summary text;
  completed_time timestamptz;
begin
  if p_actor is null or jsonb_typeof(p_expected) is distinct from 'object'
    or jsonb_typeof(p_result) is distinct from 'object'
    or p_evidence_id is null or p_evidence_id !~ '^ev_[0-9a-f-]{36}$'
    or p_provider is null or length(p_provider) not between 1 and 100
    or p_result->>'status' is null
    or p_result->>'status' not in ('verified','failed','blocked','unsupported','external_setup_required','provider_unavailable')
    or jsonb_typeof(p_result->'safeSummary') is distinct from 'string'
    or length(p_result->>'safeSummary') > 500 then
    raise exception 'invalid completion receipt' using errcode='22023';
  end if;
  expected := jsonb_populate_record(null::public.operations_actions,p_expected);
  select user_id into project_owner from public.projects where id=expected.project_id for share;
  if not found or project_owner is distinct from expected.user_id then
    raise exception 'completion authority changed' using errcode='42501';
  end if;
  select * into action_row from public.operations_actions where id=expected.id for update;
  if not found or action_row.status<>'running' or expected.status is distinct from 'running'
    or action_row.lease_owner is distinct from 'api:'||p_actor::text
    or action_row.lease_expires_at is null or action_row.lease_expires_at<=clock_timestamp()
    or row(action_row.user_id,action_row.project_id,action_row.environment_id,action_row.requested_by,
      action_row.action_type,action_row.target_type,action_row.target_id,action_row.target_version,
      action_row.idempotency_key,action_row.action_plan_digest,action_row.confirmation_digest,
      action_row.permission_required,action_row.risk_level,action_row.execution_plan,
      action_row.attempt_count,action_row.max_attempts,action_row.lease_owner,action_row.lease_expires_at)
    is distinct from row(expected.user_id,expected.project_id,expected.environment_id,expected.requested_by,
      expected.action_type,expected.target_type,expected.target_id,expected.target_version,
      expected.idempotency_key,expected.action_plan_digest,expected.confirmation_digest,
      expected.permission_required,expected.risk_level,expected.execution_plan,
      expected.attempt_count,expected.max_attempts,expected.lease_owner,expected.lease_expires_at) then
    raise exception 'completion attempt changed' using errcode='40001';
  end if;
  final_status := case when p_result->>'status'='verified' then 'verified'
    when p_result->>'status' in ('blocked','unsupported','external_setup_required') then 'blocked' else 'failed' end;
  summary := p_result->>'safeSummary'; completed_time := clock_timestamp();
  insert into public.production_evidence(id,user_id,project_id,environment_id,action_id,kind,source,status,summary,
    reference,metadata,observed_at,verified_at)
  values(p_evidence_id,action_row.user_id,action_row.project_id,action_row.environment_id,action_row.id,
    'action_verification',p_provider,case when final_status='verified' then 'verified'
      when p_result->>'status'='failed' then 'degraded' else 'blocked' end,summary,p_result->>'providerReference',
    jsonb_build_object('errorCategory',p_result->'errorCategory','observedState',p_result->'observedState'),
    completed_time,case when final_status='verified' then completed_time else null end);
  insert into public.operations_action_runs(action_id,user_id,attempt,provider,status,error_category,safe_error,
    provider_reference,evidence_reference,completed_at)
  values(action_row.id,action_row.user_id,action_row.attempt_count,p_provider,final_status,p_result->>'errorCategory',
    case when final_status='verified' then null else summary end,p_result->>'providerReference',p_evidence_id,completed_time);
  update public.operations_actions set status=final_status,status_reason=summary,evidence_reference=p_evidence_id,
    completed_at=completed_time,lease_owner=null,lease_expires_at=null,updated_at=completed_time where id=action_row.id;
  insert into public.production_audit_log(user_id,actor_id,project_id,environment_id,action,target_type,target_id,
    outcome,after_state,correlation_id,evidence_reference,metadata)
  values(action_row.user_id,p_actor,action_row.project_id,action_row.environment_id,'operations.action.completed',
    'action',action_row.id::text,final_status,p_result,action_row.idempotency_key,p_evidence_id,'{}');
  return query select * from public.operations_actions where id=action_row.id;
end;
$$;
revoke all on function public.complete_operations_action(uuid,jsonb,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.complete_operations_action(uuid,jsonb,text,text,jsonb) to service_role;
