import crypto from 'crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import {
  INFLUENCER_NEW_USER_BONUS,
  INFLUENCER_TIERS,
  nextTier,
  tierForFollowers,
  type InfluencerTier,
} from '../config/influencerConstants.js';
import { creditBonusTokens } from '../phase1/tokenTracker.js';
import { creditXrg } from './xrgBalance.js';

export interface InfluencerDashboard {
  status: 'none' | 'pending' | 'approved' | 'rejected';
  tier: InfluencerTier | null;
  commissionPercent: number;
  followerCount: number;
  nextTier: InfluencerTier | null;
  nextTierFollowers: number | null;
  usernameSlug: string | null;
  shareUrl: string | null;
  stats: {
    totalReferrals: number;
    activeReferrals: number;
    pendingReferrals: number;
    monthlyCommissionUsd: number;
    totalCommissionUsd: number;
    aiTokensEarned: number;
    xrgTokensEarned: number;
  };
  perks: string[];
  tiers: typeof INFLUENCER_TIERS;
}

const memoryProfiles = new Map<string, Record<string, unknown>>();

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.FRONTEND_URL ?? 'https://xroga.com').replace(/\/$/, '');
}

export async function applyForInfluencer(
  userId: string,
  body: { followerCount: number; usernameSlug?: string; applicationNote?: string; socialLinks?: Record<string, string> }
): Promise<{ success: boolean; message: string }> {
  const followers = Math.max(0, body.followerCount);
  const tierConfig = tierForFollowers(followers);
  const slug = (body.usernameSlug ?? `user-${userId.slice(0, 8)}`).toLowerCase().replace(/[^a-z0-9-_]/g, '');

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: existing } = await supabase
        .from('influencer_profiles')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing?.status === 'approved') {
        return { success: false, message: 'You are already an approved influencer.' };
      }
      if (existing?.status === 'pending') {
        return { success: false, message: 'Your application is under review.' };
      }

      await supabase.from('influencer_profiles').upsert(
        {
          user_id: userId,
          tier: tierConfig.tier,
          follower_count: followers,
          status: 'pending',
          commission_percent: tierConfig.commissionPercent,
          username_slug: slug,
          application_note: body.applicationNote ?? null,
          social_links: body.socialLinks ?? {},
          applied_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      return { success: true, message: 'Application submitted! We review within 48 hours.' };
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }
  }

  memoryProfiles.set(userId, {
    tier: tierConfig.tier,
    follower_count: followers,
    status: 'pending',
    commission_percent: tierConfig.commissionPercent,
    username_slug: slug,
  });

  return { success: true, message: 'Application submitted.' };
}

