-- Ensure user_integrations exists + refresh PostgREST schema cache.
-- Fixes: "Could not find the table 'public.user_integrations' in the schema cache"
-- during Vercel / Supabase OAuth PKCE upserts.

CREATE TABLE IF NOT EXISTS public.user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  provider_user_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_integrations_user_provider
  ON public.user_integrations(user_id, provider);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_integrations'
      AND policyname = 'Users can manage own integrations'
  ) THEN
    CREATE POLICY "Users can manage own integrations"
      ON public.user_integrations FOR ALL
      USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT ALL ON TABLE public.user_integrations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_integrations TO authenticated;

NOTIFY pgrst, 'reload schema';
