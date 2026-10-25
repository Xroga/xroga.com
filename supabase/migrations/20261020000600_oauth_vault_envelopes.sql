-- OAuth access and refresh tokens are one authenticated CredentialVault payload.
-- The existing credential revision remains the refresh/callback CAS epoch.
create or replace function public.save_oauth_connection(p_owner_id uuid,p_provider text,p_revision uuid,
  p_access_token text,p_refresh_token text,p_metadata jsonb,p_provider_user_id text,p_expected_refresh_token text)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare affected integer; observed uuid; receipt jsonb; session_provider text;
begin
  if p_owner_id is null or p_provider not in ('supabase_oauth','vercel') or p_revision is null
    or p_access_token not like 'vault:v3:%' or length(p_access_token)>180000 or p_refresh_token is not null
    or jsonb_typeof(p_metadata) is distinct from 'object' or p_metadata->>'revoked'='true'
    or jsonb_typeof(p_metadata->'vault_revision') is distinct from 'string'
    or (p_metadata->>'vault_revision') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_metadata->>'vault_format' is distinct from 'oauth-v1' then return false; end if;
  select credential_revision into observed from public.user_integrations
    where user_id=p_owner_id and provider=p_provider for update;
  if observed is distinct from p_revision then return false; end if;
  if p_expected_refresh_token is null then
    session_provider:=case p_provider when 'vercel' then 'vercel_oauth_pkce' else 'supabase_oauth_pkce' end;
    select metadata into receipt from public.user_integrations
      where user_id=p_owner_id and provider=session_provider for update;
    if receipt->>'authorization_revision' is distinct from p_revision::text
      or receipt->>'consumed_at' is null or receipt->>'authorization_expires_at' is null
      or not isfinite((receipt->>'authorization_expires_at')::timestamptz)
      or (receipt->>'authorization_expires_at')::timestamptz<=clock_timestamp() then return false; end if;
  end if;
  -- Refresh callers carry the exact observed credential revision. The old raw
  -- refresh-token predicate is replaced by that CAS because refresh_token is now always null.
  update public.user_integrations set access_token=p_access_token,refresh_token=null,
    metadata=p_metadata,provider_user_id=p_provider_user_id,credential_revision=gen_random_uuid()
    where user_id=p_owner_id and provider=p_provider and credential_revision=p_revision;
  get diagnostics affected=row_count;
  return affected=1;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;
revoke all on function public.save_oauth_connection(uuid,text,uuid,text,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.save_oauth_connection(uuid,text,uuid,text,text,jsonb,text,text) to service_role;
