-- Preserve owned definition updates, but never reassign a conflicting tenant row.
create or replace function public.define_growth_activation(
  p_actor uuid,p_tenant uuid,p_project uuid,p_name text,p_version int,p_events text[],p_allowed_roles text[]
) returns setof public.growth_activation_definitions
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare project_owner uuid; actor_role text; definition public.growth_activation_definitions%rowtype;
begin
  if p_actor is null or p_tenant is null or p_project is null or p_name is null or length(p_name) not between 3 and 120
    or p_version is null or p_version<1 or p_events is null or cardinality(p_events) not between 1 and 20
    or exists(select 1 from unnest(p_events) event_name where event_name is null or event_name='onboarding.started.v1'
      or event_name !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+\.v[1-9][0-9]*$')
    or p_allowed_roles is null or cardinality(p_allowed_roles)=0
    or not p_allowed_roles <@ array['viewer','operator','release_manager','recovery_manager','admin']::text[] then
    raise exception 'invalid activation definition' using errcode='22023';
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
  insert into public.growth_activation_definitions as existing(tenant_id,project_id,name,version,required_event_names,minimum_distinct_events,active)
  values(p_tenant,p_project,p_name,p_version,p_events,cardinality(p_events),true)
  on conflict(project_id,version) do update set name=excluded.name,required_event_names=excluded.required_event_names,
    minimum_distinct_events=excluded.minimum_distinct_events,active=true
    where existing.tenant_id=p_tenant returning * into definition;
  if not found then raise exception 'activation tenant conflict' using errcode='40001'; end if;
  return next definition;
end;
$$;
revoke all on function public.define_growth_activation(uuid,uuid,uuid,text,int,text[],text[]) from public,anon,authenticated;
grant execute on function public.define_growth_activation(uuid,uuid,uuid,text,int,text[],text[]) to service_role;
