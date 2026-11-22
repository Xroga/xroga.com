-- Membership lifecycle adapted from Elenchus (MIT), Kheil-Z/elenchus
-- b6c8f713113474d935f8601e1417a7dc0ac31017. See docs/third-party/elenchus.txt.
-- Service-only RPC; Paid entitlement and verified actor are checked by Xroga's API.
begin;
create table if not exists public.xroga_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists xroga_teams_owner_idx on public.xroga_teams(owner_user_id);

create table if not exists public.xroga_team_members (
  team_id uuid not null references public.xroga_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  status text not null check (status in ('pending', 'active', 'removed', 'declined')),
  invited_by uuid references auth.users(id) on delete set null,
  invited_until timestamptz,
  updated_at timestamptz not null default now(),
  check (role <> 'owner' or status = 'active'),
  check (status <> 'pending' or invited_until is not null),
  primary key (team_id, user_id)
);
create unique index if not exists xroga_team_one_owner_idx on public.xroga_team_members(team_id) where role = 'owner';
create index if not exists xroga_team_members_user_idx on public.xroga_team_members(user_id, status, team_id);
create index if not exists xroga_team_members_inviter_idx on public.xroga_team_members(invited_by);

create table if not exists public.xroga_team_activity (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.xroga_teams(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('create','invite','accept','decline','remove','set_role')),
  created_at timestamptz not null default now()
);
create index if not exists xroga_team_activity_team_idx on public.xroga_team_activity(team_id, created_at desc, id);
create index if not exists xroga_team_activity_actor_idx on public.xroga_team_activity(actor_user_id);
create index if not exists xroga_team_activity_target_idx on public.xroga_team_activity(target_user_id);

alter table public.xroga_teams enable row level security;
alter table public.xroga_team_members enable row level security;
alter table public.xroga_team_activity enable row level security;
-- Client roles have no table grants or policies. Never expose these tables or this RPC
-- to a browser using a user JWT; the authenticated API applies canonical Paid eligibility.
revoke all on public.xroga_teams, public.xroga_team_members, public.xroga_team_activity from public, anon, authenticated;

create schema if not exists xroga_teams_private;
revoke all on schema xroga_teams_private from public, anon, authenticated;
grant usage on schema xroga_teams_private to service_role;
create or replace function xroga_teams_private.confirmed_invitee(p_actor uuid, p_team uuid, p_email text)
returns uuid language sql security definer set search_path = '' as $invitee$
  select u.id from auth.users u
  where lower(u.email)=lower(btrim(p_email)) and u.email_confirmed_at is not null
  and exists (select 1 from public.xroga_team_members m where m.team_id=p_team
    and m.user_id=p_actor and m.status='active' and m.role in ('owner','admin'))
  order by u.id limit 1
$invitee$;
revoke all on function xroga_teams_private.confirmed_invitee(uuid,uuid,text) from public, anon, authenticated;
grant execute on function xroga_teams_private.confirmed_invitee(uuid,uuid,text) to service_role;

