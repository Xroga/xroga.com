import { connectPostgres, resolveDatabaseUrls } from '../lib/postgresConnect.js';

const ENSURE_PHASE3_SQL = `
ALTER TABLE public.user_token_usage
  ADD COLUMN IF NOT EXISTS bonus_tokens BIGINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.user_referral_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  referral_count INT NOT NULL DEFAULT 0,
  discount_percent INT NOT NULL DEFAULT 0,
  lifetime_discount_percent INT NOT NULL DEFAULT 0,
  referred_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  referred_by_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  referrer_rewarded BOOLEAN NOT NULL DEFAULT FALSE,
  referrer_rewarded_at TIMESTAMPTZ,
  new_user_rewarded BOOLEAN NOT NULL DEFAULT FALSE,
  new_user_rewarded_at TIMESTAMPTZ,
  retention_bonus_released BOOLEAN NOT NULL DEFAULT FALSE,
  retention_bonus_released_at TIMESTAMPTZ,
  referred_subscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_id UUID REFERENCES public.referrals(id) ON DELETE SET NULL,
  ai_token_amount BIGINT NOT NULL DEFAULT 0,
  xrg_amount BIGINT NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('referrer_bonus', 'new_user_bonus', 'retention_bonus')),
  status TEXT NOT NULL DEFAULT 'rewarded',
  rewarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.community_pool (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance_tokens BIGINT NOT NULL DEFAULT 5000000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.community_pool (id, balance_tokens) VALUES (1, 5000000)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.community_pool_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL DEFAULT 50000,
  status TEXT NOT NULL CHECK (status IN ('approved', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.token_distribution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  unused_tokens BIGINT NOT NULL DEFAULT 0,
  rollover_tokens BIGINT NOT NULL DEFAULT 0,
  shared_tokens BIGINT NOT NULL DEFAULT 0,
  share_target TEXT,
  auto_platform BIGINT NOT NULL DEFAULT 0,
  auto_community BIGINT NOT NULL DEFAULT 0,
  auto_heavy_users BIGINT NOT NULL DEFAULT 0,
  auto_builders BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, period_key)
);

NOTIFY pgrst, 'reload schema';
`;

let schemaReady: boolean | null = null;

export async function ensurePhase3Schema(): Promise<boolean> {
  if (schemaReady === true) return true;
  if (!resolveDatabaseUrls().length) return false;

  try {
    const client = await connectPostgres();
    await client.query(ENSURE_PHASE3_SQL);
    await client.end();
    schemaReady = true;
    console.log('[phase3Schema] Referral and community tables ensured');
    return true;
  } catch (err) {
    console.error('[phase3Schema] Bootstrap failed:', (err as Error).message);
    schemaReady = false;
    return false;
  }
}
