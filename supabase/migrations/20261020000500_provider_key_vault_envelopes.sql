-- New provider-key writes use CredentialVault v3 envelopes. Keep v1 readable for
-- a bounded legacy migration, but never allow an unknown version or plaintext.
create or replace function public.save_provider_key_if_current(
  p_owner_id uuid,p_provider text,p_revision uuid,p_access_token text,p_metadata jsonb
) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare changed integer;
begin
  if p_owner_id is null or p_provider is null or p_provider !~ '^apikey_[a-z_][a-z0-9_]{1,80}$'
    or p_revision is null or p_access_token is null
    or not (p_access_token like 'vault:v3:%' or p_access_token like 'v1:%')
    or length(p_access_token)<8 or length(p_access_token)>180000
    or jsonb_typeof(p_metadata) is distinct from 'object'
  then return false; end if;
  if jsonb_typeof(p_metadata->'provider') is distinct from 'string'
    or not ((p_provider !~ '^apikey_custom_' and (p_metadata->>'provider')=substring(p_provider from 8))
      or ((p_metadata->>'provider')='custom' and p_provider ~ '^apikey_custom_[a-z_][a-z0-9_]{1,63}$'
        and p_provider='apikey_custom_'||lower(p_metadata->>'env_var')))
    or jsonb_typeof(p_metadata->'env_var') is distinct from 'string'
    or (p_metadata->>'env_var') !~ '^[A-Z_][A-Z0-9_]{1,63}$'
    or jsonb_typeof(p_metadata->'masked') is distinct from 'string' or length(p_metadata->>'masked')>32
    or jsonb_typeof(p_metadata->'connected_at') is distinct from 'string'
    or jsonb_typeof(p_metadata->'type') is distinct from 'string'
    or (p_metadata->>'type') not in ('user_publish_credential','supabase_provision','user_api_key')
    or jsonb_typeof(p_metadata->'sync_target') is distinct from 'string'
    or (p_metadata->>'sync_target') not in ('eas','xroga_server','vercel')
    or (p_access_token like 'vault:v3:%' and
      (jsonb_typeof(p_metadata->'vault_revision') is distinct from 'string'
        or (p_metadata->>'vault_revision') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
    or (p_access_token like 'v1:%' and p_metadata ? 'vault_revision')
    or exists(select 1 from jsonb_object_keys(p_metadata) k where k not in
      ('type','provider','env_var','sync_target','connected_at','masked','vault_revision'))
  then return false; end if;
  if not isfinite((p_metadata->>'connected_at')::timestamptz) then return false; end if;
  update public.user_integrations set access_token=p_access_token,metadata=p_metadata,
    credential_revision=gen_random_uuid()
    where user_id=p_owner_id and provider=p_provider and credential_revision=p_revision;
  get diagnostics changed=row_count;
  return changed=1;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end;
$$;
revoke all on function public.save_provider_key_if_current(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_provider_key_if_current(uuid,text,uuid,text,jsonb) to service_role;
