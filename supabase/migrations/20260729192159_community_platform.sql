-- Secure public community, public-safe identities, and role-based moderation.
-- Generated with Supabase CLI 2.110.0.

begin;

alter table public.profiles
  add column if not exists username text;

-- The companion migration is ordered immediately after this migration. Add the
-- column here as well because the safe column-level profile grant below must
-- reference an existing column on a brand-new database.
alter table public.profiles
  add column if not exists companion_preferences jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_role_check;

update public.profiles
set role = 'member'
where role is null or role not in ('member', 'moderator', 'admin', 'owner');

alter table public.profiles
  alter column role set default 'member',
  alter column role set not null;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('member', 'moderator', 'admin', 'owner'));

update public.profiles
set username = 'xroga_' || replace(left(id::text, 12), '-', '')
where username is null or btrim(username) = '';

alter table public.profiles
  alter column username set not null;

alter table public.profiles
  drop constraint if exists profiles_username_format_check;

alter table public.profiles
  add constraint profiles_username_format_check
  check (username ~ '^[A-Za-z0-9_]{3,32}$');

create unique index if not exists uq_profiles_username_lower
  on public.profiles (lower(username));

create schema if not exists community_private;
revoke all on schema community_private from public, anon, authenticated;

create or replace function community_private.current_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select role
    from public.profiles
    where id = (select auth.uid())
  ), 'member');
$$;

create or replace function community_private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select community_private.current_role()) in ('moderator', 'admin', 'owner');
$$;

create or replace function community_private.is_admin_or_owner()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select (select community_private.current_role()) in ('admin', 'owner');
$$;

revoke all on function community_private.current_role() from public;
revoke all on function community_private.is_staff() from public;
revoke all on function community_private.is_admin_or_owner() from public;
grant usage on schema community_private to authenticated;
grant execute on function community_private.current_role() to authenticated;
grant execute on function community_private.is_staff() to authenticated;
grant execute on function community_private.is_admin_or_owner() to authenticated;

create or replace function public.current_community_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when (select auth.uid()) is null then 'guest'
    else (select community_private.current_role())
  end;
$$;

revoke all on function public.current_community_role() from public, anon;
grant execute on function public.current_community_role() to authenticated;

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.role is distinct from old.role
     and current_user not in ('postgres', 'service_role', 'supabase_admin')
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'profile role changes require the protected owner workflow'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

revoke all on function public.protect_profile_privileges() from public, anon, authenticated;

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  title text not null,
  body text not null,
  status text not null default 'open',
  is_pinned boolean not null default false,
  is_hidden boolean not null default false,
  is_locked boolean not null default false,
  search_document tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_posts_category_check
    check (category in ('feedback', 'feature_request', 'bug', 'question')),
  constraint community_posts_status_check
    check (status in ('open', 'under_review', 'planned', 'building', 'released', 'solved', 'closed')),
  constraint community_posts_title_length_check
    check (char_length(btrim(title)) between 5 and 150),
  constraint community_posts_body_length_check
    check (char_length(btrim(body)) between 10 and 5000)
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  official_identity text,
  is_accepted_answer boolean not null default false,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_comments_body_length_check
    check (char_length(btrim(body)) between 1 and 5000),
  constraint community_comments_official_identity_check
    check (official_identity is null or official_identity in ('xroga_owner', 'xroga_team', 'xroga_ai_ceo'))
);

create table if not exists public.community_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint community_votes_post_user_unique unique (post_id, user_id)
);

create table if not exists public.community_admin_notes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_admin_notes_length_check
    check (char_length(btrim(note)) between 1 and 5000)
);

create index if not exists idx_community_posts_created
  on public.community_posts (created_at desc, id desc);
create index if not exists idx_community_posts_status_created
  on public.community_posts (status, created_at desc);
create index if not exists idx_community_posts_category_created
  on public.community_posts (category, created_at desc);
create index if not exists idx_community_posts_author_created
  on public.community_posts (author_id, created_at desc);
create index if not exists idx_community_posts_pinned_created
  on public.community_posts (is_pinned desc, created_at desc)
  where is_hidden = false;
create index if not exists idx_community_posts_search
  on public.community_posts using gin (search_document);
create index if not exists idx_community_comments_post_created
  on public.community_comments (post_id, created_at asc);
create index if not exists idx_community_comments_author
  on public.community_comments (author_id, created_at desc);
create index if not exists idx_community_votes_post
  on public.community_votes (post_id);
create index if not exists idx_community_admin_notes_post_created
  on public.community_admin_notes (post_id, created_at desc);

