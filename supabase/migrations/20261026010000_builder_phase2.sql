-- Batch 2 Phase 2: QA/repair evidence and customer-owned external operations.
-- Additive only. Depends on 20261026000100_builder_projects.sql. Not applied by this change;
-- apply through the verified migration workflow after review.
-- Rollback: DROP TABLE public.builder_external_operations, public.builder_verifications
-- (nothing else references them).

CREATE TABLE IF NOT EXISTS public.builder_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.builder_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.builder_revisions(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL CHECK (length(run_id) BETWEEN 8 AND 64),
  kind TEXT NOT NULL CHECK (kind IN ('browser_qa','export')),
  status TEXT NOT NULL CHECK (status IN ('passed','failed','partial','pending_runtime')),
  executed_checks INTEGER NOT NULL DEFAULT 0 CHECK (executed_checks >= 0),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Full report including bounded failure evidence. Never contains credentials: the QA browser
  -- runs against test data and its network is locked to the application origin.
  report JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A retry of the same run records the same verification once.
  UNIQUE (revision_id, run_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_builder_verifications_revision
  ON public.builder_verifications(project_id, revision_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_builder_verifications_owner
  ON public.builder_verifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.builder_external_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.builder_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('github')),
  action TEXT NOT NULL CHECK (action IN ('create_repository','push_revision')),
  -- Persisted BEFORE any provider call: the identity that makes a retry safe.
  operation_key TEXT NOT NULL CHECK (length(operation_key) BETWEEN 8 AND 128),
  revision_id UUID NOT NULL REFERENCES public.builder_revisions(id),
  status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN (
    'prepared','approved','executing','succeeded','failed','ambiguous','diverged','cancelled'
  )),
  -- The exact parameters shown to the user and approved: owner, repository, visibility, revision, hash.
  plan JSONB NOT NULL,
  plan_digest TEXT NOT NULL CHECK (plan_digest ~ '^[a-f0-9]{64}$'),
  approved_at TIMESTAMPTZ,
  approval_expires_at TIMESTAMPTZ,
  receipt JSONB,
  failure TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, project_id, provider, action, operation_key),
  CHECK (status NOT IN ('approved','executing','succeeded') OR approved_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_builder_external_operations_project
  ON public.builder_external_operations(project_id, created_at DESC);

ALTER TABLE public.builder_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builder_external_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS builder_verifications_owner_select ON public.builder_verifications;
CREATE POLICY builder_verifications_owner_select ON public.builder_verifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS builder_external_operations_owner_select ON public.builder_external_operations;
CREATE POLICY builder_external_operations_owner_select ON public.builder_external_operations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.builder_verifications, public.builder_external_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.builder_verifications, public.builder_external_operations TO authenticated;
GRANT ALL ON TABLE public.builder_verifications, public.builder_external_operations TO service_role;

-- One in-flight mutation per project and provider: an approved or executing operation blocks a second.
CREATE UNIQUE INDEX IF NOT EXISTS uq_builder_external_operations_inflight
  ON public.builder_external_operations(project_id, provider)
  WHERE status IN ('executing');

NOTIFY pgrst,'reload schema';
