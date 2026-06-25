import type { PlanTier } from '../types/index.js';

export type BillingRegion = 'global' | 'emerging';
export type EmergingCurrency = 'PKR' | 'INR';

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  bestFor: string;
  quality: string;
  actions: number;
  concurrency: number;
  prices: {
    global: { amount: number; currency: 'USD' };
    emerging: { amount: number; currency: EmergingCurrency };
  };
  paddlePriceIds: {
    global: string;
    emerging: string;
  };
  highlighted?: boolean;
}

export const GALACTIC_PLANS: PlanDefinition[] = [
  {
    tier: 'spark',
    name: 'Spark',
    bestFor: 'Students & Beginners',
    quality: 'Standard',
    actions: 2000,
    concurrency: 2,
    prices: { global: { amount: 19, currency: 'USD' }, emerging: { amount: 5299, currency: 'PKR' } },
    paddlePriceIds: { global: 'pri_spark_global', emerging: 'pri_spark_emerging' },
  },
  {
    tier: 'pulse',
    name: 'Pulse',
    bestFor: 'Solo Creators',
    quality: 'Standard+',
    actions: 2800,
    concurrency: 3,
    prices: { global: { amount: 29, currency: 'USD' }, emerging: { amount: 2299, currency: 'PKR' } },
    paddlePriceIds: { global: 'pri_pulse_global', emerging: 'pri_pulse_emerging' },
  },
  {
    tier: 'nova',
    name: 'Nova',
    bestFor: 'Freelancers & Startups',
    quality: 'High',
    actions: 6000,
    concurrency: 5,
    prices: { global: { amount: 59, currency: 'USD' }, emerging: { amount: 4999, currency: 'PKR' } },
    paddlePriceIds: { global: 'pri_nova_global', emerging: 'pri_nova_emerging' },
    highlighted: true,
  },
  {
    tier: 'zenith',
    name: 'Zenith',
    bestFor: 'Agencies & Power Users',
    quality: 'Ultra',
    actions: 20000,
    concurrency: 15,
    prices: { global: { amount: 150, currency: 'USD' }, emerging: { amount: 12999, currency: 'PKR' } },
    paddlePriceIds: { global: 'pri_zenith_global', emerging: 'pri_zenith_emerging' },
  },
  {
    tier: 'singularity',
    name: 'Singularity',
    bestFor: 'Enterprises & Studios',
    quality: 'Maximum',
    actions: 50000,
    concurrency: 999,
    prices: { global: { amount: 499, currency: 'USD' }, emerging: { amount: 44999, currency: 'PKR' } },
    paddlePriceIds: { global: 'pri_singularity_global', emerging: 'pri_singularity_emerging' },
  },
];

export const CRYPTO_ACTION_PACKS = [
  { id: 'pack_500', actions: 500, usd: 10 },
  { id: 'pack_1500', actions: 1500, usd: 25 },
  { id: 'pack_5000', actions: 5000, usd: 75 },
];

export const ACTION_COST_TABLE = [
  { task: 'Chat / Translate', cost: 1 },
  { task: 'Image Generation', cost: 4 },
  { task: 'Code Fix / Scrape', cost: 5 },
  { task: '3D Model / Voice', cost: 15 },
  { task: 'Website / Landing Page', cost: 25 },
  { task: 'Desktop / Mobile App', cost: 50 },
  { task: 'Video Studio', cost: 50 },
  { task: 'Deep Research', cost: 100 },
  { task: 'Job Hunter', cost: 90 },
  { task: 'Game Build', cost: 250 },
];

export function getPlan(tier: PlanTier): PlanDefinition | undefined {
  return GALACTIC_PLANS.find((p) => p.tier === tier);
}

export function getPriceId(tier: PlanTier, region: BillingRegion): string {
  const plan = getPlan(tier);
  if (!plan) throw new Error(`Unknown plan tier: ${tier}`);
  return region === 'emerging' ? plan.paddlePriceIds.emerging : plan.paddlePriceIds.global;
}
