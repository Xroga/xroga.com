export type PlanTier = 'spark' | 'pulse' | 'nova' | 'zenith' | 'singularity';

export interface GalacticPlan {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  usdPrice: number;
}

export const GALACTIC_PLANS: GalacticPlan[] = [
  { tier: 'spark', name: 'Xroga AI', priceLabel: '$25', usdPrice: 25 },
];

export function planDisplayName(tier: string): string {
  if (tier === 'unpaid') return 'Spark';
  return 'Xroga AI';
}
