CREATE TABLE public.production_releases (
  id TEXT PRIMARY KEY,
  commit_sha TEXT NOT NULL,
  artifact_digest TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('preview', 'staging', 'production')),
  manifest JSONB NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('created', 'building', 'ready', 'promoted', 'rolled_back', 'failed', 'cancelled')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (environment, artifact_digest)
);

CREATE TABLE public.production_evidence (
  id TEXT PRIMARY KEY,
  release_id TEXT REFERENCES public.production_releases(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('verified', 'degraded', 'blocked', 'unknown')),
  summary TEXT NOT NULL,
  reference TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.production_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL CHECK (status IN ('open', 'acknowledged', 'resolved')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  evidence_ids TEXT[] NOT NULL DEFAULT '{}',
  opened_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE public.webhook_deliveries (
  provider TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  payload_digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  safe_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (provider, delivery_id)
);

CREATE TABLE public.production_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  outcome TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX production_evidence_release_observed_idx ON public.production_evidence(release_id, observed_at DESC);
CREATE INDEX production_incidents_status_opened_idx ON public.production_incidents(status, opened_at DESC);
CREATE INDEX production_audit_created_idx ON public.production_audit_log(created_at DESC);

ALTER TABLE public.production_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_audit_log ENABLE ROW LEVEL SECURITY;

-- Operational records are server-only. Admin API access is checked in the backend;
-- browser roles receive no direct table privileges or policies.
REVOKE ALL ON public.production_releases FROM anon, authenticated;
REVOKE ALL ON public.production_evidence FROM anon, authenticated;
REVOKE ALL ON public.production_incidents FROM anon, authenticated;
REVOKE ALL ON public.webhook_deliveries FROM anon, authenticated;
REVOKE ALL ON public.production_audit_log FROM anon, authenticated;
GRANT ALL ON TABLE public.production_releases, public.production_evidence, public.production_incidents,
  public.webhook_deliveries, public.production_audit_log TO service_role;
