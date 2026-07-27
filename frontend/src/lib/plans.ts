export type PlanTier = 'spark';

export interface GalacticPlan {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  usdPrice: number;
  productId: string;
  actionsLabel: string;
  actions: number;
  aiTokens: number;
  tokensLabel: string;
  aiTokensLabel: string;
  xrgBonus: number;
  xrgLabel: string;
  concurrency: number;
  highlight?: boolean;
  tagline?: string;
}

/** Internal compatibility values; customer copy never promises a fixed token total. */
export const SPARK_TOKEN_POOL = 6_172_222;
export const TRIAL_TOKEN_POOL = SPARK_TOKEN_POOL;

/** One canonical public plan. Historical tiers remain readable only in backend migrations. */
export const GALACTIC_PLANS: GalacticPlan[] = [
  {
    tier: 'spark',
    name: 'Xroga AI',
    priceLabel: '$19',
    usdPrice: 19,
    productId: 'pro_01kw4k9efhq3tyrnzxa7kq1nra',
    actionsLabel: 'Included AI capacity',
    actions: 1500,
    aiTokens: SPARK_TOKEN_POOL,
    tokensLabel: 'Balanced Month pacing',
    aiTokensLabel: 'Up to 2 implementation tasks',
    xrgBonus: 0,
    xrgLabel: 'Build, verify, and publish with one plan',
    concurrency: 2,
    highlight: true,
    tagline: 'Build, verify, and publish with one plan',
  },
];

export const COMING_SOON_PLANS: Array<{ name: string; price: string; label: string }> = [];
export const FREE_TRIAL_ACTIONS = 50;

export function getPlanFeatures(_plan: GalacticPlan, featureCount: number): string[] {
  return [
    'One active main run',
    'Balanced Month pacing with protected completion capacity',
    `All ${featureCount} features unlocked`,
    'Usage, checkpoints, and reset date shown truthfully',
  ];
}

export { LOGO_URL, DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
