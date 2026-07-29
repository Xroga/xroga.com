-- Durable, tenant-owned Xroga companion preferences. Runtime mood and operation
-- evidence remain transient and are never confused with user preferences.
alter table public.profiles
  add column if not exists companion_preferences jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_companion_preferences_object;

alter table public.profiles
  add constraint profiles_companion_preferences_object
  check (jsonb_typeof(companion_preferences) = 'object');

comment on column public.profiles.companion_preferences is
  'Non-secret visual, voice opt-in, accessibility, and optional care preferences for the Xroga companion.';
