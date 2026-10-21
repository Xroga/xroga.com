-- Owner-scoped, idempotent v1-to-v3 cutover. This function never decrypts a
-- credential and cannot recreate a revoked or concurrently changed row.
create or replace function public.migrate_provider_key_to_vault(
  p_owner_id uuid,
  p_provider text,
  p_expected_revision uuid,
  p_expected_legacy_token text,
  p_vault_token text,
  p_metadata jsonb
) returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare changed integer;
begin
  if p_owner_id is null or p_provider !~ '^apikey_[a-z_][a-z0-9_]{1,80}$'
    or p_expected_revision is null or p_expected_legacy_token is null
    or p_expected_legacy_token like 'vault:v3:%'
    or p_vault_token not like 'vault:v3:%' or length(p_vault_token)>180000
    or jsonb_typeof(p_metadata) is distinct from 'object'
    or jsonb_typeof(p_metadata->'vault_revision') is distinct from 'string'
    or (p_metadata->>'vault_revision') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce((p_metadata->>'revoked')::boolean,false)
  then return false; end if;

  update public.user_integrations
    set access_token=p_vault_token,
        refresh_token=null,
        metadata=p_metadata,
        credential_revision=gen_random_uuid()
    where user_id=p_owner_id and provider=p_provider
      and credential_revision=p_expected_revision
      and access_token=p_expected_legacy_token
      and access_token not like 'vault:v3:%'
      and coalesce((metadata->>'revoked')::boolean,false)=false;
  get diagnostics changed=row_count;
  return changed=1;
exception when invalid_text_representation then return false;
end;
$$;
revoke all on function public.migrate_provider_key_to_vault(uuid,text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.migrate_provider_key_to_vault(uuid,text,uuid,text,text,jsonb) to service_role;
