-- Admit the existing capability only against the exact current runtime session.
-- Resolution still independently checks signature, revocation and live target.
create or replace function public.create_project_preview_grant(p_owner uuid,p_grant jsonb,p_session jsonb)
returns setof public.project_preview_grants
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare expected public.project_preview_grants%rowtype; session_row public.project_runtime_sessions%rowtype;
  admission_time timestamptz;
begin
  if p_owner is null or jsonb_typeof(p_grant) is distinct from 'object' or jsonb_typeof(p_session) is distinct from 'object' then
    raise exception 'invalid preview grant' using errcode='22023';
  end if;
  expected:=jsonb_populate_record(null::public.project_preview_grants,p_grant);
  if expected.preview_id is null or expected.user_id is distinct from p_owner or expected.project_id is null or expected.project_id=''
    or expected.session_id is null or expected.session_id='' or expected.run_id is null or expected.run_id=''
    or expected.preview_kind is null or expected.preview_kind not in ('browser','api','terminal','logs','extension','mobile','desktop','mcp','ai')
    or expected.port is null or expected.port not between 1 and 65535 or expected.expires_at is null or not isfinite(expected.expires_at)
    or expected.revoked_at is not null then
    raise exception 'invalid preview grant' using errcode='22023';
  end if;
  select * into session_row from public.project_runtime_sessions
    where session_id=expected.session_id and user_id=p_owner for share;
  if not found or session_row.project_id is distinct from expected.project_id then
    raise exception 'preview session is not permitted' using errcode='42501';
  end if;
  if session_row.state is distinct from p_session or session_row.status<>'running' or session_row.runtime_class<>'interactive'
    or p_session->>'userId' is distinct from p_owner::text or p_session->>'projectId' is distinct from expected.project_id
    or p_session->>'sessionId' is distinct from expected.session_id or p_session->>'status' is distinct from session_row.status
    or p_session->>'runtimeClass' is distinct from session_row.runtime_class or p_session->>'providerId' is distinct from session_row.provider_id then
    raise exception 'preview session changed' using errcode='40001';
  end if;
  if jsonb_typeof(p_session->'ports') is distinct from 'array' then
    raise exception 'preview port changed' using errcode='40001';
  end if;
  if not exists(select 1 from jsonb_array_elements(p_session->'ports') as port
    where port->'port'=to_jsonb(expected.port) and port->>'protocol'='http' and port->>'status' in ('declared','listening')) then
    raise exception 'preview port changed' using errcode='40001';
  end if;
  -- Sample after the row lock. Expiry while waiting must not issue a capability.
  admission_time:=clock_timestamp();
  if expected.expires_at<=admission_time
    or (session_row.expires_at is not null and (not isfinite(session_row.expires_at) or session_row.expires_at<=admission_time))
    or (p_session->>'expiresAt' is not null and (not isfinite((p_session->>'expiresAt')::timestamptz)
      or (p_session->>'expiresAt')::timestamptz<=admission_time)) then
    raise exception 'preview session expired' using errcode='40001';
  end if;
  return query insert into public.project_preview_grants(preview_id,user_id,project_id,session_id,run_id,preview_kind,port,expires_at,created_at)
  values(expected.preview_id,p_owner,expected.project_id,expected.session_id,expected.run_id,expected.preview_kind,expected.port,expected.expires_at,admission_time)
  returning *;
end;
$$;
revoke all on function public.create_project_preview_grant(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_project_preview_grant(uuid,jsonb,jsonb) to service_role;
