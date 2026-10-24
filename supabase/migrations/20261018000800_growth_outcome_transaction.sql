-- Preserve the existing view-level recording permission while checking current
-- authority and all parent relationships in the outcome write transaction.
create or replace function public.record_growth_experiment_outcome(
  p_actor uuid,p_tenant uuid,p_project uuid,p_experiment uuid,p_assignment uuid,p_event uuid,p_metric text
) returns setof public.growth_experiment_outcomes
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare actor_role text; owner_id uuid; experiment public.growth_experiments%rowtype;
  assignment public.growth_experiment_assignments%rowtype; event public.analytics_events%rowtype;
  outcome public.growth_experiment_outcomes%rowtype;
begin
  if p_actor is null or p_tenant is null or p_project is null or p_experiment is null
    or p_assignment is null or p_event is null or p_metric is null
    or p_metric !~ '^[a-z0-9][a-z0-9_.-]{1,79}$' then
    raise exception 'invalid experiment outcome' using errcode='22023';
  end if;
  select role into actor_role from public.profiles where id=p_actor for share;
  select user_id into owner_id from public.projects where id=p_project for share;
  if not found or owner_id is distinct from p_tenant then
    raise exception 'experiment unavailable' using errcode='P0002';
  end if;
  if actor_role is distinct from 'admin' and p_actor<>owner_id then
    select role into actor_role from public.operations_memberships
      where project_id=p_project and user_id=owner_id and member_user_id=p_actor for share;
    if not found or actor_role not in ('viewer','operator','release_manager','recovery_manager','admin') then
      raise exception 'experiment recording is not permitted' using errcode='42501';
    end if;
  end if;
  select * into experiment from public.growth_experiments where id=p_experiment for share;
  if not found or experiment.tenant_id is distinct from p_tenant or experiment.project_id is distinct from p_project then
    raise exception 'experiment unavailable' using errcode='P0002';
  end if;
  select * into assignment from public.growth_experiment_assignments where id=p_assignment for share;
  if not found or assignment.experiment_id is distinct from p_experiment or assignment.tenant_id is distinct from p_tenant then
    raise exception 'assignment unavailable' using errcode='P0002';
  end if;
  if assignment.exposed_at is null then raise exception 'outcome requires exposure' using errcode='P0001'; end if;
  select * into event from public.analytics_events where id=p_event for share;
  if not found or event.tenant_id is distinct from p_tenant or event.project_id is distinct from p_project
    or event.experiment_id is distinct from p_experiment then
    raise exception 'outcome event unavailable' using errcode='P0002';
  end if;
  insert into public.growth_experiment_outcomes(experiment_id,assignment_id,event_id,metric_key)
    values(p_experiment,p_assignment,p_event,p_metric)
    on conflict(assignment_id,event_id,metric_key) do nothing returning * into outcome;
  if not found then
    select * into outcome from public.growth_experiment_outcomes
      where assignment_id=p_assignment and event_id=p_event and metric_key=p_metric for share;
  end if;
  if outcome.id is null or outcome.experiment_id is distinct from p_experiment then
    raise exception 'outcome replay changed' using errcode='40001';
  end if;
  return next outcome;
end;
$$;
revoke all on function public.record_growth_experiment_outcome(uuid,uuid,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_growth_experiment_outcome(uuid,uuid,uuid,uuid,uuid,uuid,text) to service_role;
