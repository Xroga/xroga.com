-- Evaluate the existing activation policy from locked current owned sources.
-- This does not attest provider/event provenance or create a new growth engine.
create or replace function public.evaluate_growth_activation(
  p_actor uuid,p_tenant uuid,p_project uuid,p_subject uuid,p_allowed_roles text[]
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare project_owner uuid; actor_role text; definition public.growth_activation_definitions%rowtype;
  deployment public.deployment_status%rowtype; observed_events text[]; lifecycle public.growth_lifecycle_state%rowtype;
  deployment_verified boolean; evidence text;
begin
  if p_actor is null or p_tenant is null or p_project is null or p_subject is null
    or p_allowed_roles is null or cardinality(p_allowed_roles)=0
    or not p_allowed_roles <@ array['viewer','operator','release_manager','recovery_manager','admin']::text[] then
    raise exception 'invalid activation evaluation' using errcode='22023';
  end if;
  select role into actor_role from public.profiles where id=p_actor for share;
  select user_id into project_owner from public.projects where id=p_project for share;
  if not found or project_owner is distinct from p_tenant then raise exception 'activation is not permitted' using errcode='42501'; end if;
  if actor_role is distinct from 'admin' then
    if p_actor=p_tenant then actor_role:='operator';
    else select role into actor_role from public.operations_memberships
      where project_id=p_project and user_id=p_tenant and member_user_id=p_actor for share;
    end if;
  end if;
  if actor_role is null or not actor_role=any(p_allowed_roles) then raise exception 'activation is not permitted' using errcode='42501'; end if;
  select * into definition from public.growth_activation_definitions
    where tenant_id=p_tenant and project_id=p_project and active=true order by version desc limit 1 for share;
  if not found then return jsonb_build_object('activated',false,'lifecycle',null,'reason','not_configured'); end if;
  select * into deployment from public.deployment_status
    where user_id=p_tenant and project_id=p_project order by created_at desc limit 1 for share;
  deployment_verified:=coalesce(coalesce(deployment.verification_state,deployment.status)=any(array['verified','production_verified','succeeded']),false);
  if not deployment_verified then return jsonb_build_object('activated',false,'lifecycle',null,'reason','deployment_unverified'); end if;
  select array_agg(source.event_type) into observed_events from (
    select event_type from public.analytics_events
    where tenant_id=p_tenant and project_id=p_project and user_id=p_subject and event_type=any(definition.required_event_names)
    order by id for share
  ) source;
  if cardinality(definition.required_event_names)=0 or not definition.required_event_names <@ coalesce(observed_events,array[]::text[]) then
    return jsonb_build_object('activated',false,'lifecycle',null,'reason','required_events_missing');
  end if;
  evidence:=format('activation:%s:%s',definition.id,deployment.id);
  insert into public.growth_lifecycle_state as existing(tenant_id,project_id,subject_type,subject_id,lifecycle_state,
    activation_definition_id,evidence_reference,transitioned_at)
  values(p_tenant,p_project,'user',p_subject,'activated',definition.id,evidence,clock_timestamp())
  on conflict(project_id,subject_type,subject_id) do update set lifecycle_state='activated',activation_definition_id=excluded.activation_definition_id,
    evidence_reference=excluded.evidence_reference,transitioned_at=excluded.transitioned_at
    where existing.tenant_id=p_tenant returning * into lifecycle;
  if not found then raise exception 'activation tenant conflict' using errcode='40001'; end if;
  return jsonb_build_object('activated',true,'lifecycle',to_jsonb(lifecycle),'reason','evidence_verified',
    'basis',jsonb_build_object('definitionId',definition.id,'deploymentId',deployment.id));
end;
$$;
revoke all on function public.evaluate_growth_activation(uuid,uuid,uuid,uuid,text[]) from public,anon,authenticated;
grant execute on function public.evaluate_growth_activation(uuid,uuid,uuid,uuid,text[]) to service_role;
