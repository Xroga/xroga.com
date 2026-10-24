-- Atomic database-only delivery. External email delivery is deliberately unsupported.
create or replace function public.process_growth_in_app_campaign(p_actor uuid,p_campaign uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare c public.growth_campaigns%rowtype; a public.operations_actions%rowtype;
  s public.growth_segments%rowtype; m public.growth_messages%rowtype; returned_notification public.notifications%rowtype;
  project_id_value uuid; owner_id uuid; actor_role text; member_role text;
  approved_action_id uuid; cohort jsonb; recipient jsonb; notification_id uuid; expected_version integer; expected_receipt text;
  queued integer:=0; suppressed integer:=0; duplicates integer:=0; parts text[];
begin
  if p_actor is null or p_campaign is null then raise exception 'campaign unavailable' using errcode='42501'; end if;
  select coalesce(role,'member') into actor_role from public.profiles where id=p_actor for share;
  if not found then raise exception 'campaign unavailable' using errcode='42501'; end if;
  select project_id into project_id_value from public.growth_campaigns where id=p_campaign;
  if not found then raise exception 'campaign unavailable' using errcode='P0002'; end if;
  select user_id into owner_id from public.projects where id=project_id_value for share;
  if not found then raise exception 'campaign unavailable' using errcode='42501'; end if;
  if p_actor<>owner_id and actor_role<>'admin' then
    select role into member_role from public.operations_memberships
      where project_id=project_id_value and user_id=owner_id and member_user_id=p_actor for share;
    if not found or member_role not in ('operator','release_manager','recovery_manager','admin') then
      raise exception 'campaign unavailable' using errcode='42501';
    end if;
  end if;
  select * into c from public.growth_campaigns where id=p_campaign for update;
  if not found or c.tenant_id is distinct from owner_id or c.project_id is distinct from project_id_value then
    raise exception 'campaign unavailable' using errcode='42501';
  end if;
  if c.channel<>'in_app' then raise exception 'email adapter unavailable' using errcode='0A000'; end if;
  if c.status='completed' and c.evidence_reference ~ '^in_app_atomic_v1:[0-9a-f-]{36}:[0-9]+:[0-9]+:[0-9]+:[0-9]+$' then
    parts:=string_to_array(c.evidence_reference,':');approved_action_id:=parts[2]::uuid;
  elsif c.status='running' and c.evidence_reference ~ '^operations_action:[0-9a-f-]{36}$' then
    approved_action_id:=split_part(c.evidence_reference,':',2)::uuid;
  else raise exception 'verified campaign approval required' using errcode='P0001'; end if;
  select * into a from public.operations_actions where id=approved_action_id for share;
  if not found or a.user_id is distinct from owner_id or a.project_id is distinct from c.project_id
    or a.action_type<>'execute_growth_campaign' or a.target_type<>'growth_campaign' or a.target_id<>c.id::text
    or a.status<>'verified' or a.confirmation_digest is distinct from a.action_plan_digest
    or a.target_version<>c.version-(case when c.status='completed' then 2 else 1 end)
    or a.execution_plan->>'campaignId' is distinct from c.id::text
    or a.execution_plan->>'recipientPolicy' is distinct from 'consented_and_not_suppressed' then
    raise exception 'verified campaign approval required' using errcode='P0001';
  end if;
  perform 1 from public.operations_action_approvals
    where action_id=a.id and user_id=owner_id and decision='approved' and required_role='recovery_manager'
      and approver_id is not null and approver_id<>a.requested_by and requester_id=a.requested_by
      and target_version=a.target_version and action_plan_digest=a.action_plan_digest for share;
  if not found then raise exception 'verified campaign approval required' using errcode='P0001'; end if;
  if c.status='completed' then
    if parts[3]::integer<>c.version then raise exception 'campaign receipt invalid' using errcode='P0001'; end if;
    return jsonb_build_object('campaign_id',c.id,'tenant_id',owner_id,'project_id',c.project_id,'status','completed',
      'version',c.version,'queued',parts[4]::integer,'suppressed',parts[5]::integer,'duplicate',parts[6]::integer,'replayed',true);
  end if;
  select * into s from public.growth_segments where id=c.segment_id for share;
  if not found or s.tenant_id is distinct from owner_id or s.project_id is distinct from c.project_id or s.status<>'active'
    or jsonb_typeof(s.definition->'lifecycleStates') is distinct from 'array' then
    raise exception 'campaign segment unavailable' using errcode='P0001';
  end if;
  -- Consent, suppression and cohort membership share one admission snapshot.
  -- Later revocation is not retroactively applied to an already-admitted delivery.
  select coalesce(jsonb_agg(jsonb_build_object('user_id',r.subject_id,'allowed',
    coalesce((select e.consent_state='granted' from public.analytics_events e
      where e.tenant_id=owner_id and e.project_id=c.project_id and e.user_id=r.subject_id
      order by e.occurred_at desc,e.id desc limit 1),false)
    and not exists(select 1 from public.growth_suppressions x where x.tenant_id=owner_id and x.channel='in_app'
      and x.address_hash=encode(sha256(convert_to(r.subject_id::text,'UTF8')),'hex')))),'[]'::jsonb) into cohort
  from (select subject_id from public.growth_lifecycle_state where tenant_id=owner_id and project_id=c.project_id
    and subject_type='user' and lifecycle_state in (select jsonb_array_elements_text(s.definition->'lifecycleStates'))
    order by subject_id limit 501) r;
  if jsonb_array_length(cohort)>500 then raise exception 'campaign cohort exceeds bounded delivery' using errcode='P0001'; end if;
  for recipient in select value from jsonb_array_elements(cohort) loop
    select * into m from public.growth_messages where campaign_id=c.id and recipient_user_id=(recipient->>'user_id')::uuid for update;
    if found then
      if m.tenant_id is distinct from owner_id or m.project_id is distinct from c.project_id or m.channel<>'in_app'
        or m.provider<>'xroga' or m.template_key is distinct from c.template_key or m.consent_state<>'granted'
        or m.status<>'delivered' or not exists(select 1 from public.notifications n where
          'notification:'||n.id::text=m.evidence_reference and n.user_id=m.recipient_user_id
          and n.metadata->>'growthMessageId'=m.id::text and n.metadata->>'campaignId'=c.id::text) then
        raise exception 'existing delivery requires recovery' using errcode='P0001';
      end if;
      duplicates:=duplicates+1;continue;
    end if;
    if not (recipient->>'allowed')::boolean then suppressed:=suppressed+1;continue;end if;
    insert into public.growth_messages(tenant_id,project_id,campaign_id,recipient_user_id,channel,provider,template_key,recipient_hash,idempotency_key,status,consent_state,attempt_count)
      values(owner_id,c.project_id,c.id,(recipient->>'user_id')::uuid,'in_app','xroga',c.template_key,
        encode(sha256(convert_to(recipient->>'user_id','UTF8')),'hex'),gen_random_uuid(),'submitted','granted',1) returning * into m;
    if m.id is null or m.tenant_id is distinct from owner_id or m.project_id is distinct from c.project_id
      or m.campaign_id is distinct from c.id or m.recipient_user_id is distinct from (recipient->>'user_id')::uuid
      or m.channel<>'in_app' or m.provider<>'xroga' or m.template_key is distinct from c.template_key or m.status<>'submitted' then
      raise exception 'message receipt unavailable' using errcode='P0001';end if;
    insert into public.notifications(user_id,title,message,type,link,metadata,read)
      values(m.recipient_user_id,c.name,'Open Xroga to continue: '||c.template_key,'info','/dashboard/growth',
        jsonb_build_object('growthMessageId',m.id,'campaignId',c.id),false) returning * into returned_notification;
    notification_id:=returned_notification.id;
    if notification_id is null or returned_notification.user_id is distinct from m.recipient_user_id
      or returned_notification.metadata->>'growthMessageId' is distinct from m.id::text or returned_notification.metadata->>'campaignId' is distinct from c.id::text then
      raise exception 'notification receipt unavailable' using errcode='P0001';end if;
    update public.growth_messages set status='delivered',evidence_reference='notification:'||notification_id::text,updated_at=now()
      where id=m.id returning * into m;
    if not found or m.status<>'delivered' or m.evidence_reference is distinct from 'notification:'||notification_id::text
      or m.tenant_id is distinct from owner_id or m.project_id is distinct from c.project_id or m.campaign_id is distinct from c.id
      or m.recipient_user_id is distinct from (recipient->>'user_id')::uuid then
      raise exception 'delivery receipt unavailable' using errcode='P0001';end if;
    queued:=queued+1;
  end loop;
  expected_version:=c.version+1;
  expected_receipt:=concat('in_app_atomic_v1:',a.id,':',expected_version,':',queued,':',suppressed,':',duplicates);
  update public.growth_campaigns set status='completed',version=expected_version,updated_at=now(),evidence_reference=expected_receipt
    where id=c.id returning * into c;
  if not found or c.status<>'completed' or c.version<>expected_version or c.evidence_reference is distinct from expected_receipt then
    raise exception 'campaign receipt unavailable' using errcode='P0001';end if;
  return jsonb_build_object('campaign_id',c.id,'tenant_id',owner_id,'project_id',c.project_id,'status','completed',
    'version',c.version,'queued',queued,'suppressed',suppressed,'duplicate',duplicates,'replayed',false);
end;
$$;
revoke all on function public.process_growth_in_app_campaign(uuid,uuid) from public,anon,authenticated;
grant execute on function public.process_growth_in_app_campaign(uuid,uuid) to service_role;
notify pgrst,'reload schema';
