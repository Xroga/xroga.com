-- Xroga sidebar organization: additive, RLS-protected metadata and non-repo chat recovery.
-- The existing canonical terminal_sessions table and project records remain unchanged.
create table if not exists public.xroga_sidebar_sections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 title text not null check (char_length(btrim(title)) between 1 and 100),
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 unique (user_id,project_id,title)
);
create index if not exists idx_xroga_sidebar_sections_user_project on public.xroga_sidebar_sections(user_id,project_id,sort_order);
alter table public.xroga_sidebar_sections enable row level security;
drop policy if exists "sidebar_sections_own" on public.xroga_sidebar_sections;
create policy "sidebar_sections_own" on public.xroga_sidebar_sections for all to authenticated
 using ((select auth.uid())=user_id and exists(select 1 from public.projects p where p.id=project_id and p.user_id=user_id))
 with check ((select auth.uid())=user_id and exists(select 1 from public.projects p where p.id=project_id and p.user_id=user_id));

create table if not exists public.xroga_sidebar_items (
 user_id uuid not null references auth.users(id) on delete cascade,
 item_type text not null check (item_type in ('conversation','project')),
 item_id text not null check (char_length(item_id) between 1 and 160),
 title_override text check (title_override is null or char_length(title_override) between 1 and 120),
 pin_order bigint,
 archived_at timestamptz,
 project_id uuid references public.projects(id) on delete set null,
 section_id uuid references public.xroga_sidebar_sections(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key (user_id,item_type,item_id),
 check (item_type='conversation' or (project_id is null and section_id is null))
);
create index if not exists idx_xroga_sidebar_items_pins on public.xroga_sidebar_items(user_id,pin_order) where pin_order is not null;
create index if not exists idx_xroga_sidebar_items_project on public.xroga_sidebar_items(user_id,project_id);
alter table public.xroga_sidebar_items enable row level security;
drop policy if exists "sidebar_items_own" on public.xroga_sidebar_items;
create policy "sidebar_items_own" on public.xroga_sidebar_items for all to authenticated
 using ((select auth.uid())=user_id)
 with check (
   (select auth.uid())=user_id
   and (project_id is null or exists(select 1 from public.projects p where p.id=project_id and p.user_id=user_id))
   and (section_id is null or exists(select 1 from public.xroga_sidebar_sections s where s.id=section_id and s.user_id=user_id and s.project_id=project_id))
 );

create table if not exists public.xroga_sidebar_chats (
 user_id uuid not null references auth.users(id) on delete cascade,
 id text not null check (char_length(id) between 1 and 160),
 title text not null default 'Untitled conversation',
 prompt text not null default '',
 preview text not null default '',
 messages jsonb not null default '[]'::jsonb,
 kind text not null default 'chat',
 status text not null default 'active',
 message_count integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (user_id,id)
);
create index if not exists idx_xroga_sidebar_chats_recent on public.xroga_sidebar_chats(user_id,updated_at desc);
alter table public.xroga_sidebar_chats enable row level security;
drop policy if exists "sidebar_chats_own" on public.xroga_sidebar_chats;
create policy "sidebar_chats_own" on public.xroga_sidebar_chats for all to authenticated
 using ((select auth.uid())=user_id)
 with check ((select auth.uid())=user_id);

grant select, insert, update, delete on public.xroga_sidebar_sections, public.xroga_sidebar_items, public.xroga_sidebar_chats to authenticated,service_role;
notify pgrst, 'reload schema';

-- Atomic, owner-checked pin reordering. Invoker rights preserve the table's RLS policies.
create or replace function public.xroga_swap_sidebar_pins(
 p_first_type text,p_first_id text,p_second_type text,p_second_id text)
returns void language plpgsql security invoker set search_path=public as $$
declare a_order bigint; b_order bigint;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_first_type=p_second_type and p_first_id=p_second_id then return; end if;
 select pin_order into a_order from public.xroga_sidebar_items
  where user_id=auth.uid() and item_type=p_first_type and item_id=p_first_id
  for update;
 select pin_order into b_order from public.xroga_sidebar_items
  where user_id=auth.uid() and item_type=p_second_type and item_id=p_second_id
  for update;
 if a_order is null or b_order is null then raise exception 'Both items must be pinned'; end if;
 update public.xroga_sidebar_items set pin_order=b_order,updated_at=now()
  where user_id=auth.uid() and item_type=p_first_type and item_id=p_first_id;
 update public.xroga_sidebar_items set pin_order=a_order,updated_at=now()
  where user_id=auth.uid() and item_type=p_second_type and item_id=p_second_id;
end;
$$;
revoke all on function public.xroga_swap_sidebar_pins(text,text,text,text) from public,anon;
grant execute on function public.xroga_swap_sidebar_pins(text,text,text,text) to authenticated;
