export type PlanTier = 'free' | 'spark';

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
export const FREE_TOKEN_POOL = 617_222;
export const FREE_PLAN_ACTIONS = 50;

/** One canonical public plan. Historical tiers remain readable only in backend migrations. */
export const GALACTIC_PLANS: GalacticPlan[] = [
  {
    tier: 'free',
    name: 'Free',
    priceLabel: '$0',
    usdPrice: 0,
    productId: '',
    actionsLabel: `${FREE_PLAN_ACTIONS} AI actions per 30 days`,
    actions: FREE_PLAN_ACTIONS,
    aiTokens: FREE_TOKEN_POOL,
    tokensLabel: 'No card required',
    aiTokensLabel: 'One task at a time',
    xrgBonus: 0,
    xrgLabel: 'Start building with Xroga for free',
    concurrency: 1,
    tagline: 'Useful capacity for a small build',
  },
  {
    tier: 'spark',
    name: 'Xroga Pro',
    priceLabel: '$25',
    usdPrice: 25,
    productId: 'plan_hlV1A10I5QfSP',
    actionsLabel: '1,500 AI actions per 30 days',
    actions: 1500,
    aiTokens: SPARK_TOKEN_POOL,
    tokensLabel: 'Balanced Month pacing',
    aiTokensLabel: 'Up to 2 safe independent tasks concurrently',
    xrgBonus: 0,
    xrgLabel: 'For active builders who need more capacity',
    concurrency: 2,
    highlight: true,
    tagline: 'Higher capacity and faster pacing',
  },
];

export const COMING_SOON_PLANS: Array<{ name: string; price: string; label: string }> = [];

export function getPlanFeatures(plan: GalacticPlan, _featureCount: number): string[] {
  return plan.tier === 'free'
    ? ['Core AI building workspace', 'Repository-aware edits', 'Preview and verification']
    : ['1,500 AI actions per 30 days', 'Two concurrent tasks', 'Full Access pacing'];
}

export { LOGO_URL, DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
