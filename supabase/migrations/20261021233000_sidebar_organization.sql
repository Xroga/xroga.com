-- Account-scoped sidebar organization, separate from task execution and message storage.
create table if not exists public.sidebar_sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_sidebar_sections_user_project on public.sidebar_sections(user_id, project_id, position);
alter table public.sidebar_sections enable row level security;
create policy "sidebar_sections_own" on public.sidebar_sections for all to authenticated
 using (user_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
 with check (user_id = (select auth.uid()) and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())));

create table if not exists public.sidebar_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('project','conversation')),
  item_id text not null check (char_length(item_id) between 1 and 140),
  title_override text check (title_override is null or char_length(trim(title_override)) between 1 and 120),
  project_id uuid references public.projects(id) on delete set null,
  section_id uuid references public.sidebar_sections(id) on delete set null,
  pinned_at timestamptz,
  pin_order bigint,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id,item_type,item_id),
  constraint sidebar_pin_both_null_or_set check ((pinned_at is null) = (pin_order is null)),
  constraint sidebar_project_only_conversation check (item_type = 'conversation' or (project_id is null and section_id is null))
);
create index if not exists idx_sidebar_items_pinned on public.sidebar_items(user_id, pin_order) where pinned_at is not null;
create index if not exists idx_sidebar_items_project on public.sidebar_items(user_id, project_id, section_id);
alter table public.sidebar_items enable row level security;
create policy "sidebar_items_own" on public.sidebar_items for all to authenticated
 using (user_id = (select auth.uid()))
 with check (
   user_id = (select auth.uid())
   and (project_id is null or exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
   and (section_id is null or exists (
     select 1 from public.sidebar_sections s where s.id = section_id
       and s.user_id = (select auth.uid()) and s.project_id = project_id
   ))
 );
grant select,insert,update,delete on public.sidebar_items,public.sidebar_sections to authenticated;
-- Retain the existing (user, repository, ordinal) unique index.
-- General chats receive a unique ordinal within the empty-repository namespace;
-- no destructive index change or repository simulation is required.
-- Fix only system-generated ordinal names, using the user's saved text, never fabricated output.
update public.terminal_sessions
set title = left(
  coalesce(nullif(trim(regexp_replace(prompt,'[[:space:]]+',' ','g')),''),
    (select nullif(trim(regexp_replace(m->>'content','[[:space:]]+',' ','g')),'')
     from jsonb_array_elements(case when jsonb_typeof(messages)='array' then messages else '[]'::jsonb end) m
     where m->>'role'='user' limit 1), 'Untitled conversation'), 120)
where title ~* '^(#[0-9]+ terminal|Terminal #[0-9]+|Terminal)$';
notify pgrst, 'reload schema';
