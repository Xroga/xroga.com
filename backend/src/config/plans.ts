import type { PlanTier } from '../types/index.js';
import {
  MONTHLY_TOTAL_BUDGET_USD,
  MONTHLY_TOTAL_TOKENS,
} from '../ai/models.js';

export const FREE_PROVIDER_BUDGET_USD = 1.65;
export const PRO_VARIABLE_COST_CEILING_USD = 20;

/**
 * Maximum unused API credit that can roll into the next month,
 * expressed in months of the plan budget.
 */
export const ROLLOVER_MAX_MONTHS = 1;

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  priceLabel: string;

  /**
   * Internal execution/request limit.
   * Do NOT use this value in customer-facing pricing copy.
   */
  concurrency: number;

  envPriceKey: string;
  envProductKey: string;
  paid: boolean;
  publicBenefits: string[];
  highlight?: boolean;

  /**
   * Internal hard monthly provider-cost ceiling.
   * Never expose this dollar amount as customer usage.
   */
  apiBudgetUsd: number;

  /**
   * Internal token accounting pool derived from provider budget.
   */
  tokenPool: number;
}

function tokensFromBudget(apiBudgetUsd: number): number {
  return Math.max(
    50_000,
    Math.round(
      MONTHLY_TOTAL_TOKENS *
        (apiBudgetUsd / MONTHLY_TOTAL_BUDGET_USD),
    ),
  );
}

export const GALACTIC_PLANS: PlanDefinition[] = [
  {
    tier: 'free',
    name: 'Free',
    priceLabel: '$0',

    // Internal only.
    concurrency: 1,

    envPriceKey: '',
    envProductKey: '',

    paid: false,

    apiBudgetUsd: FREE_PROVIDER_BUDGET_USD,
    tokenPool: tokensFromBudget(
      FREE_PROVIDER_BUDGET_USD,
    ),

    publicBenefits: [
      'Included monthly AI usage',
      'Core AI building workspace',
      'Repository-aware edits',
      'Preview and verification',
    ],
  },

  {
    tier: 'spark',
    name: 'Xroga Pro',
    priceLabel: '$25/month',

    // Internal only.
    // Pro may accept up to 3 submitted request slots.
    concurrency: 3,

    envPriceKey: 'WHOP_PLAN_ID',
    envProductKey: 'WHOP_PLAN_ID',

    paid: true,

    apiBudgetUsd: PRO_VARIABLE_COST_CEILING_USD,
    tokenPool: tokensFromBudget(
      PRO_VARIABLE_COST_CEILING_USD,
    ),

    publicBenefits: [
      'Higher monthly AI capacity',
      'Full Access pacing',
      'Production-focused workflows',
      'Priority capacity for active builders',
    ],

    highlight: true,
  },
];

const LEGACY_PAID_TIERS = new Set([
  'pulse',
  'nova',
  'zenith',
  'singularity',
]);

export function getPlanByTier(
  tier: string,
): PlanDefinition | undefined {
  const free = GALACTIC_PLANS.find(
    (plan) => plan.tier === 'free',
  )!;

  const pro = GALACTIC_PLANS.find(
    (plan) => plan.tier === 'spark',
  )!;

  if (
    tier === 'free' ||
    tier === 'unpaid'
  ) {
    return {
      ...free,
      tier: tier as PlanTier,
    };
  }

  if (tier === 'spark') {
    return pro;
  }

  if (LEGACY_PAID_TIERS.has(tier)) {
    return {
      ...pro,
      tier: tier as PlanTier,
    };
  }

  return undefined;
}

export function getApiBudgetUsd(
  tier: string,
): number {
  return (
    getPlanByTier(tier)?.apiBudgetUsd ??
    FREE_PROVIDER_BUDGET_USD
  );
}

export function getTokenPool(
  tier: string,
): number {
  return (
    getPlanByTier(tier)?.tokenPool ??
    tokensFromBudget(
      FREE_PROVIDER_BUDGET_USD,
    )
  );
}

export function getConcurrencyForTier(
  tier: string,
): number {
  return (
    getPlanByTier(tier)?.concurrency ??
    1
  );
}
