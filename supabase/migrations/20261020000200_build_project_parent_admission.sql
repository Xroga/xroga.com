-- Reuse the canonical project save. Keep required build messages with the owned
-- parent transaction and preserve in-progress until file receipts are complete.
begin;
create or replace function public.save_owned_build_project_atomic(
  p_owner_id uuid,p_expected_id uuid,p_project jsonb,p_build jsonb
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare saved public.projects%rowtype; message_row public.project_messages%rowtype;
  canonical jsonb; messages jsonb:='[]'; repo text:=p_project->>'github_repo_name';
begin
  if p_owner_id is null or jsonb_typeof(p_project) is distinct from 'object'
    or jsonb_typeof(p_build) is distinct from 'object'
    or jsonb_typeof(p_build->'user_prompt') is distinct from 'string'
    or exists(select 1 from jsonb_each(p_build) e where e.key not in ('user_prompt','summary_text','run_id','deploy_url','github_branch')
      or jsonb_typeof(e.value) is distinct from 'string')
    or p_project ? 'user_prompt' then
    raise exception 'invalid build project request' using errcode='22023';
  end if;
  -- Identical order/key to save_owned_project_atomic, reentrant in this transaction.
  if repo is not null and repo<>'' then
    perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text||':'||repo,0));
  end if;
  if p_expected_id is not null then
    select * into saved from public.projects where id=p_expected_id and user_id=p_owner_id for update;
    if not found or saved.github_repo_name is distinct from repo then
      raise exception 'build project parent changed' using errcode='42501';
    end if;
  end if;
  canonical:=public.save_owned_project_atomic(p_owner_id,p_project);
  if jsonb_typeof(canonical->'project') is distinct from 'object'
    or canonical->'project'->>'user_id' is distinct from p_owner_id::text
    or (p_expected_id is not null and canonical->'project'->>'id' is distinct from p_expected_id::text) then
    raise exception 'build project receipt changed' using errcode='40001';
  end if;
  update public.projects set status='in_progress' where id=(canonical->'project'->>'id')::uuid and user_id=p_owner_id
    returning * into saved;
  if not found then raise exception 'build project parent changed' using errcode='42501'; end if;
  insert into public.project_messages(project_id,role,content,metadata)
    values(saved.id,'user',left(p_build->>'user_prompt',8000),jsonb_strip_nulls(jsonb_build_object(
      'runId',p_build->>'run_id','deployUrl',p_build->>'deploy_url','githubRepoName',repo,
      'githubBranch',coalesce(p_build->>'github_branch','main'),'source','build'))) returning * into message_row;
  messages:=messages||jsonb_build_array(to_jsonb(message_row));
  if btrim(coalesce(p_build->>'summary_text',''))<>'' then
    insert into public.project_messages(project_id,role,content,metadata)
      values(saved.id,'assistant',left(p_build->>'summary_text',12000),jsonb_strip_nulls(jsonb_build_object(
        'deployUrl',p_build->>'deploy_url','githubRepoName',repo,'source','build_summary'))) returning * into message_row;
    messages:=messages||jsonb_build_array(to_jsonb(message_row));
  end if;
  return jsonb_build_object('created',canonical->'created','project',to_jsonb(saved),'messages',messages);
end;
$$;
revoke all on function public.save_owned_build_project_atomic(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.save_owned_build_project_atomic(uuid,uuid,jsonb,jsonb) to service_role;

-- Keep the existing file-delivery metadata/epoch/browser policy. Its parent read
-- must hold a row lock through the file write and recheck the post-wait owner.
create or replace function public.guard_project_file_delivery_metadata()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare owner_id uuid;
begin
  select p.user_id into owner_id from public.projects p where p.id=NEW.project_id for share;
  if not found then raise exception 'file_project_parent_unavailable' using errcode='42501'; end if;
  if NEW.storage_metadata is not null and NEW.storage_metadata->>'ownerId' is distinct from owner_id::text then
    raise exception 'file_storage_owner_mismatch' using errcode='42501';
  end if;
  if NEW.delivery_version<1 or (TG_OP='UPDATE' and NEW.delivery_version<OLD.delivery_version) then
    raise exception 'invalid_file_delivery_epoch' using errcode='42501';
  end if;
  if current_user not in ('service_role','postgres','supabase_admin') then
    if owner_id is distinct from auth.uid() then raise exception 'file_project_owner_changed' using errcode='42501'; end if;
    if (TG_OP='INSERT' and (NEW.storage_metadata is not null or NEW.delivery_version<>1))
      or (TG_OP='UPDATE' and (NEW.storage_metadata is distinct from OLD.storage_metadata or NEW.delivery_version is distinct from OLD.delivery_version)) then
      raise exception 'file_delivery_metadata_is_server_owned' using errcode='42501';
    end if;
  end if;
  return NEW;
end;
$$;
revoke all on function public.guard_project_file_delivery_metadata() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
