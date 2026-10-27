-- Durable record of Xroga browser runs: the canonical execution state, the validated run spec, and a cancel flag any instance can set
-- and any runner can read. Additive and expand-only: nothing here changes an existing table or function.
--
-- Why a table of its own: `execution_runs` writes are fenced to a `swarm_runs` attempt (persist_execution_checkpoint_attempt), which a
-- browser run does not have. Reusing that store for a browser run made its first checkpoint fail, so the run could not be persisted.
-- This table holds the same CanonicalExecutionState document and is written only by the API with the service role.
CREATE TABLE IF NOT EXISTS public.browser_runs (
  run_id uuid PRIMARY KEY,
  tenant_id text NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
  user_id text NOT NULL CHECK (length(user_id) BETWEEN 1 AND 128),
  project_key text NOT NULL CHECK (length(project_key) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'blocked', 'cancelled')),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  spec jsonb NOT NULL CHECK (jsonb_typeof(spec) = 'object'),
  cancel_requested_at timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS browser_runs_tenant_active_idx ON public.browser_runs (tenant_id) WHERE status IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS browser_runs_recover_idx ON public.browser_runs (updated_at) WHERE status IN ('queued', 'running');

ALTER TABLE public.browser_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.browser_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.browser_runs TO service_role;
