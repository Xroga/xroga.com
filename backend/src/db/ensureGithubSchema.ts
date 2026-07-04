/**
 * Auto-create github_integrations + user_integrations when missing in production.
 * Requires DATABASE_URL, SUPABASE_DB_URL, or SUPABASE_URL + SUPABASE_DB_PASSWORD.
 */

const ENSURE_GITHUB_SQL = `
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

CREATE TABLE IF NOT EXISTS public.github_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  repo_strategy TEXT DEFAULT 'auto' CHECK (repo_strategy IN ('auto', 'monorepo', 'manual')),
  default_repo TEXT,
  github_username TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.github_integrations ADD COLUMN IF NOT EXISTS github_username TEXT;

CREATE INDEX IF NOT EXISTS idx_user_integrations_user_provider ON public.user_integrations(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_github_integrations_user_id ON public.github_integrations(user_id);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_integrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_integrations' AND policyname = 'Users can manage own integrations'
  ) THEN
    CREATE POLICY "Users can manage own integrations" ON public.user_integrations FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'github_integrations' AND policyname = 'Users can manage own github integration'
  ) THEN
    CREATE POLICY "Users can manage own github integration" ON public.github_integrations FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT ALL ON TABLE public.user_integrations TO service_role;
GRANT ALL ON TABLE public.github_integrations TO service_role;

NOTIFY pgrst, 'reload schema';
`;

let schemaReady: boolean | null = null;
let bootstrapAttempted = false;

function supabaseProjectRef(): string | null {
  const raw = process.env.SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    const host = new URL(raw).hostname;
    const match = host.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function databaseUrl(): string | null {
  const direct = process.env.DATABASE_URL?.trim() || process.env.SUPABASE_DB_URL?.trim();
  if (direct) return direct;

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const ref = supabaseProjectRef();
  if (password && ref) {
    return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
  }
  return null;
}

/** Returns true if tables exist or were created successfully */
export async function ensureGithubSchema(): Promise<boolean> {
  if (schemaReady === true) return true;

  const url = databaseUrl();
  if (!url) {
    if (!bootstrapAttempted) {
      console.warn(
        '[githubSchema] No Postgres URL — set DATABASE_URL or SUPABASE_DB_PASSWORD on Fly.io. GitHub tokens will use Storage fallback.'
      );
      bootstrapAttempted = true;
    }
    return false;
  }

  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    });
    await client.connect();
    await client.query(ENSURE_GITHUB_SQL);
    await client.end();
    schemaReady = true;
    console.log('[githubSchema] Integration tables ensured');
    return true;
  } catch (err) {
    console.error('[githubSchema] Bootstrap failed:', (err as Error).message);
    schemaReady = false;
    return false;
  }
}

export function githubSchemaAutoBootstrapEnabled(): boolean {
  return Boolean(databaseUrl());
}
