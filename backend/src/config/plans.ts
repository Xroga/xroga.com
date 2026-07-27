import type { PlanTier } from '../types/index.js';
import { MONTHLY_TOTAL_BUDGET_USD, MONTHLY_TOTAL_TOKENS } from '../ai/models.js';

export const FREE_TRIAL_ACTIONS = 50;

/** Max unused API credit that can roll into the next month (in months of plan budget). */
export const ROLLOVER_MAX_MONTHS = 1;

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  actionsLabel: string;
  actions: number;
  concurrency: number;
  envPriceKey: string;
  paid: boolean;
  highlight?: boolean;
  /** Hard monthly API credit ($) — what we can spend on providers for this user. */
  apiBudgetUsd: number;
  /** Monthly token pool (scales with API budget). */
  tokenPool: number;
}

function tokensFromBudget(apiBudgetUsd: number): number {
  return Math.max(
    50_000,
    Math.round(MONTHLY_TOTAL_TOKENS * (apiBudgetUsd / MONTHLY_TOTAL_BUDGET_USD)),
  );
}

export const GALACTIC_PLANS: PlanDefinition[] = [
  {
    tier: 'spark',
    name: 'Spark',
    priceLabel: '$19',
    actionsLabel: 'Included AI capacity',
    actions: 1500,
    concurrency: 2,
    envPriceKey: 'LEMONSQUEEZY_VARIANT_SPARK',
    paid: true,
    apiBudgetUsd: MONTHLY_TOTAL_BUDGET_USD,
    tokenPool: MONTHLY_TOTAL_TOKENS,
  },
];

const LEGACY_PAID_TIERS = new Set(['pulse', 'nova', 'zenith', 'singularity']);

export function getPlanByTier(tier: string): PlanDefinition | undefined {
  if (tier === 'unpaid') {
    return {
      tier: 'unpaid',
      name: 'Launch Promotion',
      priceLabel: '$0',
      actionsLabel: '30-day promotional access',
      actions: FREE_TRIAL_ACTIONS,
      concurrency: 2,
      envPriceKey: '',
      paid: false,
      apiBudgetUsd: MONTHLY_TOTAL_BUDGET_USD,
      tokenPool: MONTHLY_TOTAL_TOKENS,
    };
  }
  const canonical = GALACTIC_PLANS[0];
  if (tier === 'spark') return canonical;
  if (LEGACY_PAID_TIERS.has(tier)) return { ...canonical, tier: tier as PlanTier };
  return undefined;
}

export function getApiBudgetUsd(tier: string): number {
  return getPlanByTier(tier)?.apiBudgetUsd ?? MONTHLY_TOTAL_BUDGET_USD;
}

export function getTokenPool(tier: string): number {
  return getPlanByTier(tier)?.tokenPool ?? MONTHLY_TOTAL_TOKENS;
}

export function getLemonVariantId(tier: PlanTier): string | undefined {
  if (tier === 'unpaid') return undefined;
  const plan = getPlanByTier(tier);
  if (!plan?.envPriceKey) return undefined;
  return process.env[plan.envPriceKey];
}

/** @deprecated use getLemonVariantId */
export function getPaddlePriceId(tier: PlanTier): string | undefined {
  return getLemonVariantId(tier);
}

export function getConcurrencyForTier(tier: string): number {
  return getPlanByTier(tier)?.concurrency ?? 1;
}
