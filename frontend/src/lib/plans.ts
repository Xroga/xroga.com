export type PlanTier = 'spark' | 'pulse' | 'nova' | 'zenith' | 'singularity';

export interface GalacticPlan {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  usdPrice: number;
  productId: string;
  /** @deprecated Prefer tokensLabel — actions billing retired for AI metering */
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

/** Canonical Spark pool — matches backend MONTHLY_TOTAL_TOKENS */
export const SPARK_TOKEN_POOL = 6_172_222;
export const TRIAL_TOKEN_POOL = 552_077;

export const GALACTIC_PLANS: GalacticPlan[] = [
  {
    tier: 'spark',
    name: 'Spark',
    priceLabel: '$19',
    usdPrice: 19,
    productId: 'pro_01kw4k9efhq3tyrnzxa7kq1nra',
    actionsLabel: '6.17M tokens/mo',
    actions: 1500,
    aiTokens: SPARK_TOKEN_POOL,
    tokensLabel: '6.17M tokens/mo',
    aiTokensLabel: '2 concurrent tasks',
    xrgBonus: 0,
    xrgLabel: 'Solo builders & side projects',
    concurrency: 2,
    tagline: 'Solo builders & side projects',
  },
  {
    tier: 'pulse',
    name: 'Pulse',
    priceLabel: '$29',
    usdPrice: 29,
    productId: 'pro_01kw4kae0qby4dt86b8n551sqt',
    actionsLabel: '9.42M tokens/mo',
    actions: 5000,
    aiTokens: 9_422_116,
    tokensLabel: '9.42M tokens/mo',
    aiTokensLabel: '8 concurrent tasks',
    xrgBonus: 0,
    xrgLabel: 'Most popular — daily swarm power',
    concurrency: 8,
    highlight: true,
    tagline: 'Most popular — daily swarm power',
  },
  {
    tier: 'nova',
    name: 'Nova',
    priceLabel: '$49',
    usdPrice: 49,
    productId: 'pro_01kw4kawhx64rdmm5ncax0at6e',
    actionsLabel: '15.9M tokens/mo',
    actions: 10000,
    aiTokens: 15_918_223,
    tokensLabel: '15.9M tokens/mo',
    aiTokensLabel: '12 concurrent tasks',
    xrgBonus: 0,
    xrgLabel: 'Teams shipping every week',
    concurrency: 12,
    tagline: 'Teams shipping every week',
  },
  {
    tier: 'zenith',
    name: 'Zenith',
    priceLabel: '$99',
    usdPrice: 99,
    productId: 'pro_01kw4kb8t79rfdj68h5c5ep5x0',
    actionsLabel: '32.2M tokens/mo',
    actions: 6000,
    aiTokens: 32_160_331,
    tokensLabel: '32.2M tokens/mo',
    aiTokensLabel: '30 concurrent tasks',
    xrgBonus: 0,
    xrgLabel: 'High concurrency & priority',
    concurrency: 30,
    tagline: 'High concurrency & priority',
  },
  {
    tier: 'singularity',
    name: 'Singularity',
    priceLabel: '$999',
    usdPrice: 999,
    productId: 'pro_01kw4jptfsdbs2yfv6s5ctyptg',
    actionsLabel: '325M tokens/mo',
    actions: 50000,
    aiTokens: 324_529_323,
    tokensLabel: '325M tokens/mo',
    aiTokensLabel: '100 concurrent tasks',
    xrgBonus: 0,
    xrgLabel: 'Enterprise-scale swarm',
    concurrency: 100,
    tagline: 'Enterprise-scale swarm',
  },
];

export const COMING_SOON_PLANS = [
  { name: 'Micro', price: '$6', label: 'Coming soon' },
  { name: 'Lite', price: '$9', label: 'Coming soon' },
  { name: 'Essential', price: '$10', label: 'Coming soon' },
];

export const FREE_TRIAL_ACTIONS = 50; // legacy constant — trial pool is TRIAL_TOKEN_POOL (~0.55M)

/** Feature bullets for pricing cards — concurrency + tokens, no legacy actions marketing */
export function getPlanFeatures(plan: GalacticPlan, featureCount: number): string[] {
  return [
    `${plan.concurrency} concurrent tasks`,
    plan.tokensLabel,
    `All ${featureCount} features unlocked`,
    plan.tagline ?? 'Full Xroga access',
  ];
}

export { LOGO_URL, DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