drop trigger if exists community_posts_updated_at on public.community_posts;
create trigger community_posts_updated_at
  before update on public.community_posts
  for each row execute function public.update_updated_at();

drop trigger if exists community_comments_updated_at on public.community_comments;
create trigger community_comments_updated_at
  before update on public.community_comments
  for each row execute function public.update_updated_at();

drop trigger if exists community_admin_notes_updated_at on public.community_admin_notes;
create trigger community_admin_notes_updated_at
  before update on public.community_admin_notes
  for each row execute function public.update_updated_at();

create or replace function public.guard_community_post_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  requester uuid := (select auth.uid());
  service_request boolean := current_user in ('postgres', 'service_role', 'supabase_admin')
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  staff_request boolean := false;
begin
  if service_request then
    return new;
  end if;
  if requester is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  staff_request := (select community_private.is_staff());
  if tg_op = 'INSERT' then
    if new.author_id is distinct from requester then
      raise exception 'post author must match authenticated user' using errcode = '42501';
    end if;
    if not staff_request and (
      new.status <> 'open' or new.is_pinned or new.is_hidden or new.is_locked
    ) then
      raise exception 'members cannot set moderation fields' using errcode = '42501';
    end if;
  elsif new.author_id is distinct from old.author_id then
    raise exception 'post author cannot be changed' using errcode = '42501';
  elsif not staff_request and (
    new.status is distinct from old.status or
    new.is_pinned is distinct from old.is_pinned or
    new.is_hidden is distinct from old.is_hidden or
    new.is_locked is distinct from old.is_locked
  ) then
    raise exception 'members cannot change moderation fields' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_community_comment_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  requester uuid := (select auth.uid());
  service_request boolean := current_user in ('postgres', 'service_role', 'supabase_admin')
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  staff_request boolean := false;
begin
  if service_request then
    return new;
  end if;
  if requester is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  staff_request := (select community_private.is_staff());
  if tg_op = 'INSERT' then
    if new.author_id is distinct from requester then
      raise exception 'comment author must match authenticated user' using errcode = '42501';
    end if;
    if not staff_request and (
      new.official_identity is not null or new.is_accepted_answer or new.is_hidden
    ) then
      raise exception 'members cannot set official or moderation fields' using errcode = '42501';
    end if;
  elsif new.author_id is distinct from old.author_id or new.post_id is distinct from old.post_id then
    raise exception 'comment ownership cannot be changed' using errcode = '42501';
  elsif not staff_request and (
    new.official_identity is distinct from old.official_identity or
    new.is_accepted_answer is distinct from old.is_accepted_answer or
    new.is_hidden is distinct from old.is_hidden
  ) then
    raise exception 'members cannot change official or moderation fields' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_community_post_write on public.community_posts;
create trigger guard_community_post_write
  before insert or update on public.community_posts
  for each row execute function public.guard_community_post_write();

drop trigger if exists guard_community_comment_write on public.community_comments;
create trigger guard_community_comment_write
  before insert or update on public.community_comments
  for each row execute function public.guard_community_comment_write();

revoke all on function public.guard_community_post_write() from public, anon, authenticated;
revoke all on function public.guard_community_comment_write() from public, anon, authenticated;

alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_votes enable row level security;
alter table public.community_admin_notes enable row level security;

drop policy if exists "Community posts are publicly readable" on public.community_posts;
create policy "Community posts are publicly readable"
  on public.community_posts for select
  to anon, authenticated
  using (not is_hidden or (select community_private.is_staff()));

drop policy if exists "Members create their own community posts" on public.community_posts;
create policy "Members create their own community posts"
  on public.community_posts for insert
  to authenticated
  with check (
    (select auth.uid()) is not null and author_id = (select auth.uid()) and (
      (status = 'open' and not is_pinned and not is_hidden and not is_locked) or
      (select community_private.is_staff())
    )
  );

drop policy if exists "Members edit their own community posts" on public.community_posts;
create policy "Members edit their own community posts"
  on public.community_posts for update
  to authenticated
  using ((author_id = (select auth.uid()) and not is_locked) or (select community_private.is_staff()))
  with check ((author_id = (select auth.uid())) or (select community_private.is_staff()));

drop policy if exists "Members or admins delete community posts" on public.community_posts;
create policy "Members or admins delete community posts"
  on public.community_posts for delete
  to authenticated
  using (
    (author_id = (select auth.uid()) and not is_locked) or
    (select community_private.is_admin_or_owner())
  );

