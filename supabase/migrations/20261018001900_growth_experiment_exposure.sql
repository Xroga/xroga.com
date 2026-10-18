-- Serialize first exposure and return the durable winner on concurrent retries.
create or replace function public.expose_growth_experiment(
  p_actor uuid,p_tenant uuid,p_project uuid,p_expected jsonb,p_evidence text,p_allowed_roles text[]
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.growth_experiment_assignments%rowtype; assignment public.growth_experiment_assignments%rowtype;
  experiment public.growth_experiments%rowtype; project_owner uuid; actor_role text; replayed boolean;
begin
  if p_actor is null or p_tenant is null or p_project is null or jsonb_typeof(p_expected) is distinct from 'object'
    or p_evidence is null or length(p_evidence) not between 1 and 500 or p_allowed_roles is null or cardinality(p_allowed_roles)=0
    or not p_allowed_roles <@ array['viewer','operator','release_manager','recovery_manager','admin']::text[] then
    raise exception 'invalid experiment exposure' using errcode='22023';
  end if;
  expected:=jsonb_populate_record(null::public.growth_experiment_assignments,p_expected);
  select role into actor_role from public.profiles where id=p_actor for share;
  select user_id into project_owner from public.projects where id=p_project for share;
  if not found or project_owner is distinct from p_tenant then raise exception 'exposure is not permitted' using errcode='42501'; end if;
  if actor_role is distinct from 'admin' then
    if p_actor=p_tenant then actor_role:='operator';
    else select role into actor_role from public.operations_memberships
      where project_id=p_project and user_id=p_tenant and member_user_id=p_actor for share;
    end if;
  end if;
  if actor_role is null or not actor_role=any(p_allowed_roles) then raise exception 'exposure is not permitted' using errcode='42501'; end if;
  select * into experiment from public.growth_experiments where id=expected.experiment_id for share;
  if not found or experiment.tenant_id is distinct from p_tenant or experiment.project_id is distinct from p_project then
    raise exception 'experiment unavailable' using errcode='P0002';
  end if;
  select * into assignment from public.growth_experiment_assignments where id=expected.id for update;
  if not found or assignment.tenant_id is distinct from p_tenant or assignment.experiment_id is distinct from experiment.id then
    raise exception 'assignment unavailable' using errcode='P0002';
  end if;
  if row(assignment.id,assignment.experiment_id,assignment.tenant_id,assignment.subject_key,assignment.variant,assignment.assigned_at)
    is distinct from row(expected.id,expected.experiment_id,expected.tenant_id,expected.subject_key,expected.variant,expected.assigned_at)
    or (expected.exposed_at is not null and row(assignment.exposed_at,assignment.evidence_reference) is distinct from row(expected.exposed_at,expected.evidence_reference)) then
    raise exception 'assignment changed' using errcode='40001';
  end if;
  replayed:=assignment.exposed_at is not null;
  if not replayed then
    update public.growth_experiment_assignments set exposed_at=clock_timestamp(),evidence_reference=p_evidence
      where id=assignment.id returning * into assignment;
  end if;
  return jsonb_build_object('assignment',to_jsonb(assignment),'replayed',replayed);
end;
$$;
revoke all on function public.expose_growth_experiment(uuid,uuid,uuid,jsonb,text,text[]) from public,anon,authenticated;
grant execute on function public.expose_growth_experiment(uuid,uuid,uuid,jsonb,text,text[]) to service_role;
