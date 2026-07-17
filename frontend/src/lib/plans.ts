export type PlanTier = 'spark' | 'pulse' | 'nova' | 'zenith' | 'singularity';

export interface GalacticPlan {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  usdPrice: number;
  productId: string;
  actionsLabel: string;
  actions: number;
  aiTokens: number;
  aiTokensLabel: string;
  xrgBonus: number;
  xrgLabel: string;
  concurrency: number;
  highlight?: boolean;
  tagline?: string;
}

export const GALACTIC_PLANS: GalacticPlan[] = [
  {
    tier: 'spark',
    name: 'Spark',
    priceLabel: '$19',
    usdPrice: 19,
    productId: 'pro_01kw4k9efhq3tyrnzxa7kq1nra',
    actionsLabel: '1,500 Actions/mo',
    actions: 1500,
    aiTokens: 7_000_000,
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
    actionsLabel: '5,000 Actions/mo',
    actions: 5000,
    aiTokens: 12_000_000,
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
    actionsLabel: '10,000 Actions/mo',
    actions: 10000,
    aiTokens: 20_000_000,
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
    actionsLabel: '6,000 Actions/mo',
    actions: 6000,
    aiTokens: 35_000_000,
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
    actionsLabel: '50,000 Actions/mo',
    actions: 50000,
    aiTokens: 100_000_000,
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

export const FREE_TRIAL_ACTIONS = 50;

/** Feature bullets for pricing cards — no token/XRG quota marketing */
export function getPlanFeatures(plan: GalacticPlan, featureCount: number): string[] {
  return [
    `${plan.concurrency} concurrent tasks`,
    `All ${featureCount} features unlocked`,
    plan.tagline ?? 'Full Xroga access',
  ];
}

export { LOGO_URL, DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
