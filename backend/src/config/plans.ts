import type { PlanTier } from '../types/index.js';

export const FREE_TRIAL_ACTIONS = 10;

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  priceRange: string;
  actionsLabel: string;
  actions: number;
  concurrency: number;
  envPriceKey: string;
}

export const GALACTIC_PLANS: PlanDefinition[] = [
  {
    tier: 'spark',
    name: 'Spark',
    priceLabel: '$10',
    priceRange: '$6–$15',
    actionsLabel: '500–1,000',
    actions: 1000,
    concurrency: 2,
    envPriceKey: 'PADDLE_PRICE_SPARK',
  },
  {
    tier: 'pulse',
    name: 'Pulse',
    priceLabel: '$29',
    priceRange: '$19–$39',
    actionsLabel: '2,000–4,000',
    actions: 3000,
    concurrency: 3,
    envPriceKey: 'PADDLE_PRICE_PULSE',
  },
  {
    tier: 'nova',
    name: 'Nova',
    priceLabel: '$74',
    priceRange: '$49–$99',
    actionsLabel: '6,000–12,000',
    actions: 9000,
    concurrency: 5,
    envPriceKey: 'PADDLE_PRICE_NOVA',
  },
  {
    tier: 'zenith',
    name: 'Zenith',
    priceLabel: '$199',
    priceRange: '$150–$249',
    actionsLabel: '20,000–40,000',
    actions: 30000,
    concurrency: 15,
    envPriceKey: 'PADDLE_PRICE_ZENITH',
  },
  {
    tier: 'singularity',
    name: 'Singularity',
    priceLabel: '$749',
    priceRange: '$499–$999',
    actionsLabel: '50,000–100,000',
    actions: 75000,
    concurrency: 999,
    envPriceKey: 'PADDLE_PRICE_SINGULARITY',
  },
];

export function getPlanByTier(tier: string): PlanDefinition | undefined {
  return GALACTIC_PLANS.find((p) => p.tier === tier);
}

export function getPaddlePriceId(tier: PlanTier): string | undefined {
  const plan = getPlanByTier(tier);
  if (!plan) return undefined;
  return process.env[plan.envPriceKey];
}
