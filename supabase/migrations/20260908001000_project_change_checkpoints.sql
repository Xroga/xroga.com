-- Durable Xroga-owned GitHub checkpoints. Additive; no browser writes.
CREATE TABLE IF NOT EXISTS public.project_change_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT,
  repo_name TEXT NOT NULL,
  requested_branch TEXT NOT NULL,
  actual_branch TEXT,
  run_id TEXT,
  label TEXT,
  before_sha TEXT,
  after_sha TEXT,
  manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
  health_before JSONB NOT NULL DEFAULT '{}'::jsonb,
  health_after JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','undone','failed')),
  undo_commit_sha TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  undone_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_project_change_checkpoints_user_repo_created
  ON public.project_change_checkpoints(user_id, repo_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_change_checkpoints_active
  ON public.project_change_checkpoints(user_id, repo_name, actual_branch, created_at DESC)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_change_checkpoints_after_sha
  ON public.project_change_checkpoints(user_id, repo_name, actual_branch, after_sha)
  WHERE after_sha IS NOT NULL;

ALTER TABLE public.project_change_checkpoints ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_change_checkpoints'
      AND policyname = 'Users read own project change checkpoints'
  ) THEN
    CREATE POLICY "Users read own project change checkpoints"
      ON public.project_change_checkpoints
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT ALL ON TABLE public.project_change_checkpoints TO service_role;
GRANT SELECT ON TABLE public.project_change_checkpoints TO authenticated;
