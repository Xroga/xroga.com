-- Keep anonymous policy evaluation independent from staff-only role helpers.
-- PostgreSQL may evaluate both sides of a policy OR, so an anon policy must not
-- reference a function that is intentionally executable only by authenticated
-- users.

begin;

drop policy if exists "Community posts are publicly readable"
  on public.community_posts;

create policy "Visible community posts are publicly readable"
  on public.community_posts for select
  to anon
  using (not is_hidden);

create policy "Community members read permitted posts"
  on public.community_posts for select
  to authenticated
  using (not is_hidden or (select community_private.is_staff()));

drop policy if exists "Community comments are publicly readable"
  on public.community_comments;

create policy "Visible community comments are publicly readable"
  on public.community_comments for select
  to anon
  using (
    not is_hidden and exists (
      select 1
      from public.community_posts p
      where p.id = post_id and not p.is_hidden
    )
  );

create policy "Community members read permitted comments"
  on public.community_comments for select
  to authenticated
  using (
    (
      not is_hidden and exists (
        select 1
        from public.community_posts p
        where p.id = post_id and not p.is_hidden
      )
    ) or (select community_private.is_staff())
  );

notify pgrst, 'reload schema';

commit;
