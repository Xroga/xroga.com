-- The existing internal adapter supplies admitted owner/project authority.
-- Increment each current rule version. A project-wide command must never reset
-- newer rules to the command's project placeholder version.
create or replace function public.set_operations_automation_stop(
  p_owner uuid,p_project uuid,p_target uuid,p_version bigint,p_stopped boolean
) returns table(id uuid)
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare rule_id uuid;
begin
  if p_owner is null or p_project is null or p_target is null or p_stopped is null
    or (p_target<>p_project and (p_version is null or p_version<1)) then
    raise exception 'invalid automation control' using errcode='22023';
  end if;
  perform 1 from public.projects as project where project.id=p_project and project.user_id=p_owner for share;
  if not found then raise exception 'automation project is not permitted' using errcode='42501'; end if;
  -- Descending versions avoid transient unique collisions when retained rows
  -- share a rule_key. Every affected row still changes in this one transaction.
  for rule_id in select rule.id from public.operations_automation_rules as rule
    where rule.user_id=p_owner and rule.project_id=p_project
      and (p_target=p_project or (rule.id=p_target and rule.version=p_version))
    order by rule.rule_key,rule.version desc,rule.id for update
  loop
    return query update public.operations_automation_rules as rule
      set emergency_stopped=p_stopped,version=rule.version+1,updated_at=clock_timestamp()
      where rule.id=rule_id returning rule.id;
  end loop;
end;
$$;
revoke all on function public.set_operations_automation_stop(uuid,uuid,uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function public.set_operations_automation_stop(uuid,uuid,uuid,bigint,boolean) to service_role;
