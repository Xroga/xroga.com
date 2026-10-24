-- PKCE verifiers are short-lived, one-use CredentialVault envelopes. State and
-- redirect metadata remain queryable for the atomic TTL admission.
create or replace function public.begin_oauth_session(p_owner_id uuid,p_provider text,p_session jsonb)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
declare target text; epoch uuid;
begin
  target:=case p_provider when 'supabase_oauth_pkce' then 'supabase_oauth'
    when 'vercel_oauth_pkce' then 'vercel' when 'cws_oauth_pkce' then 'apikey_cws_oauth'
    when 'github_oauth_pkce' then 'github' end;
  if p_owner_id is null or target is null or jsonb_typeof(p_session) is distinct from 'object'
    or jsonb_typeof(p_session->'verifier') is distinct from 'string'
    or p_session->>'verifier' not like 'vault:v3:%' or length(p_session->>'verifier')>180000
    or jsonb_typeof(p_session->'state') is distinct from 'string' or length(p_session->>'state') not between 16 and 512
    or jsonb_typeof(p_session->'redirect_uri') is distinct from 'string' or length(p_session->>'redirect_uri')=0
    or jsonb_typeof(p_session->'vault_revision') is distinct from 'string'
    or (p_session->>'vault_revision') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or p_session->>'vault_format' is distinct from 'pkce-v1' then return false; end if;
  insert into public.user_integrations(user_id,provider,access_token,metadata,credential_revision)
    values(p_owner_id,target,'','{"revoked":true}'::jsonb,gen_random_uuid())
    on conflict(user_id,provider) do update set credential_revision=gen_random_uuid()
    returning credential_revision into epoch;
  insert into public.user_integrations(user_id,provider,access_token,refresh_token,metadata)
    values(p_owner_id,p_provider,p_session->>'verifier',null,
      (p_session-'verifier'-'revoked'-'authorization_revision')||jsonb_build_object(
        'created_at',clock_timestamp(),'authorization_revision',epoch))
    on conflict(user_id,provider) do update set access_token=excluded.access_token,
      refresh_token=null,metadata=excluded.metadata,credential_revision=gen_random_uuid();
  return true;
end;
$$;

create or replace function public.consume_oauth_session(p_owner_id uuid,p_provider text,p_state text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare session public.user_integrations%rowtype; created timestamptz; result jsonb; target text; epoch uuid;
begin
  if p_owner_id is null or p_provider not in
    ('vercel_oauth_pkce','supabase_oauth_pkce','cws_oauth_pkce','github_oauth_pkce')
    or p_state is null or length(p_state)<16 or length(p_state)>512 then return null; end if;
  target:=case p_provider when 'supabase_oauth_pkce' then 'supabase_oauth'
    when 'vercel_oauth_pkce' then 'vercel' when 'cws_oauth_pkce' then 'apikey_cws_oauth'
    when 'github_oauth_pkce' then 'github' end;
  select credential_revision into epoch from public.user_integrations
    where user_id=p_owner_id and provider=target for update;
  if not found then return null; end if;
  select * into session from public.user_integrations
    where user_id=p_owner_id and provider=p_provider for update;
  if not found or session.access_token not like 'vault:v3:%'
    or session.metadata->>'state' is distinct from p_state or session.metadata->>'revoked'='true'
    or jsonb_typeof(session.metadata->'created_at') is distinct from 'string'
    or jsonb_typeof(session.metadata->'redirect_uri') is distinct from 'string'
    or length(session.metadata->>'redirect_uri')=0
    or session.metadata->>'authorization_revision' is distinct from epoch::text
    or session.metadata->>'vault_format' is distinct from 'pkce-v1'
    or jsonb_typeof(session.metadata->'vault_revision') is distinct from 'string' then return null; end if;
  created:=(session.metadata->>'created_at')::timestamptz;
  if not isfinite(created) or created>clock_timestamp()
    or created<=clock_timestamp()-interval '10 minutes' then return null; end if;
  result:=jsonb_build_object('verifier',session.access_token,'state',p_state,
    'redirect_uri',session.metadata->>'redirect_uri','created_at',session.metadata->>'created_at',
    'authorization_revision',epoch,'vault_revision',session.metadata->>'vault_revision','vault_format','pkce-v1');
  if session.metadata ? 'nonce' then result:=result||jsonb_build_object('nonce',session.metadata->'nonce'); end if;
  update public.user_integrations set access_token='',refresh_token=null,
    credential_revision=gen_random_uuid(),metadata=jsonb_build_object('revoked',true,'consumed_at',clock_timestamp(),
      'authorization_revision',epoch,'authorization_expires_at',created+interval '10 minutes') where id=session.id;
  return result;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end;
$$;
revoke all on function public.begin_oauth_session(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.consume_oauth_session(uuid,text,text) from public,anon,authenticated;
grant execute on function public.begin_oauth_session(uuid,text,jsonb) to service_role;
grant execute on function public.consume_oauth_session(uuid,text,text) to service_role;
