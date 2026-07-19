-- Persistent project memory (same-repo updates across API restarts)
-- + lightweight run traces for observability

CREATE TABLE IF NOT EXISTS project_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repo TEXT,
  branch TEXT NOT NULL DEFAULT 'main',
  project_name TEXT,
  files JSONB NOT NULL DEFAULT '[]'::jsonb,
  paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_summary TEXT,
  ai_summary_model TEXT,
  commit_sha TEXT,
  hits INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (user_id, repo, branch)
);

CREATE INDEX IF NOT EXISTS idx_project_memory_user ON project_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_project_memory_updated ON project_memory(updated_at DESC);

CREATE TABLE IF NOT EXISTS swarm_run_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_swarm_run_traces_run_unique ON swarm_run_traces(run_id);
CREATE INDEX IF NOT EXISTS idx_swarm_run_traces_user ON swarm_run_traces(user_id);

ALTER TABLE project_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE swarm_run_traces ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_memory'
      AND policyname = 'Users manage own project memory'
  ) THEN
    CREATE POLICY "Users manage own project memory" ON project_memory
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'swarm_run_traces'
      AND policyname = 'Users manage own run traces'
  ) THEN
    CREATE POLICY "Users manage own run traces" ON swarm_run_traces
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT ALL ON TABLE public.project_memory TO service_role;
GRANT ALL ON TABLE public.swarm_run_traces TO service_role;

NOTIFY pgrst, 'reload schema';
