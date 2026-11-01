-- A contact number is deliberately not auth.users.phone: no SMS challenge or
-- phone-based login is enabled. Never treat this unverified value as identity.
alter table public.profiles add column if not exists contact_phone text;
alter table public.profiles drop constraint if exists profiles_contact_phone_format;
alter table public.profiles add constraint profiles_contact_phone_format
  check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{7,14}$');
comment on column public.profiles.contact_phone is
  'Unverified contact-only E.164 number; never an authentication factor.';

-- Existing public community-profile grants intentionally exclude contact_phone.
revoke select (contact_phone), update (contact_phone) on public.profiles from anon, authenticated;

-- Email signup supplies this value at account creation. OAuth signup cannot
-- supply it until the provider returns, so the contact step fills it afterward.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare supplied_phone text;
begin
  supplied_phone := new.raw_user_meta_data ->> 'contact_phone';
  if supplied_phone is not null and supplied_phone !~ '^\+[1-9][0-9]{7,14}$' then
    supplied_phone := null;
  end if;
  insert into public.profiles (id, username, display_name, role, contact_phone)
  values (
    new.id,
    'xroga_' || replace(left(new.id::text, 12), '-', ''),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), 'Xroga Builder'),
    'member', supplied_phone
  ) on conflict (id) do nothing;
  insert into public.user_actions (user_id, plan_tier, total_actions, used_actions, concurrency_limit)
  values (new.id, 'free', 50, 0, 1) on conflict (user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.has_current_contact_phone()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.contact_phone is not null
  );
$$;
revoke all on function public.has_current_contact_phone() from public, anon;
grant execute on function public.has_current_contact_phone() to authenticated;

create or replace function public.save_current_contact_phone(p_contact_phone text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_contact_phone is null or p_contact_phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use an international contact number';
  end if;
  update public.profiles set contact_phone = p_contact_phone
  where id = (select auth.uid());
  return found;
end;
$$;
revoke all on function public.save_current_contact_phone(text) from public, anon;
grant execute on function public.save_current_contact_phone(text) to authenticated;
notify pgrst, 'reload schema';
