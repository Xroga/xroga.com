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
    aiTokensLabel: '7M AI tokens/mo',
    xrgBonus: 5_000,
    xrgLabel: '5K XRG bonus',
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
    aiTokensLabel: '12M AI tokens/mo',
    xrgBonus: 15_000,
    xrgLabel: '15K XRG bonus',
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
    aiTokensLabel: '20M AI tokens/mo',
    xrgBonus: 30_000,
    xrgLabel: '30K XRG bonus',
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
    aiTokensLabel: '35M AI tokens/mo',
    xrgBonus: 75_000,
    xrgLabel: '75K XRG bonus',
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
    aiTokensLabel: '100M AI tokens/mo',
    xrgBonus: 250_000,
    xrgLabel: '250K XRG bonus',
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

/** Feature bullets for pricing cards — tokens only, no legacy "Actions" wording */
export function getPlanFeatures(plan: GalacticPlan, featureCount: number): string[] {
  return [`${plan.concurrency} concurrent tasks`, `All ${featureCount} features unlocked`];
}

export { LOGO_URL, DESKTOP_BG, MOBILE_BG } from '@/lib/theme';
