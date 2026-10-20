-- Personal Vercel credentials have no OAuth callback receipt, so use a dedicated
-- prepare/save epoch. Revocation or another save between the calls wins.
create or replace function public.prepare_direct_oauth_write(p_owner_id uuid,p_provider text)
returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare revision uuid;
begin
  if p_owner_id is null or p_provider<>'vercel' then return null; end if;
  insert into public.user_integrations(user_id,provider,access_token,refresh_token,metadata,credential_revision)
    values(p_owner_id,p_provider,'',null,'{"revoked":true}'::jsonb,gen_random_uuid())
    on conflict(user_id,provider) do nothing;
  select credential_revision into revision from public.user_integrations
    where user_id=p_owner_id and provider=p_provider;
  return revision;
end;
$$;

create or replace function public.save_direct_oauth_connection(p_owner_id uuid,p_provider text,p_revision uuid,
  p_access_token text,p_metadata jsonb,p_provider_user_id text)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare affected integer;
begin
  if p_owner_id is null or p_provider<>'vercel' or p_revision is null
    or p_access_token not like 'vault:v3:%' or length(p_access_token)>180000
    or jsonb_typeof(p_metadata) is distinct from 'object'
    or p_metadata->>'vault_format' is distinct from 'oauth-v1'
    or jsonb_typeof(p_metadata->'vault_revision') is distinct from 'string'
    or (p_metadata->>'vault_revision') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then return false; end if;
  update public.user_integrations set access_token=p_access_token,refresh_token=null,metadata=p_metadata,
    provider_user_id=p_provider_user_id,credential_revision=gen_random_uuid()
    where user_id=p_owner_id and provider=p_provider and credential_revision=p_revision;
  get diagnostics affected=row_count;
  return affected=1;
end;
$$;
revoke all on function public.prepare_direct_oauth_write(uuid,text) from public,anon,authenticated;
revoke all on function public.save_direct_oauth_connection(uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.prepare_direct_oauth_write(uuid,text) to service_role;
grant execute on function public.save_direct_oauth_connection(uuid,text,uuid,text,jsonb,text) to service_role;
