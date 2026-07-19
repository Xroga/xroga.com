-- Durable chat session memory + missing swarm_runs columns for persistence

ALTER TABLE public.swarm_runs
  ADD COLUMN IF NOT EXISTS messages JSONB,
  ADD COLUMN IF NOT EXISTS feature_category TEXT,
  ADD COLUMN IF NOT EXISTS token_usage JSONB;

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

ALTER TABLE public.session_memory ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_memory'
      AND policyname = 'Users manage own session memory'
  ) THEN
    CREATE POLICY "Users manage own session memory" ON public.session_memory
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT ALL ON TABLE public.session_memory TO service_role;

NOTIFY pgrst, 'reload schema';
