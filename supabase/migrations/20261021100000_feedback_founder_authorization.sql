-- Review-only migration. Do not apply to production before founder access review.
begin;

-- Reuse the existing private authorization schema. Current database identity and
-- role are authoritative, even when a signed session contains older claims.
create or replace function community_private.is_feedback_founder()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
    and exists (
      select 1
      from auth.users u
      join public.profiles p on p.id = u.id
      where u.id = (select auth.uid())
        and lower(btrim(u.email)) = 'hello@xroga.com'
        and u.email_confirmed_at is not null
        and p.role = 'owner'
    );
$$;

revoke all on function community_private.is_feedback_founder() from public, anon;
grant execute on function community_private.is_feedback_founder() to authenticated;

drop policy if exists "Hello account can review product feedback" on public.product_feedback;
drop policy if exists "Verified founder can review product feedback" on public.product_feedback;
create policy "Verified founder can review product feedback"
  on public.product_feedback for select to authenticated
  using ((select community_private.is_feedback_founder()));

-- Keep the founder invariant even if another permissive SELECT policy exists.
drop policy if exists "Feedback founder read guard" on public.product_feedback;
create policy "Feedback founder read guard"
  on public.product_feedback as restrictive for select to authenticated
  using ((select community_private.is_feedback_founder()));

notify pgrst, 'reload schema';
commit;
