-- Server-owned connected-app workflow checkpoints. Provider payloads and
-- confirmation plans never become directly readable through the Data API.
alter table public.business_action_confirmations
  add column if not exists execution_result jsonb;

create table if not exists public.business_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request text not null,
  steps jsonb not null,
  outcomes jsonb not null default '[]'::jsonb,
  step_index integer not null default 0 check (step_index >= 0),
  status text not null default 'running'
    check (status in ('running', 'executing', 'awaiting_confirmation', 'setup_required', 'completed', 'failed', 'cancelled')),
  current_confirmation_id uuid references public.business_action_confirmations(id),
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_workflow_runs_user_status_idx
  on public.business_workflow_runs (user_id, status, updated_at desc);
create unique index if not exists business_workflow_runs_confirmation_idx
  on public.business_workflow_runs (current_confirmation_id)
  where current_confirmation_id is not null;

alter table public.business_workflow_runs enable row level security;
revoke all on public.business_workflow_runs from anon, authenticated;
grant all on public.business_workflow_runs to service_role;

-- Durable automation definitions are inert until explicitly enabled. Every
-- run still passes through the same connected-app permission and review gates.
create table if not exists public.business_automation_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  request text not null,
  steps jsonb not null,
  schedule_kind text not null check (schedule_kind in ('interval', 'trigger')),
  interval_seconds integer check (interval_seconds is null or interval_seconds between 3600 and 2592000),
  trigger_id text,
  enabled boolean not null default false,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_automation_schedule_shape check (
    (schedule_kind = 'interval' and interval_seconds is not null and trigger_id is null)
    or (schedule_kind = 'trigger' and trigger_id is not null and interval_seconds is null)
  )
);

create index if not exists business_automation_rules_due_idx
  on public.business_automation_rules (next_run_at)
  where enabled = true and schedule_kind = 'interval';
create unique index if not exists business_automation_rules_trigger_idx
  on public.business_automation_rules (trigger_id)
  where trigger_id is not null;

alter table public.business_automation_rules enable row level security;
revoke all on public.business_automation_rules from anon, authenticated;
grant all on public.business_automation_rules to service_role;

create table if not exists public.business_automation_events (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.business_automation_rules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  workflow_run_id uuid references public.business_workflow_runs(id),
  status text not null default 'claimed' check (status in ('claimed', 'started', 'failed')),
  created_at timestamptz not null default now(),
  unique (rule_id, event_key)
);

alter table public.business_automation_events enable row level security;
revoke all on public.business_automation_events from anon, authenticated;
grant all on public.business_automation_events to service_role;
