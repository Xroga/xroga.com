/** Influencer program tiers and rewards */

export type InfluencerTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface InfluencerTierConfig {
  tier: InfluencerTier;
  minFollowers: number;
  maxFollowers: number | null;
  commissionPercent: number;
  aiTokensOneTime: number;
  xrgTokensOneTime: number;
  perks: string[];
}

export const INFLUENCER_TIERS: InfluencerTierConfig[] = [
  { tier: 'bronze', minFollowers: 1_000, maxFollowers: 4_999, commissionPercent: 2, aiTokensOneTime: 200_000, xrgTokensOneTime: 2_000, perks: ['Badge', 'Early access'] },
  { tier: 'silver', minFollowers: 5_000, maxFollowers: 24_999, commissionPercent: 4, aiTokensOneTime: 400_000, xrgTokensOneTime: 5_000, perks: ['Badge', 'Early access', 'Discord role'] },
  { tier: 'gold', minFollowers: 25_000, maxFollowers: 99_999, commissionPercent: 6, aiTokensOneTime: 800_000, xrgTokensOneTime: 10_000, perks: ['Badge', 'Early access', 'Featured'] },
  { tier: 'platinum', minFollowers: 100_000, maxFollowers: 499_999, commissionPercent: 8, aiTokensOneTime: 1_500_000, xrgTokensOneTime: 20_000, perks: ['Badge', 'Early access', 'Co-branded'] },
  { tier: 'diamond', minFollowers: 500_000, maxFollowers: null, commissionPercent: 10, aiTokensOneTime: 3_000_000, xrgTokensOneTime: 50_000, perks: ['Badge', 'Early access', 'Co-branded', 'Revenue share', 'Free Pro Plan'] },
];

export const INFLUENCER_NEW_USER_BONUS = {
  aiTokens: 100_000,
  xrg: 2_000,
} as const;

export const REGULAR_REFERRAL = {
  aiTokens: 250_000,
  xrg: 5_000,
} as const;

export function tierForFollowers(count: number): InfluencerTierConfig {
  for (let i = INFLUENCER_TIERS.length - 1; i >= 0; i--) {
    const t = INFLUENCER_TIERS[i];
    if (count >= t.minFollowers && (t.maxFollowers === null || count <= t.maxFollowers)) {
      return t;
    }
  }
  return INFLUENCER_TIERS[0];
}

export function nextTier(current: InfluencerTier): InfluencerTierConfig | null {
  const idx = INFLUENCER_TIERS.findIndex((t) => t.tier === current);
  if (idx < 0 || idx >= INFLUENCER_TIERS.length - 1) return null;
  return INFLUENCER_TIERS[idx + 1];
}
