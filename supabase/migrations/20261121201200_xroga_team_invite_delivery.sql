begin;
-- A committed claim precedes every outbound request. No worker retries
-- ambiguous deliveries and no recipient address or credential is stored here.
create table if not exists public.xroga_team_invite_delivery (
  request_id uuid primary key,
  team_id uuid not null references public.xroga_teams(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  state text not null default 'claimed' check (state in ('claimed','accepted','rejected','unknown','revoked'))
);
create index if not exists xroga_invite_delivery_actor_idx on public.xroga_team_invite_delivery(actor_id, claimed_at desc);
create index if not exists xroga_invite_delivery_recipient_idx on public.xroga_team_invite_delivery(recipient_id, claimed_at desc);
create index if not exists xroga_invite_delivery_team_idx on public.xroga_team_invite_delivery(team_id);
alter table public.xroga_team_invite_delivery enable row level security;
revoke all on public.xroga_team_invite_delivery from public, anon, authenticated;
grant select, insert on public.xroga_team_invite_delivery to service_role;
grant update (state) on public.xroga_team_invite_delivery to service_role;

create or replace function public.xroga_team_claim_invite_email(
  p_actor uuid, p_team uuid, p_email text, p_action text, p_request uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $invite$
declare
  v_name text;
  v_role text;
  v_recipient uuid;
  v_member public.xroga_team_members%rowtype;
begin
  if p_actor is null or p_request is null or p_action is null or p_action not in ('invite','resend','revoke') then
    raise exception using errcode='22023', message='Invalid invitation request';
  end if;
  select name into v_name from public.xroga_teams where id=p_team for update;
  if not found then raise exception using errcode='42501', message='Team access denied'; end if;
  select role into v_role from public.xroga_team_members where team_id=p_team and user_id=p_actor and status='active';
  if not found or v_role not in ('owner','admin') then raise exception using errcode='42501', message='Team access denied'; end if;
  v_recipient := xroga_teams_private.confirmed_invitee(p_actor,p_team,p_email);
  if v_recipient is null or v_recipient=p_actor then return jsonb_build_object('claimed',false); end if;
  select * into v_member from public.xroga_team_members where team_id=p_team and user_id=v_recipient;

  -- Separate lock namespaces serialize sender and recipient limits across teams.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_actor::text,2120));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_recipient::text,2121));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,2122));
  if exists(select 1 from public.xroga_team_invite_delivery where request_id=p_request) then
    return jsonb_build_object('claimed',false);
  end if;
  if p_action='revoke' then
    -- Record a no-op as well so replay cannot revoke a later invitation.
    insert into public.xroga_team_invite_delivery(request_id,team_id,actor_id,recipient_id,state)
      values(p_request,p_team,p_actor,v_recipient,'revoked');
    if v_member.status='pending' then
      perform public.xroga_team_membership(p_actor,'remove',p_team,null,v_recipient);
    end if;
    return jsonb_build_object('claimed',false);
  end if;
  if v_member.status='active'
    or (p_action='invite' and v_member.status='pending' and v_member.invited_until>now())
    or (p_action='resend' and (v_member.status is distinct from 'pending' or v_member.invited_until<=now())) then
    return jsonb_build_object('claimed',false);
  end if;

  if (select count(*) from public.xroga_team_invite_delivery where actor_id=p_actor and state<>'revoked' and claimed_at>now()-interval '1 hour')>=10
    or (select count(*) from public.xroga_team_invite_delivery where recipient_id=v_recipient and state<>'revoked' and claimed_at>now()-interval '24 hours')>=3
    or exists(select 1 from public.xroga_team_invite_delivery where team_id=p_team and recipient_id=v_recipient
      and state<>'revoked' and claimed_at>now()-interval '15 minutes') then
    return jsonb_build_object('claimed',false);
  end if;
  if p_action='invite' then perform public.xroga_team_membership(p_actor,'invite',p_team,p_email); end if;
  -- Re-read after creating the invitation; no send when creation became a no-op.
  if not exists(select 1 from public.xroga_team_members where team_id=p_team and user_id=v_recipient
    and status='pending' and invited_until>now()) then return jsonb_build_object('claimed',false); end if;
  insert into public.xroga_team_invite_delivery(request_id,team_id,actor_id,recipient_id)
    values(p_request,p_team,p_actor,v_recipient) on conflict do nothing;
  if not found then return jsonb_build_object('claimed',false); end if;
  return jsonb_build_object('claimed',true,'teamName',v_name);
end;
$invite$;
revoke all on function public.xroga_team_claim_invite_email(uuid,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.xroga_team_claim_invite_email(uuid,uuid,text,text,uuid) to service_role;
commit;
