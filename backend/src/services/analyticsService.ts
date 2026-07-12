import { getSupabaseAdmin } from '../config/supabase.js';
import { getUsage } from '../phase1/tokenTracker.js';
import { getXrgBalance } from './xrgBalance.js';
import { getMarketplaceStats } from './marketplaceService.js';

export interface AnalyticsDashboard {
  generatedAt: string;
  user: {
    tokensUsed: number;
    tokensRemaining: number;
    percentUsed: number;
    xrgBalance: number;
    referralCount: number;
    projectsCount: number;
    daysActiveThisMonth: number;
  };
  platform: {
    dau: number;
    mau: number;
    dauMauRatio: number;
    totalUsers: number;
    mrrUsd: number;
    arrUsd: number;
    communityPoolTokens: number;
    marketplaceListings: number;
    totalAiTokensConsumed: number;
    avgTokensPerUser: number;
  };
  targets: {
    dauMauTarget: number;
    churnTarget: number;
    mrrGrowthTarget: number;
    tokenUsageTarget: number;
    referralRateTarget: number;
    npsTarget: number;
  };
  revenue: {
    planTier: string;
    planPriceUsd: number;
    monthlyValueUsd: number;
    estimatedArrUsd: number;
  };
  community: {
    poolBalance: number;
    myReferrals: number;
    marketplaceSales: number;
    marketplacePurchases: number;
  };
}

const TARGETS = {
  dauMauTarget: 0.5,
  churnTarget: 0.03,
  mrrGrowthTarget: 0.1,
  tokenUsageTarget: 5_000_000,
  referralRateTarget: 2,
  npsTarget: 70,
};

async function countDistinctUsers(since: Date): Promise<number> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 0;
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('activity_logs')
      .select('user_id')
      .gte('created_at', since.toISOString());

    const unique = new Set((data ?? []).map((r) => r.user_id));
    return unique.size;
  } catch {
    return 0;
  }
}

export async function getAnalyticsDashboard(userId: string): Promise<AnalyticsDashboard> {
  const usage = await getUsage(userId);
  const xrg = await getXrgBalance(userId);
  const marketplace = await getMarketplaceStats(userId);

  let referralCount = 0;
  let projectsCount = 0;
  let daysActiveThisMonth = 0;
  let planTier = 'spark';
  let communityPoolTokens = 5_000_000;
  let marketplaceListings = 0;
  let totalUsers = 0;
  let totalAiTokens = 0;

  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();

      const [{ data: refProfile }, { count: projects }, { data: monthActivity }, { data: pool }, { count: listings }, { count: users }, { data: tokenRows }, { data: actions }] =
        await Promise.all([
          supabase.from('user_referral_profiles').select('referral_count').eq('user_id', userId).maybeSingle(),
          supabase.from('projects').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('activity_logs').select('created_at').eq('user_id', userId).gte('created_at', monthStart.toISOString()),
          supabase.from('community_pool').select('balance_tokens').eq('id', 1).maybeSingle(),
          supabase.from('marketplace_listings').select('*', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('user_token_usage').select('input_tokens, output_tokens'),
          supabase.from('user_actions').select('plan_tier').eq('user_id', userId).maybeSingle(),
        ]);

      referralCount = refProfile?.referral_count ?? 0;
      projectsCount = projects ?? 0;
      const activeDays = new Set(
        (monthActivity ?? []).map((a) => new Date(a.created_at).toISOString().slice(0, 10))
      );
      daysActiveThisMonth = activeDays.size;
      communityPoolTokens = Number(pool?.balance_tokens ?? 5_000_000);
      marketplaceListings = listings ?? 0;
      totalUsers = users ?? 0;
      totalAiTokens = (tokenRows ?? []).reduce(
        (sum, r) => sum + Number(r.input_tokens ?? 0) + Number(r.output_tokens ?? 0),
        0
      );
      if (actions?.plan_tier) planTier = actions.plan_tier;
    } catch {
      // defaults ok
    }
  }

  const dau = await countDistinctUsers(dayAgo);
  const mau = await countDistinctUsers(monthAgo);
  const dauMauRatio = mau > 0 ? dau / mau : 0;

  const paidUsersEstimate = Math.max(1, Math.floor(totalUsers * 0.15));
  const mrrUsd = paidUsersEstimate * 19;
  const planPriceUsd = 19;

  return {
    generatedAt: now.toISOString(),
    user: {
      tokensUsed: usage.totalTokensUsed,
      tokensRemaining: usage.totalTokensRemaining,
      percentUsed: usage.percentUsed,
      xrgBalance: xrg.availableXrg,
      referralCount,
      projectsCount,
      daysActiveThisMonth,
    },
    platform: {
      dau,
      mau,
      dauMauRatio,
      totalUsers,
      mrrUsd,
      arrUsd: mrrUsd * 12,
      communityPoolTokens,
      marketplaceListings,
      totalAiTokensConsumed: totalAiTokens,
      avgTokensPerUser: totalUsers > 0 ? Math.round(totalAiTokens / totalUsers) : 0,
    },
    targets: TARGETS,
    revenue: {
      planTier,
      planPriceUsd,
      monthlyValueUsd: planTier !== 'unpaid' && planTier !== 'spark' ? planPriceUsd : 0,
      estimatedArrUsd: planTier !== 'unpaid' && planTier !== 'spark' ? planPriceUsd * 12 : 0,
    },
    community: {
      poolBalance: communityPoolTokens,
      myReferrals: referralCount,
      marketplaceSales: marketplace.mySales,
      marketplacePurchases: marketplace.myPurchases,
    },
  };
}

export async function trackAnalyticsEvent(
  userId: string | null,
  eventType: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('analytics_events').insert({
      user_id: userId,
      event_type: eventType,
      metadata,
    });
  } catch {
    // non-critical
  }
}
