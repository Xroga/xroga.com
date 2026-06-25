export type PlanTier = 'spark' | 'pulse' | 'nova' | 'zenith' | 'singularity';
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
  },
  {
    tier: 'pulse',
    name: 'Pulse',
    bestFor: 'Solo Creators',
    quality: 'Standard+',
    actions: 2800,
    concurrency: 3,
    prices: { global: { amount: 29, currency: 'USD' }, emerging: { amount: 2299, currency: 'PKR' } },
  },
  {
    tier: 'nova',
    name: 'Nova',
    bestFor: 'Freelancers & Startups',
    quality: 'High',
    actions: 6000,
    concurrency: 5,
    prices: { global: { amount: 59, currency: 'USD' }, emerging: { amount: 4999, currency: 'PKR' } },
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
  },
  {
    tier: 'singularity',
    name: 'Singularity',
    bestFor: 'Enterprises & Studios',
    quality: 'Maximum',
    actions: 50000,
    concurrency: 999,
    prices: { global: { amount: 499, currency: 'USD' }, emerging: { amount: 44999, currency: 'PKR' } },
  },
];

export const FEATURE_HIGHLIGHTS = [
  { icon: '⚡', title: 'All 92 Features Unlocked', desc: 'Every tool in the Swarm at your fingertips' },
  { icon: '🎬', title: 'Hollywood Video Studio', desc: 'AI-generated films with voice & music' },
  { icon: '🔬', title: 'Deep Research', desc: 'Multi-source research with citations' },
  { icon: '🛡️', title: 'Adult Blocker', desc: 'Protect your family from harmful content' },
  { icon: '🤖', title: '5-Agent Truth Council', desc: 'Flawless execution with QA verification' },
  { icon: '🔗', title: 'GitHub Integration', desc: 'Auto-push code to your repos' },
  { icon: '💼', title: 'Job Hunter', desc: 'AI-powered job search & applications' },
  { icon: '🌐', title: 'Landing Page Builder', desc: 'Deploy-ready sites in minutes' },
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

export const CRYPTO_ACTION_PACKS = [
  { id: 'pack_500', actions: 500, usd: 10 },
  { id: 'pack_1500', actions: 1500, usd: 25 },
  { id: 'pack_5000', actions: 5000, usd: 75 },
];

export function formatPrice(amount: number, currency: string): string {
  if (currency === 'USD') return `$${amount}`;
  if (currency === 'PKR') return `₨${amount.toLocaleString()}`;
  if (currency === 'INR') return `₹${amount.toLocaleString()}`;
  return `${amount} ${currency}`;
}

export function getEmergingPrice(plan: PlanDefinition, subRegion: 'PKR' | 'INR'): { amount: number; currency: string } {
  if (subRegion === 'INR') {
    const inrRates: Record<PlanTier, number> = {
      spark: 1599, pulse: 2499, nova: 4999, zenith: 12999, singularity: 44999,
    };
    return { amount: inrRates[plan.tier], currency: 'INR' };
  }
  return plan.prices.emerging;
}