drop policy if exists "Community comments are publicly readable" on public.community_comments;
create policy "Community comments are publicly readable"
  on public.community_comments for select
  to anon, authenticated
  using (
    (not is_hidden and exists (
      select 1 from public.community_posts p
      where p.id = post_id and not p.is_hidden
    )) or (select community_private.is_staff())
  );

drop policy if exists "Members create their own community comments" on public.community_comments;
create policy "Members create their own community comments"
  on public.community_comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid()) and (
      (
        official_identity is null and not is_accepted_answer and not is_hidden and
        exists (
          select 1 from public.community_posts p
          where p.id = post_id and not p.is_hidden and not p.is_locked
        )
      ) or (select community_private.is_staff())
    )
  );

drop policy if exists "Members edit their own community comments" on public.community_comments;
create policy "Members edit their own community comments"
  on public.community_comments for update
  to authenticated
  using ((author_id = (select auth.uid())) or (select community_private.is_staff()))
  with check ((author_id = (select auth.uid())) or (select community_private.is_staff()));

drop policy if exists "Members or admins delete community comments" on public.community_comments;
create policy "Members or admins delete community comments"
  on public.community_comments for delete
  to authenticated
  using (
    author_id = (select auth.uid()) or
    (select community_private.is_admin_or_owner())
  );

drop policy if exists "Members read their own votes" on public.community_votes;
create policy "Members read their own votes"
  on public.community_votes for select
  to authenticated
  using (user_id = (select auth.uid()) or (select community_private.is_staff()));

drop policy if exists "Members create their own votes" on public.community_votes;
create policy "Members create their own votes"
  on public.community_votes for insert
  to authenticated
  with check (
    user_id = (select auth.uid()) and exists (
      select 1 from public.community_posts p
      where p.id = post_id and not p.is_hidden
    )
  );

drop policy if exists "Members remove their own votes" on public.community_votes;
create policy "Members remove their own votes"
  on public.community_votes for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Community staff read admin notes" on public.community_admin_notes;
create policy "Community staff read admin notes"
  on public.community_admin_notes for select
  to authenticated
  using ((select community_private.is_staff()));

drop policy if exists "Community staff create admin notes" on public.community_admin_notes;
create policy "Community staff create admin notes"
  on public.community_admin_notes for insert
  to authenticated
  with check (
    (select community_private.is_staff()) and author_id = (select auth.uid())
  );

drop policy if exists "Community staff update their admin notes" on public.community_admin_notes;
create policy "Community staff update their admin notes"
  on public.community_admin_notes for update
  to authenticated
  using ((select community_private.is_staff()) and author_id = (select auth.uid()))
  with check ((select community_private.is_staff()) and author_id = (select auth.uid()));

drop policy if exists "Community admins delete admin notes" on public.community_admin_notes;
create policy "Community admins delete admin notes"
  on public.community_admin_notes for delete
  to authenticated
  using ((select community_private.is_admin_or_owner()));

-- Existing profile policies allowed an authenticated user to update the role
-- column. Replace them with column grants plus strict ownership and a trigger.
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;

create policy "Public can read safe community profile rows"
  on public.profiles for select
  to anon, authenticated
  using (
    id = (select auth.uid()) or exists (
      select 1 from public.community_posts p
      where p.author_id = id and not p.is_hidden
    ) or exists (
      select 1
      from public.community_comments c
      join public.community_posts p on p.id = c.post_id
      where c.author_id = id and not c.is_hidden and not p.is_hidden
    )
  );

create policy "Users update their own safe profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
grant select (id, username, display_name, avatar_url, created_at)
  on public.profiles to anon, authenticated;
grant update (username, display_name, avatar_url, timezone, language, companion_preferences)
  on public.profiles to authenticated;

grant select on public.community_posts, public.community_comments to anon, authenticated;
grant insert, update, delete on public.community_posts, public.community_comments to authenticated;
grant select, insert, delete on public.community_votes to authenticated;
grant select, insert, update, delete on public.community_admin_notes to authenticated;
grant all on public.community_posts, public.community_comments, public.community_votes,
  public.community_admin_notes to service_role;
grant all on public.profiles to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, username, display_name, role)
  values (
    new.id,
    'xroga_' || replace(left(new.id::text, 12), '-', ''),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      'Xroga Builder'
    ),
    'member'
  )
  on conflict (id) do nothing;

  insert into public.user_actions (user_id, plan_tier, total_actions, used_actions, concurrency_limit)
  values (new.id, 'unpaid', 50, 0, 1)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
