-- Step 4 — Live Build Experience & Universal Preview
--
-- Temporary Preview grants.
--
-- Generated runtime Machines remain private.
-- The public Preview hostname is only a signed capability that Xroga's
-- Preview Gateway resolves to one private runtime session.

CREATE TABLE IF NOT EXISTS public.project_preview_grants (
  preview_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  project_id TEXT NOT NULL,

  session_id TEXT NOT NULL,

  run_id TEXT NOT NULL,

  preview_kind TEXT NOT NULL CHECK (
    preview_kind IN (
      'browser',
      'api',
      'terminal',
      'logs',
      'extension',
      'mobile',
      'desktop',
      'mcp',
      'ai'
    )
  ),

  port INTEGER CHECK (
    port IS NULL OR
    (
      port >= 1 AND
      port <= 65535
    )
  ),

  expires_at TIMESTAMPTZ NOT NULL,

  revoked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_preview_grants_project
  ON public.project_preview_grants(
    user_id,
    project_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_project_preview_grants_session
  ON public.project_preview_grants(
    user_id,
    session_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_project_preview_grants_expiry
  ON public.project_preview_grants(
    expires_at
  );


ALTER TABLE public.project_preview_grants
  ENABLE ROW LEVEL SECURITY;


GRANT ALL
  ON TABLE public.project_preview_grants
  TO service_role;

-- Deliberately no authenticated/browser table access.
--
-- Preview resolution happens through the server-side gateway only.
