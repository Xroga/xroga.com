-- Reuse application deterministicVariant. Only the exact locked experiment
-- snapshot may create a new cohort assignment; existing cohorts remain stable.
create or replace function public.assign_growth_experiment(
  p_actor uuid,p_tenant uuid,p_project uuid,p_expected jsonb,p_subject text,p_variant text,p_allowed_roles text[]
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.growth_experiments%rowtype; experiment public.growth_experiments%rowtype;
  assignment public.growth_experiment_assignments%rowtype; project_owner uuid; actor_role text; replayed boolean:=false;
begin
  if p_actor is null or p_tenant is null or p_project is null or jsonb_typeof(p_expected) is distinct from 'object'
    or p_subject is null or length(p_subject) not between 1 and 160 or p_allowed_roles is null or cardinality(p_allowed_roles)=0
    or not p_allowed_roles <@ array['viewer','operator','release_manager','recovery_manager','admin']::text[] then
    raise exception 'invalid experiment assignment' using errcode='22023';
  end if;
  expected:=jsonb_populate_record(null::public.growth_experiments,p_expected);
  select role into actor_role from public.profiles where id=p_actor for share;
  select user_id into project_owner from public.projects where id=p_project for share;
  if not found or project_owner is distinct from p_tenant then raise exception 'experiment is not permitted' using errcode='42501'; end if;
  if actor_role is distinct from 'admin' then
    if p_actor=p_tenant then actor_role:='operator';
    else select role into actor_role from public.operations_memberships
      where project_id=p_project and user_id=p_tenant and member_user_id=p_actor for share;
    end if;
  end if;
  if actor_role is null or not actor_role=any(p_allowed_roles) then raise exception 'experiment is not permitted' using errcode='42501'; end if;
  select * into experiment from public.growth_experiments where id=expected.id for share;
  if not found or experiment.tenant_id is distinct from p_tenant or experiment.project_id is distinct from p_project then
    raise exception 'experiment unavailable' using errcode='P0002';
  end if;
  if experiment is distinct from expected then raise exception 'experiment changed' using errcode='40001'; end if;
  select * into assignment from public.growth_experiment_assignments where experiment_id=experiment.id and subject_key=p_subject for share;
  if found then replayed:=true;
  else
    if p_variant is null or p_variant='' or jsonb_typeof(experiment.variants) is distinct from 'array' then
      raise exception 'experiment has no eligible variant' using errcode='22023';
    end if;
    if not exists(select 1 from jsonb_array_elements(experiment.variants) variant where variant->>'key'=p_variant
      and jsonb_typeof(variant->'weight')='number' and (variant->>'weight')::numeric>0) then
      raise exception 'experiment variant changed' using errcode='40001';
    end if;
    insert into public.growth_experiment_assignments(experiment_id,tenant_id,subject_key,variant,assigned_at)
      values(experiment.id,p_tenant,p_subject,p_variant,clock_timestamp()) on conflict(experiment_id,subject_key) do nothing returning * into assignment;
    if not found then
      replayed:=true;
      select * into assignment from public.growth_experiment_assignments where experiment_id=experiment.id and subject_key=p_subject for share;
    end if;
  end if;
  if assignment.id is null or assignment.tenant_id is distinct from p_tenant or assignment.experiment_id is distinct from experiment.id
    or assignment.subject_key is distinct from p_subject or assignment.variant is null or assignment.variant='' then
    raise exception 'assignment unavailable' using errcode='P0002';
  end if;
  return jsonb_build_object('assignment',to_jsonb(assignment),'replayed',replayed);
end;
$$;
revoke all on function public.assign_growth_experiment(uuid,uuid,uuid,jsonb,text,text,text[]) from public,anon,authenticated;
grant execute on function public.assign_growth_experiment(uuid,uuid,uuid,jsonb,text,text,text[]) to service_role;
