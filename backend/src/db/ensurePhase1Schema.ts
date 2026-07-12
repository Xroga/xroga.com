/**
 * Auto-create user_token_usage table when missing in production.
 * Requires DATABASE_URL, SUPABASE_DB_URL, or SUPABASE_URL + SUPABASE_DB_PASSWORD.
 */

import { connectPostgres, resolveDatabaseUrls } from '../lib/postgresConnect.js';

const ENSURE_PHASE1_SQL = `
CREATE TABLE IF NOT EXISTS public.user_token_usage (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  emergency_bonus BIGINT NOT NULL DEFAULT 0,
  emergency_claimed_at TIMESTAMPTZ,
  quota_period_start DATE NOT NULL DEFAULT DATE_TRUNC('month', NOW())::DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_token_usage_period ON public.user_token_usage (quota_period_start);

ALTER TABLE public.user_token_usage
  ADD COLUMN IF NOT EXISTS bonus_tokens BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.user_token_usage
  ADD COLUMN IF NOT EXISTS model_usage JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.user_token_usage ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_token_usage'
      AND policyname = 'Users can read own token usage'
  ) THEN
    CREATE POLICY "Users can read own token usage"
      ON public.user_token_usage FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE public.user_token_usage TO service_role;
GRANT SELECT ON TABLE public.user_token_usage TO authenticated;

NOTIFY pgrst, 'reload schema';
`;

let schemaReady: boolean | null = null;
let bootstrapAttempted = false;

export function phase1SchemaAutoBootstrapEnabled(): boolean {
  return Boolean(process.env.SUPABASE_URL || resolveDatabaseUrls().length);
}

export async function ensurePhase1Schema(): Promise<boolean> {
  if (schemaReady === true) return true;

  if (!resolveDatabaseUrls().length) {
    if (!bootstrapAttempted) {
      console.warn(
        '[phase1Schema] No Postgres URL — set DATABASE_URL or SUPABASE_DB_PASSWORD on Fly.io. Token usage will use in-memory fallback.'
      );
      bootstrapAttempted = true;
    }
    return false;
  }

  try {
    const client = await connectPostgres();
    await client.query(ENSURE_PHASE1_SQL);
    await client.end();
    schemaReady = true;
    console.log('[phase1Schema] user_token_usage table ensured');
    return true;
  } catch (err) {
    console.error('[phase1Schema] Bootstrap failed:', (err as Error).message);
    schemaReady = false;
    return false;
  }
}
