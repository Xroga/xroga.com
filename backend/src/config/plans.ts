import type { PlanTier } from '../types/index.js';
import { MONTHLY_TOTAL_BUDGET_USD, MONTHLY_TOTAL_TOKENS } from '../ai/models.js';

export const FREE_PLAN_ACTIONS = 50;
/** @deprecated historical name retained for callers while persisted `unpaid` rows migrate to `free`. */
export const FREE_TRIAL_ACTIONS = FREE_PLAN_ACTIONS;
export const FREE_PROVIDER_BUDGET_USD = 1.65;

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

export const GALACTIC_PLANS: PlanDefinition[] = [
  {
    tier: 'free',
    name: 'Free',
    priceLabel: '$0',
    actionsLabel: `${FREE_PLAN_ACTIONS} AI actions per 30 days`,
    actions: FREE_PLAN_ACTIONS,
    concurrency: 1,
    envPriceKey: '',
    envProductKey: '',
    paid: false,
    apiBudgetUsd: FREE_PROVIDER_BUDGET_USD,
    tokenPool: tokensFromBudget(FREE_PROVIDER_BUDGET_USD),
    publicBenefits: ['Core AI building workspace', 'Repository-aware edits', 'Preview and verification'],
  },
  {
    tier: 'spark',
    name: 'Xroga Pro',
    priceLabel: '$25/month',
    actionsLabel: '1,500 AI actions per 30 days',
    actions: 1500,
    concurrency: 2,
    envPriceKey: 'WHOP_PLAN_ID',
    envProductKey: 'WHOP_PLAN_ID',
    paid: true,
    apiBudgetUsd: MONTHLY_TOTAL_BUDGET_USD,
    tokenPool: MONTHLY_TOTAL_TOKENS,
    publicBenefits: ['1,500 AI actions per 30 days', 'Two concurrent tasks', 'Full Access pacing'],
    highlight: true,
  },
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
