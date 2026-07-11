import { connectPostgres, resolveDatabaseUrls } from '../lib/postgresConnect.js';

const ENSURE_PHASE4_SQL = `
CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'template',
  price_xrg BIGINT NOT NULL DEFAULT 0,
  preview_url TEXT,
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  sales_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketplace_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_xrg BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, buyer_id)
);

CREATE TABLE IF NOT EXISTS public.influencer_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'bronze',
  follower_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  username_slug TEXT,
  total_referrals INT NOT NULL DEFAULT 0,
  active_referrals INT NOT NULL DEFAULT 0,
  pending_referrals INT NOT NULL DEFAULT 0,
  total_commission_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  monthly_commission_usd NUMERIC(12,2) NOT NULL DEFAULT 0,
  ai_tokens_earned BIGINT NOT NULL DEFAULT 0,
  xrg_tokens_earned BIGINT NOT NULL DEFAULT 0,
  social_links JSONB DEFAULT '{}',
  application_note TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.influencer_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_id UUID,
  amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  plan_price_usd NUMERIC(10,2) NOT NULL DEFAULT 19.00,
  commission_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  period_month TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_listings_status ON public.marketplace_listings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_listings_seller ON public.marketplace_listings (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_influencer_profiles_status ON public.influencer_profiles (status);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_date ON public.analytics_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON public.activity_logs (user_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
`;

let schemaReady: boolean | null = null;

export async function ensurePhase4Schema(): Promise<boolean> {
  if (schemaReady === true) return true;
  if (!resolveDatabaseUrls().length) return false;

  try {
    const client = await connectPostgres();
    await client.query(ENSURE_PHASE4_SQL);
    await client.end();
    schemaReady = true;
    console.log('[phase4Schema] Marketplace, influencer, analytics tables ensured');
    return true;
  } catch (err) {
    console.error('[phase4Schema] Bootstrap failed:', (err as Error).message);
    schemaReady = false;
    return false;
  }
}
