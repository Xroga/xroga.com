-- Durable post-signup onboarding state, owned by the account it describes.
--
-- One jsonb column rather than a table: the shape is a handful of flags read once
-- per session to answer "where should this account land", it has no rows of its own
-- to accumulate, and it belongs to exactly one profile. That matches how the
-- companion's preferences are stored a few migrations back.
alter table public.profiles
  add column if not exists onboarding jsonb not null default '{}'::jsonb;

alter table public.profiles
  drop constraint if exists profiles_onboarding_object;

alter table public.profiles
  add constraint profiles_onboarding_object
  check (jsonb_typeof(onboarding) = 'object');

-- Every account that already exists predates onboarding, so an empty object here
-- would read as "never started" and route the whole userbase through a flow meant
-- for new signups on their next login. They are marked complete instead.
--
-- `backfilled` records that this was inferred rather than observed, so the two are
-- never confused later: nobody in this set actually chose a project type.
update public.profiles
set onboarding = jsonb_build_object(
  'status', 'completed',
  'current_step', 'complete',
  'backfilled', true
)
where onboarding = '{}'::jsonb;

comment on column public.profiles.onboarding is
  'Post-signup onboarding progress: status, current step, chosen project type and optional role, and whether GitHub/Vercel were connected or skipped. Non-secret; integration credentials live with their own providers.';
