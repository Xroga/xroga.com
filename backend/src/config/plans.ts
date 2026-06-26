import type { PlanTier } from '../types/index.js';

export const FREE_TRIAL_ACTIONS = 50;

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  actionsLabel: string;
  actions: number;
  concurrency: number;
  envPriceKey: string;
  paid: boolean;
}

export const GALACTIC_PLANS: PlanDefinition[] = [
  {
    tier: 'spark',
    name: 'Spark',
    priceLabel: '$19',
    actionsLabel: '500 Actions/mo',
    actions: 500,
    concurrency: 2,
    envPriceKey: 'PADDLE_PRICE_SPARK',
    paid: true,
  },
  {
    tier: 'nova',
    name: 'Nova',
    priceLabel: '$49',
    actionsLabel: '2,000 Actions/mo',
    actions: 2000,
    concurrency: 5,
    envPriceKey: 'PADDLE_PRICE_NOVA',
    paid: true,
  },
  {
    tier: 'zenith',
    name: 'Zenith',
    priceLabel: '$99',
    actionsLabel: '6,000 Actions/mo',
    actions: 6000,
    concurrency: 30,
    envPriceKey: 'PADDLE_PRICE_ZENITH',
    paid: true,
  },
  {
    tier: 'singularity',
    name: 'Singularity',
    priceLabel: '$999',
    actionsLabel: '50,000 Actions/mo',
    actions: 50000,
    concurrency: 100,
    envPriceKey: 'PADDLE_PRICE_SINGULARITY',
    paid: true,
  },
];

export function getPlanByTier(tier: string): PlanDefinition | undefined {
  if (tier === 'unpaid') {
    return {
      tier: 'unpaid',
      name: 'Free Trial',
      priceLabel: '$0',
      actionsLabel: `${FREE_TRIAL_ACTIONS} Actions (one-time)`,
      actions: FREE_TRIAL_ACTIONS,
      concurrency: 1,
      envPriceKey: '',
      paid: false,
    };
  }
  return GALACTIC_PLANS.find((p) => p.tier === tier);
}

export function getPaddlePriceId(tier: PlanTier): string | undefined {
  if (tier === 'unpaid') return undefined;
  const plan = getPlanByTier(tier);
  if (!plan?.envPriceKey) return undefined;
  return process.env[plan.envPriceKey];
}

export function getConcurrencyForTier(tier: string): number {
  return getPlanByTier(tier)?.concurrency ?? 1;
}
