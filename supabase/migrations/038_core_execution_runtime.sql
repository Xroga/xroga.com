ALTER TABLE public.model_routing_outcomes
  ADD COLUMN IF NOT EXISTS framework TEXT,
  ADD COLUMN IF NOT EXISTS required_capabilities TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_failure_type TEXT,
  ADD COLUMN IF NOT EXISTS review_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS deployment_ok BOOLEAN,
  ADD COLUMN IF NOT EXISTS final_verification_ok BOOLEAN;

CREATE TABLE IF NOT EXISTS public.execution_runs (
  run_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  repository_identity JSONB,
  selected_branch TEXT NOT NULL,
  starting_commit_sha TEXT,
  state JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'partially_completed', 'blocked', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_runs_user_updated
  ON public.execution_runs(user_id, updated_at DESC);

ALTER TABLE public.execution_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'execution_runs'
      AND policyname = 'Users read own execution runs'
  ) THEN
    CREATE POLICY "Users read own execution runs"
      ON public.execution_runs FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT ALL ON TABLE public.execution_runs TO service_role;
GRANT SELECT ON TABLE public.execution_runs TO authenticated;
