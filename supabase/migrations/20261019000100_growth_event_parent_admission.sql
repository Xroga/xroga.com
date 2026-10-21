-- Command007: extend the existing service-only growth transaction boundary.
-- No backfill, row deletion, new owner constraints or provider effects.
create or replace function public.record_growth_event(
  p_actor uuid,p_tenant uuid,p_project uuid,p_intent jsonb,p_occurred_at timestamptz,p_allowed_roles text[]
) returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare
  project_owner uuid; actor_role text; intent public.analytics_events%rowtype;
  saved public.analytics_events%rowtype; duplicate boolean:=false;
begin
  if p_actor is null or p_tenant is null or p_project is null or jsonb_typeof(p_intent) is distinct from 'object'
    or p_allowed_roles is null or cardinality(p_allowed_roles)=0
    or not p_allowed_roles <@ array['viewer','operator','release_manager','recovery_manager','admin']::text[] then
    raise exception 'invalid event admission' using errcode='22023';
  end if;
  intent:=jsonb_populate_record(null::public.analytics_events,p_intent);
  if intent.user_id is distinct from p_actor or intent.project_id is distinct from p_project
    or intent.idempotency_key is null or intent.event_type is null or intent.event_version is null or intent.event_version<1
    or intent.environment is null or intent.environment not in ('test','preview','production')
    or intent.consent_state is null or intent.consent_state not in ('granted','denied','unknown','not_required')
    or intent.source is null or length(intent.source) not between 1 and 80
    or intent.evidence_reference is null or length(intent.evidence_reference) not between 3 and 500
    or jsonb_typeof(intent.metadata) is distinct from 'object' then
    raise exception 'invalid event intent' using errcode='22023';
  end if;
  select role into actor_role from public.profiles where id=p_actor for share;
  select user_id into project_owner from public.projects where id=p_project for share;
  if not found or project_owner is distinct from p_tenant then
    raise exception 'event is not permitted' using errcode='42501';
  end if;
  if actor_role is distinct from 'admin' then
    if p_actor=p_tenant then actor_role:='operator';
    else select role into actor_role from public.operations_memberships
      where project_id=p_project and user_id=p_tenant and member_user_id=p_actor for share;
    end if;
  end if;
  if actor_role is null or not actor_role=any(p_allowed_roles) then
    raise exception 'event is not permitted' using errcode='42501';
  end if;
  -- Lock the exact tuple, not just the referenced UUID. Historical event labels
  -- may refer to paused/completed campaigns or experiments, so status is not a
  -- new permission. Anonymous/session labels grant no execution authority.
  if intent.campaign_id is not null then
    perform id from public.growth_campaigns where id=intent.campaign_id and tenant_id=p_tenant and project_id=p_project for share;
    if not found then raise exception 'event reference not found' using errcode='P0002'; end if;
  end if;
  if intent.experiment_id is not null then
    perform id from public.growth_experiments where id=intent.experiment_id and tenant_id=p_tenant and project_id=p_project for share;
    if not found then raise exception 'event reference not found' using errcode='P0002'; end if;
  end if;
  if intent.referral_id is not null then
    perform id from public.growth_referral_attribution where referral_id=intent.referral_id and tenant_id=p_tenant and project_id=p_project for share;
    if not found then raise exception 'event reference not found' using errcode='P0002'; end if;
    perform id from public.referrals where id=intent.referral_id for share;
    if not found then raise exception 'event reference not found' using errcode='P0002'; end if;
  end if;
  if intent.release_id is not null then
    perform id from public.production_releases where id=intent.release_id and user_id=p_tenant and project_id=p_project for share;
    if not found then raise exception 'event reference not found' using errcode='P0002'; end if;
  end if;
  if intent.deployment_id is not null then
    perform id from public.deployment_status where id=intent.deployment_id and user_id=p_tenant and project_id=p_project for share;
    if not found then raise exception 'event reference not found' using errcode='P0002'; end if;
  end if;
  insert into public.analytics_events(tenant_id,user_id,project_id,event_type,event_version,idempotency_key,environment,
    anonymous_id,session_id,release_id,deployment_id,campaign_id,referral_id,experiment_id,consent_state,source,evidence_reference,metadata,occurred_at)
  values(p_tenant,p_actor,p_project,intent.event_type,intent.event_version,intent.idempotency_key,intent.environment,
    intent.anonymous_id,intent.session_id,intent.release_id,intent.deployment_id,intent.campaign_id,intent.referral_id,intent.experiment_id,
    intent.consent_state,intent.source,intent.evidence_reference,intent.metadata,coalesce(p_occurred_at,clock_timestamp()))
  on conflict(tenant_id,idempotency_key) where idempotency_key is not null do nothing returning * into saved;
  if not found then
    duplicate:=true;
    select * into saved from public.analytics_events where tenant_id=p_tenant and idempotency_key=intent.idempotency_key for share;
    if not found or not to_jsonb(saved) @> p_intent
      or (p_occurred_at is not null and saved.occurred_at is distinct from p_occurred_at) then
      raise exception 'event key has a different intent' using errcode='23505';
    end if;
  end if;
  return jsonb_build_object('event',to_jsonb(saved),'duplicate',duplicate);
end;
$$;
revoke all on function public.record_growth_event(uuid,uuid,uuid,jsonb,timestamptz,text[]) from public,anon,authenticated;
grant execute on function public.record_growth_event(uuid,uuid,uuid,jsonb,timestamptz,text[]) to service_role;
