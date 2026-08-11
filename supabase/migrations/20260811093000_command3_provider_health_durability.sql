-- Durable provider health (Command 3 §15).
--
-- Provider health lived in a module-scoped Map, so every deploy, scale event and crash
-- reset it. The state that matters is the circuit breaker: a model whose circuit was opened
-- after repeated authentication failures came back `unknown` on restart and immediately
-- took traffic again. A breaker that resets exactly when a bad deploy lands is not
-- protecting anything.
--
-- One row per model. This is operational state, not history — the row is upserted on state
-- transitions rather than appended, so the table stays at the size of the model registry
-- instead of growing with traffic.

create table if not exists public.model_provider_health (
  model_id text primary key,
  status text not null default 'unknown',
  successes integer not null default 0,
  failures integer not null default 0,
  consecutive_failures integer not null default 0,
  recent_failure_rate double precision not null default 0,
  validation_successes integer not null default 0,
  validation_failures integer not null default 0,
  validation_success_rate double precision not null default 0,
  average_latency_ms integer not null default 0,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  circuit_open_until timestamptz,
  last_failure_kind text,
  updated_at timestamptz not null default now()
);

-- Hydration reads every row at startup, so the only query worth an index is the operational
-- one: which breakers are currently open.
create index if not exists model_provider_health_circuit_open_idx
  on public.model_provider_health (circuit_open_until)
  where circuit_open_until is not null;

-- No tenant owns this table: it describes Xroga's providers, not any customer's data.
-- RLS is enabled with no permissive policy, so the anon and authenticated roles reach
-- nothing here and only the service role — which bypasses RLS — can read or write it.
-- Leaving RLS off would expose provider failure patterns to any authenticated browser
-- session, which is operational detail about Xroga's own infrastructure.
alter table public.model_provider_health enable row level security;

revoke all on public.model_provider_health from anon, authenticated;
