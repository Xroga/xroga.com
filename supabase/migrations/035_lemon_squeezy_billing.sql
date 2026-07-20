-- Lemon Squeezy customer id for platform billing (Paddle column kept for legacy rows)
alter table public.profiles
  add column if not exists lemon_squeezy_customer_id text;

create index if not exists profiles_lemon_customer_idx
  on public.profiles (lemon_squeezy_customer_id)
  where lemon_squeezy_customer_id is not null;
