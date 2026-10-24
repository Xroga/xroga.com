-- Preserve the existing managed transition API with current authority, an owned
-- conflict predicate and a per-row atomic version increment.
create or replace function public.transition_growth_lifecycle(
  p_actor uuid,p_tenant uuid,p_project uuid,p_subject_type text,p_subject uuid,p_state text,p_evidence text,p_allowed_roles text[]
) returns setof public.growth_lifecycle_state
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare project_owner uuid; actor_role text; lifecycle public.growth_lifecycle_state%rowtype;
begin
  if p_actor is null or p_tenant is null or p_project is null or p_subject is null
    or p_subject_type is null or p_subject_type not in ('user','product')
    or p_state is null or p_state not in ('defined','onboarding','activated','launched','retained','at_risk','reactivated','paused','blocked')
    or p_evidence is null or length(p_evidence) not between 3 and 500
    or p_allowed_roles is null or cardinality(p_allowed_roles)=0
    or not p_allowed_roles <@ array['viewer','operator','release_manager','recovery_manager','admin']::text[] then
    raise exception 'invalid lifecycle transition' using errcode='22023';
  end if;
  select role into actor_role from public.profiles where id=p_actor for share;
  select user_id into project_owner from public.projects where id=p_project for share;
  if not found or project_owner is distinct from p_tenant then raise exception 'lifecycle is not permitted' using errcode='42501'; end if;
  if actor_role is distinct from 'admin' then
    if p_actor=p_tenant then actor_role:='operator';
    else select role into actor_role from public.operations_memberships
      where project_id=p_project and user_id=p_tenant and member_user_id=p_actor for share;
    end if;
  end if;
  if actor_role is null or not actor_role=any(p_allowed_roles) then raise exception 'lifecycle is not permitted' using errcode='42501'; end if;
  insert into public.growth_lifecycle_state as existing(tenant_id,project_id,subject_type,subject_id,lifecycle_state,version,evidence_reference,transitioned_at)
  values(p_tenant,p_project,p_subject_type,p_subject,p_state,1,p_evidence,clock_timestamp())
  on conflict(project_id,subject_type,subject_id) do update set lifecycle_state=excluded.lifecycle_state,
    version=coalesce(existing.version,0)+1,evidence_reference=excluded.evidence_reference,transitioned_at=clock_timestamp()
    where existing.tenant_id=p_tenant and coalesce(existing.version,0)>=0 returning * into lifecycle;
  if not found then raise exception 'lifecycle tenant or version conflict' using errcode='40001'; end if;
  return next lifecycle;
end;
$$;
revoke all on function public.transition_growth_lifecycle(uuid,uuid,uuid,text,uuid,text,text,text[]) from public,anon,authenticated;
grant execute on function public.transition_growth_lifecycle(uuid,uuid,uuid,text,uuid,text,text,text[]) to service_role;
