/**
 * Ensure ship-loop tables exist in production even when CI migrations skip
 * (wrong SUPABASE_DB_PASSWORD still marks workflow green).
 *
 * Tables: project_memory, session_memory, swarm_run_traces
 * + swarm_runs message columns
 */

import { connectPostgres, resolveDatabaseUrls } from '../lib/postgresConnect.js';

const ENSURE_SHIP_LOOP_SQL = `
-- Project file memory for same-repo updates
CREATE TABLE IF NOT EXISTS public.project_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repo TEXT NOT NULL DEFAULT '_local',
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
  UNIQUE (user_id, repo, branch)
);

CREATE INDEX IF NOT EXISTS idx_project_memory_user ON public.project_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_project_memory_updated ON public.project_memory(updated_at DESC);

-- Chat session memory across API restarts
CREATE TABLE IF NOT EXISTS public.session_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repo TEXT NOT NULL DEFAULT '_workspace',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, repo)
);

CREATE INDEX IF NOT EXISTS idx_session_memory_user ON public.session_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_session_memory_updated ON public.session_memory(updated_at DESC);

-- Run observability
CREATE TABLE IF NOT EXISTS public.swarm_run_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_swarm_run_traces_run_unique ON public.swarm_run_traces(run_id);
CREATE INDEX IF NOT EXISTS idx_swarm_run_traces_user ON public.swarm_run_traces(user_id);

-- swarm_runs columns used by runStore
ALTER TABLE public.swarm_runs ADD COLUMN IF NOT EXISTS messages JSONB;
ALTER TABLE public.swarm_runs ADD COLUMN IF NOT EXISTS feature_category TEXT;
ALTER TABLE public.swarm_runs ADD COLUMN IF NOT EXISTS token_usage JSONB;

ALTER TABLE public.project_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swarm_run_traces ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'project_memory'
      AND policyname = 'Users manage own project memory'
  ) THEN
    CREATE POLICY "Users manage own project memory" ON public.project_memory
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_memory'
      AND policyname = 'Users manage own session memory'
  ) THEN
    CREATE POLICY "Users manage own session memory" ON public.session_memory
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'swarm_run_traces'
      AND policyname = 'Users manage own run traces'
  ) THEN
    CREATE POLICY "Users manage own run traces" ON public.swarm_run_traces
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT ALL ON TABLE public.project_memory TO service_role;
GRANT ALL ON TABLE public.session_memory TO service_role;
GRANT ALL ON TABLE public.swarm_run_traces TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_memory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.session_memory TO authenticated;

NOTIFY pgrst, 'reload schema';
`;

let schemaReady: boolean | null = null;

export async function ensureShipLoopSchema(): Promise<boolean> {
  if (schemaReady === true) return true;
  if (!resolveDatabaseUrls().length) {
    console.warn(
      '[shipLoopSchema] No DATABASE_URL / SUPABASE_DB_PASSWORD — cannot auto-create project_memory/session_memory',
    );
    return false;
  }

  try {
    const client = await connectPostgres();
    await client.query(ENSURE_SHIP_LOOP_SQL);
    await client.end();
    schemaReady = true;
    console.log('[shipLoopSchema] project_memory + session_memory + traces ensured');
    return true;
  } catch (err) {
    console.error('[shipLoopSchema] Bootstrap failed:', (err as Error).message);
    schemaReady = false;
    return false;
  }
}
