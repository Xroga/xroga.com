-- Command 3C: evolve the existing analytics event log into the canonical,
-- tenant-safe growth runtime. All writes are server-side; browser roles have
-- no direct table access and secrets are never stored in event payloads.

ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS event_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS anonymous_id TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS release_id TEXT REFERENCES public.production_releases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deployment_id UUID REFERENCES public.deployment_status(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campaign_id UUID,
  ADD COLUMN IF NOT EXISTS referral_id UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS experiment_id UUID,
  ADD COLUMN IF NOT EXISTS consent_state TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'server',
  ADD COLUMN IF NOT EXISTS evidence_reference TEXT,
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.analytics_events DROP CONSTRAINT IF EXISTS analytics_events_environment_check;
ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_environment_check CHECK (environment IN ('test','preview','production'));
ALTER TABLE public.analytics_events DROP CONSTRAINT IF EXISTS analytics_events_consent_state_check;
ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_consent_state_check CHECK (consent_state IN ('granted','denied','unknown','not_required'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_analytics_events_idempotency ON public.analytics_events (tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_events_project_time ON public.analytics_events (project_id, occurred_at DESC) WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.growth_identity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  anonymous_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evidence_reference TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, project_id, anonymous_id)
);

CREATE TABLE IF NOT EXISTS public.growth_activation_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  name TEXT NOT NULL,
  required_event_names TEXT[] NOT NULL,
  minimum_distinct_events INTEGER NOT NULL DEFAULT 1 CHECK (minimum_distinct_events > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, version)
);

CREATE TABLE IF NOT EXISTS public.growth_lifecycle_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user','product')),
  subject_id UUID NOT NULL,
  lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('defined','onboarding','activated','launched','retained','at_risk','reactivated','paused','blocked')),
  activation_definition_id UUID REFERENCES public.growth_activation_definitions(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  evidence_reference TEXT NOT NULL,
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, subject_type, subject_id)
);

CREATE TABLE IF NOT EXISTS public.growth_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  environment_id UUID REFERENCES public.operations_environments(id) ON DELETE SET NULL,
  recommendation_type TEXT NOT NULL,
  priority INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 100),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approval_required','approved','executed','measured','suppressed','blocked','expired')),
  blocker_category TEXT,
  rationale TEXT NOT NULL,
  action_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_id UUID REFERENCES public.operations_action_approvals(id) ON DELETE SET NULL,
  evidence_reference TEXT NOT NULL,
  outcome_event_id UUID REFERENCES public.analytics_events(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.growth_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','in_app')),
  address_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('unsubscribed','bounced','complained','manual','consent_denied')),
  source_evidence TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, channel, address_hash)
);

CREATE TABLE IF NOT EXISTS public.growth_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  definition JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  evaluated_at TIMESTAMPTZ,
  evidence_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, name, version)
);

CREATE TABLE IF NOT EXISTS public.growth_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  segment_id UUID REFERENCES public.growth_segments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','in_app')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approval_required','approved','scheduled','running','paused','cancelled','completed','blocked')),
  template_key TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  approval_id UUID REFERENCES public.operations_action_approvals(id) ON DELETE SET NULL,
  consent_required BOOLEAN NOT NULL DEFAULT TRUE,
  evidence_reference TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.growth_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.growth_campaigns(id) ON DELETE SET NULL,
  recipient_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','in_app')),
  provider TEXT NOT NULL,
  template_key TEXT NOT NULL,
  recipient_hash TEXT NOT NULL,
  idempotency_key UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','submitted','provider_accepted','delivered','opened','clicked','bounced','complained','suppressed','failed','unknown')),
  provider_message_id TEXT,
  consent_state TEXT NOT NULL CHECK (consent_state IN ('granted','denied','not_required')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  next_attempt_at TIMESTAMPTZ,
  evidence_reference TEXT,
  last_error_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_growth_message_campaign_recipient ON public.growth_messages (campaign_id, recipient_user_id) WHERE campaign_id IS NOT NULL AND recipient_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.growth_referral_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  referral_id UUID NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  qualification_status TEXT NOT NULL DEFAULT 'pending' CHECK (qualification_status IN ('pending','qualified','rejected','suspicious_review')),
  evidence_reference TEXT NOT NULL,
  qualified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, referral_id)
);

CREATE TABLE IF NOT EXISTS public.growth_experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed','cancelled')),
  variants JSONB NOT NULL,
  allocation_seed TEXT NOT NULL,
  minimum_sample_size INTEGER NOT NULL CHECK (minimum_sample_size > 0),
  guardrails JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, key, version)
);

CREATE TABLE IF NOT EXISTS public.growth_experiment_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.growth_experiments(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_key TEXT NOT NULL,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exposed_at TIMESTAMPTZ,
  evidence_reference TEXT,
  UNIQUE (experiment_id, subject_key)
);

CREATE TABLE IF NOT EXISTS public.growth_experiment_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id UUID NOT NULL REFERENCES public.growth_experiments(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES public.growth_experiment_assignments(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.analytics_events(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, event_id, metric_key)
);

CREATE TABLE IF NOT EXISTS public.growth_attribution_touches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anonymous_id TEXT,
  touch_type TEXT NOT NULL CHECK (touch_type IN ('first','recent','utm','referral','unknown')),
  source TEXT,
  medium TEXT,
  campaign TEXT,
  evidence_reference TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.growth_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK (scope IN ('public_preview','referral','campaign')),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_not_self;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_not_self CHECK (referrer_id <> referred_id);
ALTER TABLE public.referrals
  ADD COLUMN IF NOT EXISTS qualification_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS qualification_evidence TEXT,
  ADD COLUMN IF NOT EXISTS suspicious_reason TEXT;
ALTER TABLE public.referrals DROP CONSTRAINT IF EXISTS referrals_qualification_status_check;
ALTER TABLE public.referrals ADD CONSTRAINT referrals_qualification_status_check CHECK (qualification_status IN ('pending','qualified','rejected','suspicious_review'));

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'analytics_events','growth_identity_links','growth_activation_definitions','growth_lifecycle_state',
    'growth_recommendations','growth_suppressions','growth_segments','growth_campaigns','growth_messages',
    'growth_referral_attribution','growth_experiments','growth_experiment_assignments',
    'growth_experiment_outcomes','growth_attribution_touches','growth_share_links'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', table_name);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
