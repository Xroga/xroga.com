-- Bounded admission for the five remaining direct growth writes. No new tables,
-- dynamic SQL, engine, queue or permissions. Reuse current profile/project/member
-- locking. Existing event/identity/activation/lifecycle transactions are unchanged.
create or replace function public.write_growth_record_admitted(
 p_actor uuid,p_tenant uuid,p_project uuid,p_operation text,p_data jsonb,p_allowed_roles text[],p_basis jsonb default null
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare actor_role text; project_owner uuid; result jsonb; incidents jsonb; deployment jsonb; lifecycle jsonb; suppression jsonb;
begin
 if p_actor is null or p_tenant is null or p_project is null
  or p_operation is null or p_operation not in ('recommend','suppress','attribution','segment','experiment')
  or p_data is null or jsonb_typeof(p_data)<>'object'
  or p_allowed_roles is null or cardinality(p_allowed_roles)=0
  or not p_allowed_roles <@ array['viewer','operator','release_manager','recovery_manager','admin']::text[] then
  raise exception 'invalid growth write' using errcode='22023';
 end if;
 select role into actor_role from public.profiles where id=p_actor for share;
 select user_id into project_owner from public.projects where id=p_project for share;
 if not found or project_owner is distinct from p_tenant then raise exception 'growth is not permitted' using errcode='42501'; end if;
 if actor_role is distinct from 'admin' then
  if p_actor=p_tenant then actor_role:='operator';
  else select role into actor_role from public.operations_memberships
   where project_id=p_project and user_id=p_tenant and member_user_id=p_actor for share;
  end if;
 end if;
 if actor_role is null or not actor_role=any(p_allowed_roles)
  or (p_operation in ('suppress','segment','experiment') and actor_role='viewer') then
  raise exception 'growth is not permitted' using errcode='42501';
 end if;
 if p_operation='recommend' then
  -- Lock and compare the exact evidence used by the existing TS decision policy.
  -- Ownership/revocation and changed parent evidence deny, never silently replan.
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) into incidents from
   (select id,severity,status from public.production_incidents where user_id=p_tenant and project_id=p_project
    and status not in ('resolved','closed','cancelled') for share) r;
  select to_jsonb(r) into deployment from
   (select id,status,verification_state from public.deployment_status where user_id=p_tenant and project_id=p_project order by created_at desc limit 1 for share) r;
  select to_jsonb(r) into lifecycle from
   (select lifecycle_state,evidence_reference from public.growth_lifecycle_state where tenant_id=p_tenant and project_id=p_project
    and subject_type='user' and subject_id=p_actor for share) r;
  select to_jsonb(r) into suppression from
   (select id from public.growth_suppressions where tenant_id=p_tenant and channel='email'
    and address_hash=encode(sha256(convert_to(p_actor::text,'UTF8')),'hex') for share) r;
  if p_basis is distinct from jsonb_build_object('incidents',incidents,'deployment',deployment,'lifecycle',lifecycle,'suppression',suppression) then
   raise exception 'recommendation evidence changed' using errcode='40001';
  end if;
  insert into public.growth_recommendations(tenant_id,project_id,recommendation_type,priority,status,blocker_category,rationale,action_plan,evidence_reference)
   values(p_tenant,p_project,p_data->>'recommendation_type',(p_data->>'priority')::integer,p_data->>'status',p_data->>'blocker_category',p_data->>'rationale',p_data->'action_plan',p_data->>'evidence_reference')
   returning to_jsonb(growth_recommendations.*) into result;
 elsif p_operation='suppress' then
  -- Preserve the existing tenant-wide consent key and API semantics. This is
  -- not a new project-specific suppression policy or permission grant.
  insert into public.growth_suppressions(tenant_id,project_id,channel,address_hash,reason,source_evidence)
   values(p_tenant,p_project,p_data->>'channel',p_data->>'address_hash',p_data->>'reason',p_data->>'source_evidence')
   on conflict(tenant_id,channel,address_hash) do update set project_id=excluded.project_id,reason=excluded.reason,source_evidence=excluded.source_evidence
   returning to_jsonb(growth_suppressions.*) into result;
 elsif p_operation='attribution' then
  insert into public.growth_attribution_touches(tenant_id,project_id,user_id,anonymous_id,touch_type,source,medium,campaign,evidence_reference)
   values(p_tenant,p_project,p_actor,p_data->>'anonymous_id',p_data->>'touch_type',p_data->>'source',p_data->>'medium',p_data->>'campaign',p_data->>'evidence_reference')
   returning to_jsonb(growth_attribution_touches.*) into result;
 elsif p_operation='segment' then
  insert into public.growth_segments(tenant_id,project_id,name,definition,status)
   values(p_tenant,p_project,p_data->>'name',p_data->'definition','active') returning to_jsonb(growth_segments.*) into result;
 else
  insert into public.growth_experiments(tenant_id,project_id,key,status,variants,allocation_seed,minimum_sample_size)
   values(p_tenant,p_project,p_data->>'key','running',p_data->'variants',p_data->>'allocation_seed',(p_data->>'minimum_sample_size')::integer)
   returning to_jsonb(growth_experiments.*) into result;
 end if;
 return result;
end;
$$;
revoke all on function public.write_growth_record_admitted(uuid,uuid,uuid,text,jsonb,text[],jsonb) from public,anon,authenticated;
grant execute on function public.write_growth_record_admitted(uuid,uuid,uuid,text,jsonb,text[],jsonb) to service_role;
