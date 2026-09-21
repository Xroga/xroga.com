CREATE TABLE IF NOT EXISTS public.software_agent_checkpoints (
  run_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  project_id TEXT,
  repository_identity JSONB,

  base_fingerprint TEXT NOT NULL,

  status TEXT NOT NULL CHECK (
    status IN (
      'active',
      'verified',
      'incomplete',
      'failed',
      'cancelled'
    )
  ),

  checkpoint JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (run_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_software_agent_checkpoints_user_updated
  ON public.software_agent_checkpoints(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_software_agent_checkpoints_project_updated
  ON public.software_agent_checkpoints(user_id, project_id, updated_at DESC);

ALTER TABLE public.software_agent_checkpoints
  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'software_agent_checkpoints'
      AND policyname = 'Users read own software agent checkpoints'
  ) THEN
    CREATE POLICY "Users read own software agent checkpoints"
      ON public.software_agent_checkpoints
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT ALL
  ON TABLE public.software_agent_checkpoints
  TO service_role;

GRANT SELECT
  ON TABLE public.software_agent_checkpoints
  TO authenticated;
