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

/** ~88.3% of list price goes to API credit; remainder is margin before infra. */
function budgetFromPrice(usdPrice: number): number {
  return Math.round(usdPrice * (MONTHLY_TOTAL_BUDGET_USD / 19) * 100) / 100;
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
    actionsLabel: '1,500 Actions/mo',
    actions: 1500,
    concurrency: 2,
    envPriceKey: 'PADDLE_PRICE_SPARK',
    paid: true,
    apiBudgetUsd: MONTHLY_TOTAL_BUDGET_USD,
    tokenPool: MONTHLY_TOTAL_TOKENS,
  },
  {
    tier: 'pulse',
    name: 'Pulse',
    priceLabel: '$29',
    actionsLabel: '5,000 Actions/mo',
    actions: 5000,
    concurrency: 8,
    envPriceKey: 'PADDLE_PRICE_PULSE',
    paid: true,
    highlight: true,
    apiBudgetUsd: budgetFromPrice(29),
    tokenPool: tokensFromBudget(budgetFromPrice(29)),
  },
  {
    tier: 'nova',
    name: 'Nova',
    priceLabel: '$49',
    actionsLabel: '10,000 Actions/mo',
    actions: 10000,
    concurrency: 12,
    envPriceKey: 'PADDLE_PRICE_NOVA',
    paid: true,
    apiBudgetUsd: budgetFromPrice(49),
    tokenPool: tokensFromBudget(budgetFromPrice(49)),
  },
  {
    tier: 'zenith',
    name: 'Zenith',
    priceLabel: '$99',
    actionsLabel: '6,000 Actions/mo',
    actions: 6000,
    concurrency: 30,
    envPriceKey: 'PADDLE_PRICE_ZENITH',
    paid: true,
    apiBudgetUsd: budgetFromPrice(99),
    tokenPool: tokensFromBudget(budgetFromPrice(99)),
  },
  {
    tier: 'singularity',
    name: 'Singularity',
    priceLabel: '$999',
    actionsLabel: '50,000 Actions/mo',
    actions: 50000,
    concurrency: 100,
    envPriceKey: 'PADDLE_PRICE_SINGULARITY',
    paid: true,
    apiBudgetUsd: budgetFromPrice(999),
    tokenPool: tokensFromBudget(budgetFromPrice(999)),
  },
];

const TRIAL_API_BUDGET_USD = 1.5;

export function getPlanByTier(tier: string): PlanDefinition | undefined {
  if (tier === 'unpaid') {
    return {
      tier: 'unpaid',
      name: 'Free Trial',
      priceLabel: '$0',
      actionsLabel: `${FREE_TRIAL_ACTIONS} Actions (one-time)`,
      actions: FREE_TRIAL_ACTIONS,
      concurrency: 1,
      envPriceKey: '',
      paid: false,
      apiBudgetUsd: TRIAL_API_BUDGET_USD,
      tokenPool: tokensFromBudget(TRIAL_API_BUDGET_USD),
    };
  }
  return GALACTIC_PLANS.find((p) => p.tier === tier);
}

export function getApiBudgetUsd(tier: string): number {
  return getPlanByTier(tier)?.apiBudgetUsd ?? TRIAL_API_BUDGET_USD;
}

export function getTokenPool(tier: string): number {
  return getPlanByTier(tier)?.tokenPool ?? tokensFromBudget(TRIAL_API_BUDGET_USD);
}

export function getPaddlePriceId(tier: PlanTier): string | undefined {
  if (tier === 'unpaid') return undefined;
  const plan = getPlanByTier(tier);
  if (!plan?.envPriceKey) return undefined;
  return process.env[plan.envPriceKey];
}

export function getConcurrencyForTier(tier: string): number {
  return getPlanByTier(tier)?.concurrency ?? 1;
}
