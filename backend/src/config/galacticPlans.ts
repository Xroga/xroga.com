export type PlanTier = 'spark' | 'pulse' | 'nova' | 'zenith' | 'singularity';

export interface GalacticPlan {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  usdPrice: number;
}

export const GALACTIC_PLANS: GalacticPlan[] = [
  { tier: 'spark', name: 'Spark', priceLabel: '$19', usdPrice: 19 },
  { tier: 'pulse', name: 'Pulse', priceLabel: '$29', usdPrice: 29 },
  { tier: 'nova', name: 'Nova', priceLabel: '$49', usdPrice: 49 },
  { tier: 'zenith', name: 'Zenith', priceLabel: '$99', usdPrice: 99 },
  { tier: 'singularity', name: 'Singularity', priceLabel: '$999', usdPrice: 999 },
];

export function planDisplayName(tier: string): string {
  if (tier === 'spark' || tier === 'unpaid') return 'Basic';
  const plan = GALACTIC_PLANS.find((p) => p.tier === tier);
  return plan?.name ?? tier;
}
