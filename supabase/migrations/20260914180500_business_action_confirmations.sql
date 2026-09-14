create table if not exists public.business_action_confirmations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (
      status in (
        'pending',
        'executing',
        'consumed',
        'cancelled',
        'failed',
        'expired'
      )
    ),
  plan jsonb not null,
  plan_digest text not null,
  summary text not null,
  toolkit text not null,
  risk text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  completed_at timestamptz,
  failure_code text
);

create index if not exists business_action_confirmations_user_status_expires_idx
  on public.business_action_confirmations (user_id, status, expires_at);

alter table public.business_action_confirmations enable row level security;

revoke all on public.business_action_confirmations from anon, authenticated;
grant all on public.business_action_confirmations to service_role;
