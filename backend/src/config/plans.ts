import type { PlanTier } from '../types/index.js';
import { MONTHLY_TOTAL_BUDGET_USD, MONTHLY_TOTAL_TOKENS } from '../ai/models.js';

/** @deprecated historical name retained for callers while persisted `unpaid` rows migrate to `free`. */
export const FREE_PROVIDER_BUDGET_USD = 1.65;
export const PRO_VARIABLE_COST_CEILING_USD = 20;

/** Max unused API credit that can roll into the next month (in months of plan budget). */
export const ROLLOVER_MAX_MONTHS = 1;

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceLabel: string;
  concurrency: number;
  envPriceKey: string;
  envProductKey: string;
  paid: boolean;
  publicBenefits: string[];
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

{
  tier: 'free',
  name: 'Free',
  priceLabel: '$0',
  concurrency: 1,
  envPriceKey: '',
  envProductKey: '',
  paid: false,
  apiBudgetUsd: FREE_PROVIDER_BUDGET_USD,
  tokenPool: tokensFromBudget(FREE_PROVIDER_BUDGET_USD),
  publicBenefits: [
    'Core AI building workspace',
    'Repository-aware edits',
    'Preview and verification',
    'One task at a time',
  ],
}
  {
  tier: 'spark',
  name: 'Xroga Pro',
  priceLabel: '$25/month',
  concurrency: 2,
  envPriceKey: 'WHOP_PLAN_ID',
  envProductKey: 'WHOP_PLAN_ID',
  paid: true,
  apiBudgetUsd: PRO_VARIABLE_COST_CEILING_USD,
  tokenPool: tokensFromBudget(PRO_VARIABLE_COST_CEILING_USD),
  publicBenefits: [
    'Higher monthly AI capacity',
    'Two concurrent tasks',
    'Full Access pacing',
  ],
  highlight: true,
}
];

const LEGACY_PAID_TIERS = new Set(['pulse', 'nova', 'zenith', 'singularity']);

export function getPlanByTier(tier: string): PlanDefinition | undefined {
  const free = GALACTIC_PLANS.find((plan) => plan.tier === 'free')!;
  const pro = GALACTIC_PLANS.find((plan) => plan.tier === 'spark')!;
  if (tier === 'free' || tier === 'unpaid') return { ...free, tier: tier as PlanTier };
  if (tier === 'spark') return pro;
  if (LEGACY_PAID_TIERS.has(tier)) return { ...pro, tier: tier as PlanTier };
  return undefined;
}

export function getApiBudgetUsd(tier: string): number {
  return getPlanByTier(tier)?.apiBudgetUsd ?? FREE_PROVIDER_BUDGET_USD;
}

export function getTokenPool(tier: string): number {
  return getPlanByTier(tier)?.tokenPool ?? tokensFromBudget(FREE_PROVIDER_BUDGET_USD);
}

export function getConcurrencyForTier(tier: string): number {
  return getPlanByTier(tier)?.concurrency ?? 1;
}
