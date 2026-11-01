-- Contact details are optional. This private flag only suppresses the one-time
-- suggestion; it is never an authentication or authorization decision.
alter table public.profiles add column if not exists contact_phone_prompt_skipped_at timestamptz;
comment on column public.profiles.contact_phone_prompt_skipped_at is
  'Private UX-only dismissal of the optional contact-phone prompt.';
revoke select (contact_phone_prompt_skipped_at), update (contact_phone_prompt_skipped_at)
  on public.profiles from anon, authenticated;

create or replace function public.needs_current_contact_phone_prompt()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.contact_phone is null
      and p.contact_phone_prompt_skipped_at is null
  );
$$;
revoke all on function public.needs_current_contact_phone_prompt() from public, anon;
grant execute on function public.needs_current_contact_phone_prompt() to authenticated;

create or replace function public.skip_current_contact_phone_prompt()
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  update public.profiles
    set contact_phone_prompt_skipped_at = coalesce(contact_phone_prompt_skipped_at, now())
    where id = (select auth.uid()) and contact_phone is null;
  return found;
end;
$$;
revoke all on function public.skip_current_contact_phone_prompt() from public, anon;
grant execute on function public.skip_current_contact_phone_prompt() to authenticated;
notify pgrst, 'reload schema';
