-- Command 3B: canonical Product Operations Centre state.
-- Additive only. Browser roles cannot access operational records directly;
-- authenticated API routes enforce ownership and permissions server-side.

CREATE TABLE IF NOT EXISTS public.operations_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  member_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer','operator','release_manager','recovery_manager','admin')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, member_user_id)
);

CREATE TABLE IF NOT EXISTS public.operations_environments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  environment_key TEXT NOT NULL,
  environment_type TEXT NOT NULL CHECK (environment_type IN ('local','test','preview','development','staging','production','sandbox','testnet','mainnet')),
  provider TEXT,
  region TEXT,
  desired_release_id TEXT,
  observed_release_id TEXT,
  observed_commit_sha TEXT,
  status TEXT NOT NULL DEFAULT 'unknown',
  status_reason TEXT,
  source TEXT NOT NULL DEFAULT 'repository',
  observed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  stale_after TIMESTAMPTZ,
  reconciliation_state TEXT NOT NULL DEFAULT 'unknown' CHECK (reconciliation_state IN ('matched','inconsistent','pending','unknown')),
  restrictions JSONB NOT NULL DEFAULT '{}',
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, environment_key)
);

CREATE TABLE IF NOT EXISTS public.operations_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES public.operations_environments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'service','dependency','domain','certificate','integration','health_check','workflow_check',
    'worker','job','queue','webhook','migration','schema_drift','backup','restore_test','provider_status',
    'configuration','slo','capacity','log_source','metric_source','trace_source','error_source','blockchain'
  )),
  provider TEXT NOT NULL DEFAULT 'internal',
  external_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  desired_state JSONB NOT NULL DEFAULT '{}',
  observed_state JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'unknown',
  status_reason TEXT,
  source TEXT NOT NULL,
  evidence_reference TEXT,
  observed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  stale_after TIMESTAMPTZ,
  reconciliation_state TEXT NOT NULL DEFAULT 'unknown' CHECK (reconciliation_state IN ('matched','inconsistent','pending','unknown')),
  metadata JSONB NOT NULL DEFAULT '{}',
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, environment_id, kind, provider, external_id)
);

CREATE TABLE IF NOT EXISTS public.operations_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES public.operations_environments(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  permission_required TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('read_only','low','medium','high','critical')),
  status TEXT NOT NULL CHECK (status IN (
    'requested','precondition_check','confirmation_required','approval_required','approved',
    'queued','running','verification_required','verified','failed','cancelled','expired','blocked'
  )),
  idempotency_key TEXT NOT NULL,
  target_version BIGINT NOT NULL,
  action_plan_digest TEXT NOT NULL,
  preconditions JSONB NOT NULL DEFAULT '[]',
  execution_plan JSONB NOT NULL DEFAULT '{}',
  rollback_plan JSONB NOT NULL DEFAULT '{}',
  verification_plan JSONB NOT NULL DEFAULT '{}',
  status_reason TEXT,
  confirmation_digest TEXT,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempt_count INT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INT NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  evidence_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.operations_action_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID NOT NULL REFERENCES public.operations_actions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  required_role TEXT NOT NULL,
  approver_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending','approved','rejected','expired','cancelled','executed','execution_failed')),
  reason TEXT,
  target_version BIGINT NOT NULL,
  action_plan_digest TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  decided_at TIMESTAMPTZ,
  evidence_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (action_id, required_role)
);

CREATE TABLE IF NOT EXISTS public.operations_action_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID NOT NULL REFERENCES public.operations_actions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt INT NOT NULL CHECK (attempt > 0),
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','verified','failed','cancelled','blocked')),
  error_category TEXT,
  safe_error TEXT,
  provider_reference TEXT,
  evidence_reference TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (action_id, attempt)
);

CREATE TABLE IF NOT EXISTS public.operations_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES public.operations_environments(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low','informational')),
  status TEXT NOT NULL CHECK (status IN ('active','acknowledged','suppressed','resolved','expired','invalid')),
  deduplication_key TEXT NOT NULL,
  occurrence_count INT NOT NULL DEFAULT 1,
  incident_id UUID REFERENCES public.production_incidents(id) ON DELETE SET NULL,
  status_reason TEXT,
  evidence_reference TEXT,
  first_observed_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL,
  suppressed_until TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, deduplication_key)
);

