-- Extend the existing action admission, never a second execution or grant system.
-- Reuse its exact authority/intent locks for claim and internal database effects.
begin;
create or replace function public.lock_operations_action_admission(
  p_actor uuid,p_expected jsonb,p_allowed_roles text[],p_approval_role text,
  p_confirmation_required boolean
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
  return next action_row;
end;
$$;
revoke all on function public.lock_operations_action_admission(uuid,jsonb,text[],text,boolean) from public,anon,authenticated;
grant execute on function public.lock_operations_action_admission(uuid,jsonb,text[],text,boolean) to service_role;

-- Original signature, policy and lease/retry implementation remain intact.
create or replace function public.claim_operations_action_admitted(
  p_actor uuid,p_expected jsonb,p_allowed_roles text[],p_approval_role text,
  p_confirmation_required boolean,p_lease_seconds int
) returns setof public.operations_actions
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare admitted public.operations_actions%rowtype;
begin
  select * into admitted from public.lock_operations_action_admission(
    p_actor,p_expected,p_allowed_roles,p_approval_role,p_confirmation_required);
  if not found then return; end if;
  return query select * from public.operations_claim_action(admitted.id,'api:'||p_actor::text,p_lease_seconds);
end;
$$;
revoke all on function public.claim_operations_action_admitted(uuid,jsonb,text[],text,boolean,int) from public,anon,authenticated;
grant execute on function public.claim_operations_action_admitted(uuid,jsonb,text[],text,boolean,int) to service_role;

-- Fixed existing internal capabilities only. No caller-selected SQL/table or new
-- authority source. Policy arguments are supplied by the existing typed service.
create or replace function public.mutate_operations_internal_target(
  p_capability text,p_actor uuid,p_expected jsonb,p_evidence_id text,p_allowed_roles text[],
  p_approval_role text,p_confirmation_required boolean
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare admitted public.operations_actions%rowtype; target record; result jsonb;
  starts_at timestamptz; ends_at timestamptz; reason text; evidence text; changed_ids uuid[];
  completed public.operations_actions%rowtype; summary text; observed jsonb;
begin
  if p_evidence_id is null or p_evidence_id !~ '^ev_[0-9a-f-]{36}$' then
    raise exception 'invalid internal evidence identity' using errcode='22023';
  end if;
  if p_capability is null or p_capability not in ('acknowledge_incident','resolve_incident','retry_job','retry_webhook',
    'emergency_stop','resume_automation','enable_automation','disable_automation','schedule_maintenance',
    'cancel_maintenance','execute_growth_campaign') then
    raise exception 'unsupported internal capability' using errcode='22023';
  end if;
  -- A stale competing claim must not make the already admitted effect fail
  -- merely by briefly holding this advisory lock. Claims retain their original
  -- nonblocking exclusion. Effects wait, then revalidate their complete intent.
  perform pg_advisory_xact_lock(hashtextextended(p_expected->>'id',0));
  select * into admitted from public.lock_operations_action_admission(
    p_actor,p_expected,p_allowed_roles,p_approval_role,p_confirmation_required);
  if not found then raise exception 'internal action is busy' using errcode='40001'; end if;
  if admitted.action_type is distinct from p_capability or admitted.status<>'running'
    or admitted.lease_owner is distinct from 'api:'||p_actor::text or admitted.lease_expires_at is null
    or admitted.lease_expires_at<=clock_timestamp() or admitted.attempt_count<1
    or admitted.attempt_count>admitted.max_attempts then
    raise exception 'internal action attempt changed' using errcode='40001';
  end if;
  case
    when p_capability in ('acknowledge_incident','resolve_incident') then
      if admitted.target_type<>'incident' then raise exception 'invalid internal target' using errcode='22023'; end if;
      select * into target from public.production_incidents where id=admitted.target_id::uuid
        and user_id=admitted.user_id and project_id=admitted.project_id for update;
    when p_capability='retry_job' then
      if admitted.target_type<>'job' then raise exception 'invalid internal target' using errcode='22023'; end if;
      select * into target from public.swarm_job_queue where id=admitted.target_id::uuid
        and user_id=admitted.user_id and project_id=admitted.project_id for update;
    when p_capability='retry_webhook' then
      if admitted.target_type<>'webhook' then raise exception 'invalid internal target' using errcode='22023'; end if;
      begin
        select * into strict target from public.webhook_deliveries where delivery_id=admitted.target_id
          and user_id=admitted.user_id and project_id=admitted.project_id for update;
      exception
        when no_data_found then return jsonb_build_object('rows','[]'::jsonb,'completion',null);
        when too_many_rows then raise exception 'webhook target is ambiguous' using errcode='40001';
      end;
    when p_capability in ('emergency_stop','resume_automation','enable_automation','disable_automation') then
      if admitted.target_type<>'automation' then raise exception 'invalid internal target' using errcode='22023'; end if;
      if p_capability in ('emergency_stop','resume_automation') and admitted.target_id=admitted.project_id::text then
        -- Match the original control's lock order, including versioned rule keys.
        perform id from public.operations_automation_rules where user_id=admitted.user_id and project_id=admitted.project_id
          order by rule_key,version desc,id for update;
      else
        select * into target from public.operations_automation_rules where id=admitted.target_id::uuid
          and user_id=admitted.user_id and project_id=admitted.project_id for update;
      end if;
    when p_capability='schedule_maintenance' then
      if admitted.target_type<>'environment' then raise exception 'invalid internal target' using errcode='22023'; end if;
      select * into target from public.operations_environments where id=admitted.target_id::uuid
        and user_id=admitted.user_id and project_id=admitted.project_id and version=admitted.target_version for share;
    when p_capability='cancel_maintenance' then
      if admitted.target_type<>'maintenance' then raise exception 'invalid internal target' using errcode='22023'; end if;
      select * into target from public.operations_maintenance_windows where id=admitted.target_id::uuid
        and user_id=admitted.user_id and project_id=admitted.project_id for update;
    when p_capability='execute_growth_campaign' then
      if admitted.target_type<>'growth_campaign' then raise exception 'invalid internal target' using errcode='22023'; end if;
      select * into target from public.growth_campaigns where id=admitted.target_id::uuid
        and tenant_id=admitted.user_id and project_id=admitted.project_id for update;
      if found and target.segment_id is not null then
        perform id from public.growth_segments where id=target.segment_id and tenant_id=admitted.user_id
          and project_id=admitted.project_id for share;
        if not found then raise exception 'campaign parent changed' using errcode='42501'; end if;
      end if;
  end case;
  -- Zero current targets is a blocked result, never a successful mutation.
  if not found and not(p_capability in ('emergency_stop','resume_automation')
    and admitted.target_id=admitted.project_id::text) then
    return jsonb_build_object('rows','[]'::jsonb,'completion',null);
  end if;
  -- Re-sample approval expiry after any target lock wait. All authority locks are
  -- still held. No advisory preflight can authorize a later unguarded effect.
  perform 1 from public.lock_operations_action_admission(
    p_actor,p_expected,p_allowed_roles,p_approval_role,p_confirmation_required);
  if not found or admitted.lease_expires_at<=clock_timestamp() then
    raise exception 'internal action expired while waiting' using errcode='40001';
  end if;
  case
    when p_capability='acknowledge_incident' then
      with changed as(update public.production_incidents set status='investigating',version=version+1,updated_at=clock_timestamp()
        where id=admitted.target_id::uuid and user_id=admitted.user_id and project_id=admitted.project_id
          and status in ('detected','open') and version=admitted.target_version returning id,user_id,project_id,status)
      select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from changed c;
    when p_capability='resolve_incident' then
      evidence:=admitted.execution_plan->>'recoveryEvidenceReference';
      if evidence is null or evidence='' then raise exception 'recovery evidence required' using errcode='22023'; end if;
      with changed as(update public.production_incidents set status='resolved',recovery_evidence_reference=evidence,
        resolved_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
        where id=admitted.target_id::uuid and user_id=admitted.user_id and project_id=admitted.project_id
          and status in ('investigating','identified','mitigating','monitoring','acknowledged')
          and version=admitted.target_version returning id,user_id,project_id,status)
      select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from changed c;
    when p_capability='retry_job' then
      with changed as(update public.swarm_job_queue set status='queued',attempt_count=attempt_count+1,
        updated_at=clock_timestamp(),safe_error=null where id=admitted.target_id::uuid and user_id=admitted.user_id
          and project_id=admitted.project_id and status='failed' and attempt_count=admitted.target_version
          and attempt_count<3 returning id,user_id,project_id,status,attempt_count)
      select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from changed c;
    when p_capability='retry_webhook' then
      with changed as(update public.webhook_deliveries set status='processing',attempt_count=attempt_count+1,
        updated_at=clock_timestamp(),safe_error=null where delivery_id=admitted.target_id and user_id=admitted.user_id
          and project_id=admitted.project_id and provider=target.provider and status='failed' and attempt_count=admitted.target_version
          returning delivery_id,user_id,project_id,status,attempt_count)
      select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from changed c;
    when p_capability in ('emergency_stop','resume_automation') then
      select array_agg(c.id) into changed_ids from public.set_operations_automation_stop(
        admitted.user_id,admitted.project_id,admitted.target_id::uuid,admitted.target_version,p_capability='emergency_stop') c;
      select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from
        (select id,user_id,project_id,emergency_stopped,version from public.operations_automation_rules
          where id=any(changed_ids) and user_id=admitted.user_id and project_id=admitted.project_id order by id) c;
      if jsonb_array_length(result)<>coalesce(cardinality(changed_ids),0) then
        raise exception 'automation receipt changed' using errcode='40001';
      end if;
    when p_capability in ('enable_automation','disable_automation') then
      with changed as(update public.operations_automation_rules set enabled=(p_capability='enable_automation'),
        version=version+1,updated_at=clock_timestamp() where id=admitted.target_id::uuid and user_id=admitted.user_id
          and project_id=admitted.project_id and version=admitted.target_version returning id,user_id,project_id,enabled)
      select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from changed c;
    when p_capability='schedule_maintenance' then
      starts_at:=(admitted.execution_plan->>'startsAt')::timestamptz;ends_at:=(admitted.execution_plan->>'endsAt')::timestamptz;
      reason:=left(btrim(coalesce(admitted.execution_plan->>'reason','')),500);
      if starts_at is null or ends_at is null or ends_at<=starts_at or ends_at-starts_at>interval '31 days' or length(reason)<3 then
        raise exception 'invalid maintenance request' using errcode='22023';
      end if;
      with changed as(insert into public.operations_maintenance_windows(user_id,project_id,environment_id,starts_at,ends_at,
        reason,owner_id,allowed_actions,blocked_actions) values(admitted.user_id,admitted.project_id,admitted.target_id::uuid,
          starts_at,ends_at,reason,p_actor,
          case when jsonb_typeof(admitted.execution_plan->'allowedActions')='array'
            then array(select jsonb_array_elements_text(admitted.execution_plan->'allowedActions')) else '{}'::text[] end,
          case when jsonb_typeof(admitted.execution_plan->'blockedActions')='array'
            then array(select jsonb_array_elements_text(admitted.execution_plan->'blockedActions')) else '{}'::text[] end)
        returning id,user_id,project_id,environment_id,status,version)
      select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from changed c;
    when p_capability='cancel_maintenance' then
      with changed as(update public.operations_maintenance_windows set status='cancelled',version=version+1,updated_at=clock_timestamp()
        where id=admitted.target_id::uuid and user_id=admitted.user_id and project_id=admitted.project_id
          and version=admitted.target_version and status in ('scheduled','active') returning id,user_id,project_id,status)
      select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from changed c;
    when p_capability='execute_growth_campaign' then
      with changed as(update public.growth_campaigns set status='running',version=version+1,updated_at=clock_timestamp()
        where id=admitted.target_id::uuid and tenant_id=admitted.user_id and project_id=admitted.project_id
          and version=admitted.target_version and status='approval_required' returning id,tenant_id as user_id,project_id,status,version)
      select coalesce(jsonb_agg(to_jsonb(c)),'[]') into result from changed c;
  end case;
  if jsonb_array_length(result)=0 and not(p_capability in ('emergency_stop','resume_automation')
    and admitted.target_id=admitted.project_id::text) then
    return jsonb_build_object('rows',result,'completion',null);
  end if;
  summary:=case p_capability
    when 'acknowledge_incident' then 'Incident acknowledgement persisted and verified'
    when 'resolve_incident' then 'Incident resolution persisted with recovery evidence'
    when 'retry_job' then 'Job retry was queued exactly once'
    when 'retry_webhook' then 'Webhook reprocessing was queued without duplicating receipt evidence'
    when 'emergency_stop' then 'Emergency stop enabled for '||jsonb_array_length(result)||' rule(s)'
    when 'resume_automation' then 'Automation resumed for '||jsonb_array_length(result)||' rule(s)'
    when 'enable_automation' then 'Automation rule enabled and verified'
    when 'disable_automation' then 'Automation rule disabled and verified'
    when 'schedule_maintenance' then 'Maintenance window persisted and verified'
    when 'cancel_maintenance' then 'Maintenance cancellation persisted and verified'
    when 'execute_growth_campaign' then 'Growth campaign approval persisted; recipient processing may begin' end;
  observed:=jsonb_build_object('internalEffect',jsonb_build_object('actionId',admitted.id,'attempt',admitted.attempt_count,
    'actorId',p_actor,'ownerId',admitted.user_id,'projectId',admitted.project_id,'targetId',admitted.target_id,
    'capability',p_capability,'rows',result));
  if p_capability='schedule_maintenance' then observed:=observed||jsonb_build_object('maintenanceId',result->0->>'id'); end if;
  -- The existing completion transaction writes evidence, attempt, action and audit.
  -- Calling it here makes those durable receipts atomic with the target mutation.
  -- A lost response leaves a verified canonical action, so HTTP replay returns its
  -- existing receipt without another claim or target effect. No external I/O.
  select * into strict completed from public.complete_operations_action(p_actor,to_jsonb(admitted),p_evidence_id,
    'internal_database',jsonb_build_object('status','verified','safeSummary',summary,'observedState',observed));
  return jsonb_build_object('rows',result,'completion',to_jsonb(completed));
end;
$$;
revoke all on function public.mutate_operations_internal_target(text,uuid,jsonb,text,text[],text,boolean) from public,anon,authenticated;
grant execute on function public.mutate_operations_internal_target(text,uuid,jsonb,text,text[],text,boolean) to service_role;
notify pgrst,'reload schema';
commit;
