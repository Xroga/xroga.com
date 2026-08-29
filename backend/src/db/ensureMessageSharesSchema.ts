import { connectPostgres, resolveDatabaseUrls } from '../lib/postgresConnect.js';

const ENSURE_MESSAGE_SHARES_SQL = `
CREATE TABLE IF NOT EXISTS public.message_shares (
  token TEXT PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'public')),
  scope TEXT NOT NULL CHECK (scope IN ('response', 'exchange')),
  prompt TEXT NOT NULL DEFAULT '',
  response TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT message_shares_response_present CHECK (char_length(response) > 0)
);

CREATE INDEX IF NOT EXISTS idx_message_shares_owner_created
  ON public.message_shares (owner_id, created_at DESC);

ALTER TABLE public.message_shares ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'message_shares'
      AND policyname = 'Owners manage message shares'
  ) THEN
    CREATE POLICY "Owners manage message shares"
      ON public.message_shares FOR ALL
      USING (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.message_shares TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.message_shares TO authenticated;
NOTIFY pgrst, 'reload schema';
`;

let schemaReady: boolean | null = null;
let lastAttemptAt = 0;
let inFlight: Promise<boolean> | null = null;
const RETRY_AFTER_MS = 5 * 60 * 1000;

export async function ensureMessageSharesSchema(): Promise<boolean> {
  if (schemaReady === true) return true;
  if (!resolveDatabaseUrls().length) return false;
  if (schemaReady === false && Date.now() - lastAttemptAt < RETRY_AFTER_MS) return false;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    lastAttemptAt = Date.now();
    try {
      const client = await connectPostgres();
      await client.query(ENSURE_MESSAGE_SHARES_SQL);
      await client.end();
      schemaReady = true;
      console.log('[messageSharesSchema] message_shares table ensured');
      return true;
    } catch (error) {
      console.error('[messageSharesSchema] Bootstrap failed:', (error as Error).message);
      schemaReady = false;
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