CREATE TABLE IF NOT EXISTS public.operations_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES public.operations_environments(id) ON DELETE CASCADE,
  rule_key TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '{}',
  exclusions JSONB NOT NULL DEFAULT '{}',
  risk_level TEXT NOT NULL CHECK (risk_level IN ('read_only','low','medium','high','critical')),
  action_type TEXT NOT NULL,
  approval_policy JSONB NOT NULL DEFAULT '{}',
  retry_policy JSONB NOT NULL DEFAULT '{"maxAttempts":3,"backoffMs":1000}',
  rate_limit JSONB NOT NULL DEFAULT '{"maxRuns":3,"windowSeconds":3600}',
  stop_condition JSONB NOT NULL DEFAULT '{}',
  escalation_policy JSONB NOT NULL DEFAULT '{}',
  verification_plan JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  emergency_stopped BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, rule_key, version)
);

CREATE TABLE IF NOT EXISTS public.operations_automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.operations_automation_rules(id) ON DELETE CASCADE,
  trigger_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('evaluating','action_created','approval_required','verified','failed','blocked','rate_limited','stopped')),
  action_id UUID REFERENCES public.operations_actions(id) ON DELETE SET NULL,
  evidence_reference TEXT,
  safe_error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (rule_id, trigger_digest)
);

CREATE TABLE IF NOT EXISTS public.operations_maintenance_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES public.operations_environments(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  allowed_actions TEXT[] NOT NULL DEFAULT '{}',
  blocked_actions TEXT[] NOT NULL DEFAULT '{}',
  approval_id UUID REFERENCES public.operations_action_approvals(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','active','completed','cancelled')),
  version BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.operations_config_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES public.operations_environments(id) ON DELETE CASCADE,
  variable_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  present BOOLEAN NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('verified','missing','wrong_environment','stale','unknown','external_setup_required')),
  restart_required BOOLEAN NOT NULL DEFAULT FALSE,
  redeploy_required BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_reference TEXT,
  verified_at TIMESTAMPTZ,
  stale_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, environment_id, variable_name, provider)
);

CREATE TABLE IF NOT EXISTS public.operations_slo_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES public.operations_environments(id) ON DELETE CASCADE,
  objective_key TEXT NOT NULL,
  objective NUMERIC,
  observation_window TEXT,
  current_result NUMERIC,
  sample_count BIGINT,
  status TEXT NOT NULL CHECK (status IN ('met','breached','insufficient_data','not_configured')),
  error_budget_remaining NUMERIC,
  source TEXT NOT NULL,
  observed_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  stale_after TIMESTAMPTZ,
  evidence_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.production_releases
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS environment_id UUID REFERENCES public.operations_environments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch TEXT,
  ADD COLUMN IF NOT EXISTS build_id TEXT,
  ADD COLUMN IF NOT EXISTS config_version TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stale_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.production_evidence
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS environment_id UUID REFERENCES public.operations_environments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS action_id UUID REFERENCES public.operations_actions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stale_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

ALTER TABLE public.production_incidents
  DROP CONSTRAINT IF EXISTS production_incidents_status_check;
