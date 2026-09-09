export type PlanTier = 'free' | 'spark' | 'pulse' | 'nova' | 'zenith' | 'singularity';

export interface GalacticPlan {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  usdPrice: number;
}

export const GALACTIC_PLANS: GalacticPlan[] = [
  { tier: 'free', name: 'Free', priceLabel: '$0', usdPrice: 0 },
  { tier: 'spark', name: 'Xroga Pro', priceLabel: '$25/month', usdPrice: 25 },
];

export function planDisplayName(tier: string): string {
  if (tier === 'free' || tier === 'unpaid') return 'Free';
  return 'Xroga Pro';
}
