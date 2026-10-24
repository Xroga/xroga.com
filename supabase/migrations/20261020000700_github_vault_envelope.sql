-- GitHub OAuth writes use one CredentialVault envelope in both existing rows.
-- The user_integrations row remains the authorization and revocation authority.
create or replace function public.save_github_oauth_connection(p_owner_id uuid,p_revision uuid,
  p_access_token text,p_provider_user_id text,p_username text,p_repo_strategy text,p_default_repo text,
  p_vault_revision uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare observed uuid; receipt jsonb;
begin
  if p_owner_id is null or p_revision is null or p_vault_revision is null
    or p_access_token not like 'vault:v3:%' or length(p_access_token)>180000
    or p_username is null or length(trim(p_username))=0
    or p_provider_user_id is null or length(p_provider_user_id)=0
    or p_repo_strategy not in ('auto','monorepo','manual') then return false; end if;
  select credential_revision into observed from public.user_integrations
    where user_id=p_owner_id and provider='github' for update;
  if observed is distinct from p_revision then return false; end if;
  select metadata into receipt from public.user_integrations
    where user_id=p_owner_id and provider='github_oauth_pkce' for update;
  if receipt->>'authorization_revision' is distinct from p_revision::text
    or receipt->>'consumed_at' is null or receipt->>'authorization_expires_at' is null
    or not isfinite((receipt->>'authorization_expires_at')::timestamptz)
    or (receipt->>'authorization_expires_at')::timestamptz<=clock_timestamp() then return false; end if;
  update public.user_integrations set access_token=p_access_token,refresh_token=null,
    provider_user_id=p_provider_user_id,metadata=jsonb_build_object('username',p_username,
      'vault_revision',p_vault_revision,'vault_format','github-oauth-v1'),credential_revision=gen_random_uuid()
    where user_id=p_owner_id and provider='github' and credential_revision=p_revision;
  if not found then return false; end if;
  insert into public.github_integrations(user_id,access_token,repo_strategy,default_repo,github_username)
    values(p_owner_id,p_access_token,p_repo_strategy,p_default_repo,p_username)
    on conflict(user_id) do update set access_token=excluded.access_token,refresh_token=null,expires_at=null,
      repo_strategy=excluded.repo_strategy,default_repo=excluded.default_repo,github_username=excluded.github_username;
  return true;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;
revoke all on function public.save_github_oauth_connection(uuid,uuid,text,text,text,text,text) from service_role;
revoke all on function public.save_github_oauth_connection(uuid,uuid,text,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.save_github_oauth_connection(uuid,uuid,text,text,text,text,text,uuid) to service_role;