ALTER TABLE public.production_incidents
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS environment_id UUID REFERENCES public.operations_environments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS detection_source TEXT,
  ADD COLUMN IF NOT EXISTS user_impact TEXT,
  ADD COLUMN IF NOT EXISTS affected_services TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS release_id TEXT REFERENCES public.production_releases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deployment_id UUID REFERENCES public.deployment_status(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS recovery_evidence_reference TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.production_incidents
  ADD CONSTRAINT production_incidents_status_check CHECK (status IN ('detected','investigating','identified','mitigating','monitoring','resolved','closed','cancelled','externally_blocked','open','acknowledged'));

ALTER TABLE public.deployment_status
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS environment_id UUID REFERENCES public.operations_environments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS release_id TEXT REFERENCES public.production_releases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_state TEXT,
  ADD COLUMN IF NOT EXISTS runtime_state TEXT,
  ADD COLUMN IF NOT EXISTS application_state TEXT,
  ADD COLUMN IF NOT EXISTS verification_state TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'provider',
  ADD COLUMN IF NOT EXISTS evidence_reference TEXT,
  ADD COLUMN IF NOT EXISTS observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stale_after TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_category TEXT,
  ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 1;

ALTER TABLE public.webhook_deliveries
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS environment_id UUID REFERENCES public.operations_environments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS signature_verified BOOLEAN,
  ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS response_status INT,
  ADD COLUMN IF NOT EXISTS related_object TEXT,
  ADD COLUMN IF NOT EXISTS evidence_reference TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.production_audit_log
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS environment_id UUID REFERENCES public.operations_environments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS before_state JSONB,
  ADD COLUMN IF NOT EXISTS after_state JSONB,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS evidence_reference TEXT;

ALTER TABLE public.swarm_job_queue
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS error_category TEXT,
  ADD COLUMN IF NOT EXISTS safe_error TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS operations_job_idempotency_idx
  ON public.swarm_job_queue(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS operations_memberships_member_idx
  ON public.operations_memberships(member_user_id, project_id);
CREATE INDEX IF NOT EXISTS operations_env_portfolio_idx
  ON public.operations_environments(user_id, updated_at DESC, status);
CREATE INDEX IF NOT EXISTS operations_resource_portfolio_idx
  ON public.operations_resources(user_id, project_id, environment_id, kind, status);
CREATE INDEX IF NOT EXISTS operations_resource_freshness_idx
  ON public.operations_resources(stale_after) WHERE stale_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS operations_action_status_idx
  ON public.operations_actions(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS operations_approval_pending_idx
  ON public.operations_action_approvals(user_id, decision, expires_at);
CREATE INDEX IF NOT EXISTS operations_alert_active_idx
  ON public.operations_alerts(user_id, status, severity, last_observed_at DESC);
CREATE INDEX IF NOT EXISTS operations_maintenance_active_idx
  ON public.operations_maintenance_windows(user_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS operations_evidence_tenant_idx
  ON public.production_evidence(user_id, project_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS operations_audit_tenant_idx
  ON public.production_audit_log(user_id, project_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.operations_reject_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'operational audit history is immutable';
END;
$$;

DROP TRIGGER IF EXISTS operations_audit_immutable ON public.production_audit_log;
CREATE TRIGGER operations_audit_immutable
  BEFORE UPDATE OR DELETE ON public.production_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.operations_reject_audit_mutation();

CREATE OR REPLACE FUNCTION public.operations_claim_action(
  p_action_id UUID,
  p_lease_owner TEXT,
  p_lease_seconds INT DEFAULT 60
) RETURNS SETOF public.operations_actions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended(p_action_id::text, 0)) THEN
    RETURN;
  END IF;
  RETURN QUERY
  UPDATE public.operations_actions
     SET status = 'running', lease_owner = p_lease_owner,
         lease_expires_at = NOW() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 10), 600)),
         attempt_count = attempt_count + 1,
         started_at = COALESCE(started_at, NOW()), updated_at = NOW()
   WHERE id = p_action_id
     AND status IN ('queued','approved')
     AND attempt_count < max_attempts
     AND (lease_expires_at IS NULL OR lease_expires_at < NOW())
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.operations_claim_action(UUID, TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operations_claim_action(UUID, TEXT, INT) TO service_role;
REVOKE ALL ON FUNCTION public.operations_reject_audit_mutation() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.operations_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_environments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_action_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_action_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_maintenance_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_config_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations_slo_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.operations_memberships, public.operations_environments, public.operations_resources, public.operations_actions,
  public.operations_action_approvals, public.operations_action_runs, public.operations_alerts,
  public.operations_automation_rules, public.operations_automation_runs, public.operations_maintenance_windows,
  public.operations_config_checks, public.operations_slo_snapshots FROM anon, authenticated;
GRANT ALL ON public.operations_memberships, public.operations_environments, public.operations_resources, public.operations_actions,
  public.operations_action_approvals, public.operations_action_runs, public.operations_alerts,
  public.operations_automation_rules, public.operations_automation_runs, public.operations_maintenance_windows,
  public.operations_config_checks, public.operations_slo_snapshots TO service_role;

COMMENT ON TABLE public.operations_resources IS 'Canonical typed operational state; missing measurements remain unknown/unavailable, never inferred healthy.';
COMMENT ON TABLE public.operations_actions IS 'Durable, idempotent, lease-protected operational mutations with approval and verification gates.';
COMMENT ON TABLE public.operations_config_checks IS 'Secret-presence and validation posture only; secret values are forbidden.';
