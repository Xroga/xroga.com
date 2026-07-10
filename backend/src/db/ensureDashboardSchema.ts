/**
 * Auto-create XRG balance and task completion tables when missing in production.
 */

import { connectPostgres, resolveDatabaseUrls } from '../lib/postgresConnect.js';

const ENSURE_DASHBOARD_SQL = `
CREATE TABLE IF NOT EXISTS public.user_xrg_balance (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_xrg BIGINT NOT NULL DEFAULT 0,
  available_xrg BIGINT NOT NULL DEFAULT 0,
  vested_xrg BIGINT NOT NULL DEFAULT 0,
  token_boost_total BIGINT NOT NULL DEFAULT 0,
  consistency_streak_months INT NOT NULL DEFAULT 0,
  consistency_bonus_percent INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_task_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL,
  period_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  xrg_awarded BIGINT NOT NULL DEFAULT 0,
  token_boost BIGINT NOT NULL DEFAULT 0,
  proof_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, task_id, period_key)
);

CREATE INDEX IF NOT EXISTS idx_user_task_completions_user ON public.user_task_completions (user_id, created_at DESC);

ALTER TABLE public.user_xrg_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_task_completions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
`;

let schemaReady: boolean | null = null;

export async function ensureDashboardSchema(): Promise<boolean> {
  if (schemaReady === true) return true;
  if (!resolveDatabaseUrls().length) return false;

  try {
    const client = await connectPostgres();
    await client.query(ENSURE_DASHBOARD_SQL);
    await client.end();
    schemaReady = true;
    console.log('[dashboardSchema] XRG and task tables ensured');
    return true;
  } catch (err) {
    console.error('[dashboardSchema] Bootstrap failed:', (err as Error).message);
    schemaReady = false;
    return false;
  }
}
