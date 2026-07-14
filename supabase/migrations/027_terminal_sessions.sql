-- Permanent per-user terminal sessions under a GitHub repo (#1, #2, …).
-- Survives refresh, New Terminal, and new devices — not browser localStorage.

CREATE TABLE IF NOT EXISTS public.terminal_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_repo_name TEXT NOT NULL,
  github_branch TEXT NOT NULL DEFAULT 'main',
  terminal_number INT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Terminal',
  prompt TEXT NOT NULL DEFAULT '',
  preview TEXT NOT NULL DEFAULT '',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  kind TEXT NOT NULL DEFAULT 'chat',
  status TEXT NOT NULL DEFAULT 'active',
  message_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT terminal_sessions_number_positive CHECK (terminal_number >= 1),
  CONSTRAINT terminal_sessions_repo_format CHECK (position('/' in github_repo_name) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_terminal_sessions_user_repo_number
  ON public.terminal_sessions (user_id, github_repo_name, terminal_number);

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_user_repo_updated
  ON public.terminal_sessions (user_id, github_repo_name, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_terminal_sessions_user_updated
  ON public.terminal_sessions (user_id, updated_at DESC);

ALTER TABLE public.terminal_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'terminal_sessions'
      AND policyname = 'Users manage own terminal sessions'
  ) THEN
    CREATE POLICY "Users manage own terminal sessions"
      ON public.terminal_sessions
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.terminal_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.terminal_sessions TO authenticated;

NOTIFY pgrst, 'reload schema';
