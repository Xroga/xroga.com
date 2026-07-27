export type PlanTier = 'spark' | 'pulse' | 'nova' | 'zenith' | 'singularity';

export interface GalacticPlan {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  usdPrice: number;
}

export const GALACTIC_PLANS: GalacticPlan[] = [
  { tier: 'spark', name: 'Xroga AI', priceLabel: '$19', usdPrice: 19 },
];

export function planDisplayName(tier: string): string {
  if (tier === 'unpaid') return 'Launch Promotion';
  return 'Xroga AI';
}