create or replace function public.xroga_team_membership(
  p_actor uuid, p_action text, p_team uuid default null, p_value text default null,
  p_target uuid default null, p_request_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $team$
declare
  v_team uuid;
  v_owner uuid;
  v_role text;
  v_target_role text;
  v_target uuid;
  v_result jsonb;
begin
  if p_actor is null then raise exception using errcode = '42501', message = 'Team access denied'; end if;
  if p_action = 'list' then
    select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'role',m.role,'status',m.status)
      order by t.name,t.id),'[]'::jsonb) into v_result
    from public.xroga_team_members m join public.xroga_teams t on t.id=m.team_id
    where m.user_id=p_actor and (m.status='active' or (m.status='pending' and m.invited_until>now()));
    return v_result;
  end if;
  if p_action = 'create' then
    if p_request_id is null or p_value is null or char_length(btrim(p_value)) not between 1 and 80 then
      raise exception using errcode = '22023', message = 'Invalid team details';
    end if;
    insert into public.xroga_teams (id,name,owner_user_id)
      values (p_request_id,btrim(p_value),p_actor) on conflict(id) do nothing returning id into v_team;
    if v_team is null then
      if exists(select 1 from public.xroga_teams where id=p_request_id and owner_user_id=p_actor and name=btrim(p_value)) then
        return jsonb_build_object('id',p_request_id);
      end if;
      raise exception using errcode = '23505', message = 'Team request conflicts';
    end if;
    insert into public.xroga_team_members (team_id,user_id,role,status) values (v_team,p_actor,'owner','active');
    insert into public.xroga_team_activity (team_id,actor_user_id,action) values (v_team,p_actor,'create');
    return jsonb_build_object('id',v_team);
  end if;

  -- The team row serializes all membership transitions, including accept versus removal.
  select owner_user_id into v_owner from public.xroga_teams where id=p_team for update;
  if not found then raise exception using errcode = '42501', message = 'Team access denied'; end if;
  if p_action in ('accept','decline') then
    update public.xroga_team_members set status=case p_action when 'accept' then 'active' else 'declined' end,
      updated_at=now(), invited_until=null
    where team_id=p_team and user_id=p_actor and status='pending' and invited_until>now();
    if not found then raise exception using errcode = '42501', message = 'Team access denied'; end if;
    v_target := p_actor;
  else
    select role into v_role from public.xroga_team_members
      where team_id=p_team and user_id=p_actor and status='active';
    if not found then raise exception using errcode = '42501', message = 'Team access denied'; end if;
    if p_action = 'detail' then
      return jsonb_build_object(
        'members', (select coalesce(jsonb_agg(jsonb_build_object('userId',m.user_id,'role',m.role,
          'status',m.status,'name',coalesce(nullif(p.display_name,''),'Xroga member')) order by m.updated_at,m.user_id),'[]'::jsonb)
          from public.xroga_team_members m left join public.profiles p on p.id=m.user_id
          where m.team_id=p_team and m.status='active'),
        'activity', (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc,e.id),'[]'::jsonb) from (
          select id,actor_user_id,action,created_at from public.xroga_team_activity where team_id=p_team
          and action not in ('invite','decline') order by created_at desc,id limit 30
        ) e));
    end if;
    if v_role not in ('owner','admin') then raise exception using errcode = '42501', message = 'Team access denied'; end if;
    if p_action = 'invite' then
      -- Exact verified account lookup; neither the response nor the team roster lists
      -- recipients before they accept. Invitation activity remains server-only.
      v_target := xroga_teams_private.confirmed_invitee(p_actor,p_team,p_value);
      if v_target is null or v_target in (p_actor,v_owner) then return jsonb_build_object('ok',true); end if;
      insert into public.xroga_team_members (team_id,user_id,role,status,invited_by,invited_until)
        values(p_team,v_target,'member','pending',p_actor,now()+interval '7 days')
      on conflict(team_id,user_id) do update set role='member',status='pending',
        invited_by=p_actor,invited_until=now()+interval '7 days',updated_at=now()
        where xroga_team_members.status in ('removed','declined') or
          (xroga_team_members.status='pending' and xroga_team_members.invited_until<=now());
      if not found then return jsonb_build_object('ok',true); end if;
    elsif p_action in ('remove','set_role') then
      select role into v_target_role from public.xroga_team_members
        where team_id=p_team and user_id=p_target and status in ('active','pending');
      if not found or p_target in (v_owner,p_actor) or (v_role='admin' and v_target_role<>'member') then
        raise exception using errcode = '42501', message = 'Team access denied';
      end if;
      if p_action='set_role' then
        if v_role<>'owner' or p_value is null or p_value not in ('admin','member') then
          raise exception using errcode = '42501', message = 'Team access denied';
        end if;
        update public.xroga_team_members set role=p_value,updated_at=now()
          where team_id=p_team and user_id=p_target and status='active';
        if not found then raise exception using errcode = '42501', message = 'Team access denied'; end if;
      else
        update public.xroga_team_members set status='removed',invited_until=null,updated_at=now()
          where team_id=p_team and user_id=p_target;
      end if;
      v_target := p_target;
    else
      raise exception using errcode = '22023', message = 'Invalid team operation';
    end if;
  end if;
  insert into public.xroga_team_activity (team_id,actor_user_id,target_user_id,action)
    values(p_team,p_actor,v_target,p_action);
  return jsonb_build_object('ok',true);
end;
$team$;
revoke all on function public.xroga_team_membership(uuid,text,uuid,text,uuid,uuid) from public, anon, authenticated;
grant execute on function public.xroga_team_membership(uuid,text,uuid,text,uuid,uuid) to service_role;
grant select,insert on public.xroga_teams, public.xroga_team_activity to service_role;
-- PostgreSQL also requires UPDATE on at least one column for SELECT FOR UPDATE.
grant update (name) on public.xroga_teams to service_role;
grant select,insert,update on public.xroga_team_members to service_role;
commit;