export async function approveInfluencer(userId: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const supabase = getSupabaseAdmin();
  await supabase
    .from('influencer_profiles')
    .update({ status: 'approved', approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId);
}

export async function getInfluencerDashboard(userId: string): Promise<InfluencerDashboard> {
  const base: InfluencerDashboard = {
    status: 'none',
    tier: null,
    commissionPercent: 0,
    followerCount: 0,
    nextTier: null,
    nextTierFollowers: null,
    usernameSlug: null,
    shareUrl: null,
    stats: {
      totalReferrals: 0,
      activeReferrals: 0,
      pendingReferrals: 0,
      monthlyCommissionUsd: 0,
      totalCommissionUsd: 0,
      aiTokensEarned: 0,
      xrgTokensEarned: 0,
    },
    perks: [],
    tiers: INFLUENCER_TIERS,
  };

  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase.from('influencer_profiles').select('*').eq('user_id', userId).maybeSingle();

      if (!data) return base;

      const tier = data.tier as InfluencerTier;
      const tierConfig = INFLUENCER_TIERS.find((t) => t.tier === tier) ?? INFLUENCER_TIERS[0];
      const nxt = nextTier(tier);

      return {
        status: data.status as InfluencerDashboard['status'],
        tier: data.status === 'approved' ? tier : null,
        commissionPercent: Number(data.commission_percent),
        followerCount: data.follower_count,
        nextTier: nxt?.tier ?? null,
        nextTierFollowers: nxt?.minFollowers ?? null,
        usernameSlug: data.username_slug,
        shareUrl: data.username_slug ? `${siteBase()}/influencer/${data.username_slug}` : null,
        stats: {
          totalReferrals: data.total_referrals ?? 0,
          activeReferrals: data.active_referrals ?? 0,
          pendingReferrals: data.pending_referrals ?? 0,
          monthlyCommissionUsd: Number(data.monthly_commission_usd ?? 0),
          totalCommissionUsd: Number(data.total_commission_usd ?? 0),
          aiTokensEarned: Number(data.ai_tokens_earned ?? 0),
          xrgTokensEarned: Number(data.xrg_tokens_earned ?? 0),
        },
        perks: tierConfig.perks,
        tiers: INFLUENCER_TIERS,
      };
    } catch {
      // memory fallback
    }
  }

  const mem = memoryProfiles.get(userId);
  if (!mem) return base;

  const tier = mem.tier as InfluencerTier;
  const tierConfig = INFLUENCER_TIERS.find((t) => t.tier === tier) ?? INFLUENCER_TIERS[0];
  const nxt = nextTier(tier);

  return {
    status: mem.status as InfluencerDashboard['status'],
    tier: mem.status === 'approved' ? tier : null,
    commissionPercent: Number(mem.commission_percent),
    followerCount: Number(mem.follower_count),
    nextTier: nxt?.tier ?? null,
    nextTierFollowers: nxt?.minFollowers ?? null,
    usernameSlug: mem.username_slug as string,
    shareUrl: mem.username_slug ? `${siteBase()}/influencer/${mem.username_slug}` : null,
    stats: {
      totalReferrals: 0,
      activeReferrals: 0,
      pendingReferrals: 0,
      monthlyCommissionUsd: 0,
      totalCommissionUsd: 0,
      aiTokensEarned: 0,
      xrgTokensEarned: 0,
    },
    perks: tierConfig.perks,
    tiers: INFLUENCER_TIERS,
  };
}

/** Called when an influencer referral subscribes */
export async function processInfluencerReferralReward(
  influencerId: string,
  referredUserId: string,
  planPriceUsd = 19
): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from('influencer_profiles')
    .select('*')
    .eq('user_id', influencerId)
    .eq('status', 'approved')
    .maybeSingle();

  if (!profile) return;

  const tierConfig = INFLUENCER_TIERS.find((t) => t.tier === profile.tier) ?? INFLUENCER_TIERS[0];
  const commissionUsd = (planPriceUsd * tierConfig.commissionPercent) / 100;
  const periodMonth = new Date().toISOString().slice(0, 7);

  await creditBonusTokens(influencerId, tierConfig.aiTokensOneTime);
  await creditXrg(influencerId, tierConfig.xrgTokensOneTime, 0);
  await creditBonusTokens(referredUserId, INFLUENCER_NEW_USER_BONUS.aiTokens);
  await creditXrg(referredUserId, INFLUENCER_NEW_USER_BONUS.xrg, 0);

  await supabase.from('influencer_commissions').insert({
    influencer_id: influencerId,
    referred_user_id: referredUserId,
    amount_usd: commissionUsd,
    plan_price_usd: planPriceUsd,
    commission_percent: tierConfig.commissionPercent,
    period_month: periodMonth,
  });

  await supabase
    .from('influencer_profiles')
    .update({
      total_referrals: (profile.total_referrals ?? 0) + 1,
      active_referrals: (profile.active_referrals ?? 0) + 1,
      monthly_commission_usd: Number(profile.monthly_commission_usd ?? 0) + commissionUsd,
      total_commission_usd: Number(profile.total_commission_usd ?? 0) + commissionUsd,
      ai_tokens_earned: Number(profile.ai_tokens_earned ?? 0) + tierConfig.aiTokensOneTime,
      xrg_tokens_earned: Number(profile.xrg_tokens_earned ?? 0) + tierConfig.xrgTokensOneTime,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', influencerId);
}

export async function isApprovedInfluencer(userId: string): Promise<boolean> {
  const dash = await getInfluencerDashboard(userId);
  return dash.status === 'approved';
}

export function generateInfluencerSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'creator';
  return `${base}-${crypto.randomBytes(2).toString('hex')}`;
}
