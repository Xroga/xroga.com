-- Extend the existing service-only growth transaction pattern. The current
-- actor, project owner and membership stay locked through identity persistence.
create or replace function public.link_growth_identity(
  p_actor uuid,p_tenant uuid,p_project uuid,p_anonymous text,p_evidence text,p_allowed_roles text[]
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare project_owner uuid; actor_role text; identity_row public.growth_identity_links%rowtype;
begin
  if p_actor is null or p_tenant is null or p_project is null or p_anonymous is null
    or length(p_anonymous) not between 8 and 160 or p_evidence is null or length(p_evidence) not between 3 and 500
    or p_allowed_roles is null or cardinality(p_allowed_roles)=0
    or not p_allowed_roles <@ array['viewer','operator','release_manager','recovery_manager','admin']::text[] then
    raise exception 'invalid identity admission' using errcode='22023';
  end if;
  select role into actor_role from public.profiles where id=p_actor for share;
  select user_id into project_owner from public.projects where id=p_project for share;
  if not found or project_owner is distinct from p_tenant then
    raise exception 'identity is not permitted' using errcode='42501';
  end if;
  if actor_role is distinct from 'admin' then
    if p_actor=p_tenant then actor_role:='operator';
    else select role into actor_role from public.operations_memberships
      where project_id=p_project and user_id=p_tenant and member_user_id=p_actor for share;
    end if;
  end if;
  if actor_role is null or not actor_role=any(p_allowed_roles) then
    raise exception 'identity is not permitted' using errcode='42501';
  end if;
  insert into public.growth_identity_links as original(tenant_id,project_id,anonymous_id,user_id,evidence_reference)
    values(p_tenant,p_project,p_anonymous,p_actor,p_evidence)
    on conflict(tenant_id,project_id,anonymous_id) do update
      set evidence_reference=excluded.evidence_reference where original.user_id=p_actor
    returning * into identity_row;
  if not found then raise exception 'identity is already claimed' using errcode='23505'; end if;
  return to_jsonb(identity_row);
end;
$$;
revoke all on function public.link_growth_identity(uuid,uuid,uuid,text,text,text[]) from public,anon,authenticated;
grant execute on function public.link_growth_identity(uuid,uuid,uuid,text,text,text[]) to service_role;
