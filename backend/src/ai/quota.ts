import { getSupabaseAdmin } from '../config/supabase.js';
import {
  MODELS,
  POOL_PUBLIC_ID_BY_ROLE,
  costUsdForTokens,
  dashboardModelPools,
  type ModelId,
} from './models.js';
import { getApiBudgetUsd, getPlanByTier, getTokenPool } from '../config/plans.js';

export interface UsageSnapshot {
  inputTokensUsed: number;
  outputTokensUsed: number;
  totalTokensUsed: number;
  inputTokensRemaining: number;
  outputTokensRemaining: number;
  totalTokensRemaining: number;
  percentUsed: number;
  quotaPeriodStart: string;
  emergencyTokensAvailable: boolean;
  emergencyTokensClaimedThisMonth: boolean;
  totalLimit: number;
  /** Plan monthly API credit ($) — not shown as a user invoice. */
  planBudgetUsd: number;
  /** Rolled-over unused credit from prior month. */
  rolloverUsd: number;
  /** Real provider $ spent this period (internal + dashboard credit burn). */
  spentUsd: number;
  /** Remaining credit = planBudget + rollover - spent. */
  creditRemainingUsd: number;
  percentCreditUsed: number;
  planTier: string;
  byModel: Array<{
    /** Capability-tier key. Never the model id — see `dashboardModelPools`. */
    id: string;
    label: string;
    tagline?: string;
    inputUsed: number;
    outputUsed: number;
    inputLimit: number;
    outputLimit: number;
    totalUsed: number;
    totalLimit: number;
    percentUsed: number;
    budgetUsd: number;
    spentUsd: number;
    creditRemainingUsd: number;
  }>;
}

function periodStart(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

export function poolRoleFor(modelId: ModelId): string {
  if (modelId.startsWith('deepseek')) {
    return 'deepseek_v4';
  }

  // Preserve the historical GLM pool key so existing
  // database usage remains readable after the model upgrade.
  if (modelId.startsWith('glm_5_')) {
    return 'glm_5_2';
  }

  if (modelId.startsWith('grok')) {
    return 'grok';
  }

  return modelId;
}

type MemRow = {
  input: number;
  output: number;
  spentUsd: number;
  rolloverUsd: number;
  planBudgetUsd: number;
  planTier: string;
  byModel: Record<string, { in: number; out: number; cost: number }>;
};

/** Conservative process-local usage floor, never an entitlement or outage fallback. */
const memUsage = new Map<string, MemRow>();

function memKey(userId: string): string {
  return `${userId}:${periodStart()}`;
}

function roundUsd(n: number): number {
  return Math.round(Math.max(0, n) * 1_000_000) / 1_000_000;
}

function buildSnapshot(opts: {
  inputUsed: number;
  outputUsed: number;
  modelUsed: Record<string, { in: number; out: number; cost: number }>;
  start: string;
  planTier: string;
  planBudgetUsd: number;
  rolloverUsd: number;
  spentUsd: number;
}): UsageSnapshot {
  const totalUsed = opts.inputUsed + opts.outputUsed;
  const totalLimit = getTokenPool(opts.planTier);
  const totalRemaining = Math.max(0, totalLimit - totalUsed);
  const creditTotal = opts.planBudgetUsd + opts.rolloverUsd;
  const creditRemainingUsd = roundUsd(Math.max(0, creditTotal - opts.spentUsd));
  const percentUsed =
    totalUsed <= 0 ? 0 : Math.min(100, Math.round((totalUsed / Math.max(1, totalLimit)) * 1000) / 10);
  const percentCreditUsed =
    creditTotal <= 0
      ? 100
      : Math.min(100, Math.round((opts.spentUsd / creditTotal) * 1000) / 10);

  const byModel = dashboardModelPools(opts.planBudgetUsd).map((p) => {
    const usedIn = opts.modelUsed[p.role]?.in ?? 0;
    const usedOut = opts.modelUsed[p.role]?.out ?? 0;
    const spent = roundUsd(opts.modelUsed[p.role]?.cost ?? 0);
    const totalModelUsed = usedIn + usedOut;
    return {
      // §30: `role` carried the raw model id and is deliberately not published. `publicId` is
      // a stable capability-tier key a client can key off without learning the vendor.
      id: p.publicId,
      label: p.label,
      tagline: p.tagline,
      inputUsed: usedIn,
      outputUsed: usedOut,
      inputLimit: Math.floor(p.totalLimit / 2),
      outputLimit: Math.ceil(p.totalLimit / 2),
      totalUsed: totalModelUsed,
      totalLimit: p.totalLimit,
      percentUsed:
        p.totalLimit > 0
          ? Math.min(100, Math.round((totalModelUsed / p.totalLimit) * 1000) / 10)
          : 0,
      budgetUsd: p.budgetUsd,
      spentUsd: spent,
      creditRemainingUsd: roundUsd(Math.max(0, p.budgetUsd - spent)),
    };
  });

  return {
    inputTokensUsed: opts.inputUsed,
    outputTokensUsed: opts.outputUsed,
    totalTokensUsed: totalUsed,
    inputTokensRemaining: Math.max(0, Math.floor(totalLimit * 0.5) - opts.inputUsed),
    outputTokensRemaining: Math.max(0, Math.ceil(totalLimit * 0.5) - opts.outputUsed),
    totalTokensRemaining: totalRemaining,
    percentUsed,
    quotaPeriodStart: opts.start,
    emergencyTokensAvailable: false,
    emergencyTokensClaimedThisMonth: false,
    totalLimit,
    planBudgetUsd: opts.planBudgetUsd,
    rolloverUsd: opts.rolloverUsd,
    spentUsd: roundUsd(opts.spentUsd),
    creditRemainingUsd,
    percentCreditUsed,
    planTier: opts.planTier,
    byModel,
  };
}

function unavailable(): Error {
  return Object.assign(new Error('AI usage could not be verified. Retry shortly.'), { code: 'QUOTA_UNAVAILABLE', statusCode: 503 });
}

function amount(value: unknown, integer = false): number {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))) throw unavailable();
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > Number.MAX_SAFE_INTEGER
    || (integer && !Number.isSafeInteger(number))) throw unavailable();
  return number;
}

async function readUsageRow(userId: string) {
  try {
    if (typeof userId !== 'string' || !userId.trim() || userId !== userId.trim()
      || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_URL) throw unavailable();
    const { data, error } = await getSupabaseAdmin()
      .from('user_token_usage')
      .select('user_id,input_tokens,output_tokens,model_usage,quota_period_start,spent_usd,rollover_usd,plan_budget_usd,plan_tier')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data || data.user_id !== userId || typeof data.plan_tier !== 'string' || !getPlanByTier(data.plan_tier)) throw unavailable();
    if (typeof data.quota_period_start !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(data.quota_period_start)
      || data.quota_period_start > periodStart()) throw unavailable();
    const input = amount(data.input_tokens, true), output = amount(data.output_tokens, true);
    if (!Number.isSafeInteger(input + output)) throw unavailable();
    const spent = amount(data.spent_usd), rollover = amount(data.rollover_usd), budget = amount(data.plan_budget_usd);
    if (!Number.isFinite(budget + rollover) || budget + rollover > Number.MAX_SAFE_INTEGER) throw unavailable();
    if (!data.model_usage || typeof data.model_usage !== 'object' || Array.isArray(data.model_usage)) throw unavailable();
    const models: Record<string, { in: number; out: number; cost: number }> = {};
    for (const [role, raw] of Object.entries(data.model_usage)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw unavailable();
      const value = raw as Record<string, unknown>;
      const modelInput = amount(value.input === undefined ? 0 : value.input, true);
      const modelOutput = amount(value.output === undefined ? 0 : value.output, true);
      if (!Number.isSafeInteger(modelInput + modelOutput)) throw unavailable();
      models[role] = { in: modelInput, out: modelOutput, cost: amount(value.cost_usd === undefined ? 0 : value.cost_usd) };
    }
    return { plan_tier: data.plan_tier, start: data.quota_period_start, input, output, spent, rollover, budget, models };
  } catch {
    throw unavailable();
  }
}

export async function getUsage(userId: string): Promise<UsageSnapshot> {
  const start = periodStart();
  let inputUsed = 0;
  let outputUsed = 0;
  let spentUsd = 0;
  let rolloverUsd = 0;
  const row = await readUsageRow(userId);
  const planTier = row.plan_tier;
  const planBudgetUsd = row.budget;
  const modelUsed: Record<string, { in: number; out: number; cost: number }> = {};

  if (row.start === start) {
    inputUsed = row.input; outputUsed = row.output; spentUsd = row.spent; rolloverUsd = row.rollover;
    Object.assign(modelUsed, row.models);
  } else {
    // Preserve the existing month-transition projection from validated evidence.
    rolloverUsd = roundUsd(Math.min(Math.max(0, row.budget + row.rollover - row.spent), planBudgetUsd));
  }

  const mem = memUsage.get(memKey(userId));
  if (mem) {
    inputUsed = Math.max(inputUsed, mem.input);
    outputUsed = Math.max(outputUsed, mem.output);
    spentUsd = Math.max(spentUsd, mem.spentUsd);
    for (const [k, v] of Object.entries(mem.byModel)) {
      modelUsed[k] = {
        in: Math.max(modelUsed[k]?.in ?? 0, v.in),
        out: Math.max(modelUsed[k]?.out ?? 0, v.out),
        cost: Math.max(modelUsed[k]?.cost ?? 0, v.cost),
      };
    }
  }

  return buildSnapshot({
    inputUsed,
    outputUsed,
    modelUsed,
    start,
    planTier,
    planBudgetUsd,
    rolloverUsd,
    spentUsd,
  });
}

export async function syncPlanBudget(userId: string, planTier: string): Promise<void> {
  const budget = getApiBudgetUsd(planTier);
  const key = memKey(userId);
  const prev = memUsage.get(key);
  if (prev) {
    prev.planTier = planTier;
    prev.planBudgetUsd = budget;
    memUsage.set(key, prev);
  }

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
    const supabase = getSupabaseAdmin();
    await supabase.rpc('set_user_ai_plan_budget', {
      p_user_id: userId,
      p_plan_tier: planTier,
      p_plan_budget_usd: budget,
    });
  } catch (err) {
    console.warn('[quota] syncPlanBudget skipped:', (err as Error).message);
  }
}

export async function recordUsage(
  userId: string,
  modelId: ModelId,
  inputTokens: number,
  outputTokens: number,
): Promise<UsageSnapshot> {
  amount(inputTokens, true); amount(outputTokens, true);
  if (!Number.isSafeInteger(inputTokens + outputTokens)) throw unavailable();
  const start = periodStart();
  const key = memKey(userId);
  const role = poolRoleFor(modelId);
  const costUsd = costUsdForTokens(modelId, inputTokens, outputTokens);
  const durable = await readUsageRow(userId);
  const planTier = durable.plan_tier;
  const planBudgetUsd = durable.budget;

  const prev =
    memUsage.get(key) ??
    ({
      input: 0,
      output: 0,
      spentUsd: 0,
      rolloverUsd: 0,
      planBudgetUsd,
      planTier,
      byModel: {},
    } satisfies MemRow);

  prev.input += inputTokens;
  prev.output += outputTokens;
  prev.spentUsd = roundUsd(prev.spentUsd + costUsd);
  prev.planBudgetUsd = planBudgetUsd;
  prev.planTier = planTier;
  const m = prev.byModel[role] ?? { in: 0, out: 0, cost: 0 };
  m.in += inputTokens;
  m.out += outputTokens;
  m.cost = roundUsd(m.cost + costUsd);
  prev.byModel[role] = m;
  memUsage.set(key, prev);

  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = getSupabaseAdmin();
      await supabase.rpc('increment_user_token_usage', {
        p_user_id: userId,
        p_input: inputTokens,
        p_output: outputTokens,
        p_period: start,
        p_cost_usd: costUsd,
        p_plan_budget_usd: planBudgetUsd,
        p_plan_tier: planTier,
      });
      await supabase.rpc('merge_user_model_usage', {
        p_user_id: userId,
        p_delta: {
          [role]: { input: inputTokens, output: outputTokens, cost_usd: costUsd },
        },
        p_period: start,
      });
      await supabase.rpc('insert_ai_usage_ledger', {
        p_user_id: userId,
        p_model_id: modelId,
        p_pool_role: role,
        p_input: inputTokens,
        p_output: outputTokens,
        p_cost_usd: costUsd,
        p_period: start,
      });
    }
  } catch (err) {
    console.warn('[quota] persist skipped:', (err as Error).message);
  }

  return getUsage(userId);
}

function quotaError(message: string, code = 'OUT_OF_TOKENS'): Error {
  const err = new Error(message);
  (err as Error & { code?: string }).code = code;
  return err;
}

export async function assertHasQuota(userId: string): Promise<UsageSnapshot> {
  const usage = await getUsage(userId);
  if (usage.creditRemainingUsd <= 0) {
    throw quotaError(
      'Monthly AI credit exhausted — upgrade your plan or wait for next month’s rollover.',
    );
  }
  return usage;
}

/** Enforce the shared account ceiling. Model pools remain soft routing/observability targets. */
export async function assertCanUseModel(
  userId: string,
  _modelId: ModelId,
): Promise<UsageSnapshot> {
  return assertHasQuota(userId);
}

export function modelBudgetRemaining(
  usage: UsageSnapshot,
  modelId: ModelId,
): { tokensRemaining: number; creditRemainingUsd: number } {
  // The snapshot is keyed by public capability tier now, so the internal role is translated
  // rather than compared directly.
  const poolRole = poolRoleFor(modelId);
  const publicId = POOL_PUBLIC_ID_BY_ROLE[poolRole] ?? poolRole;
  const pool = usage.byModel.find((m) => m.id === publicId);
  if (!pool) {
    const def = MODELS[modelId];
    return {
      tokensRemaining: def.monthlyTokens,
      creditRemainingUsd: def.budgetUsd,
    };
  }
  return {
    tokensRemaining: Math.max(0, pool.totalLimit - pool.totalUsed),
    creditRemainingUsd: pool.creditRemainingUsd,
  };
}

export function usageToTokenUsage(usage: UsageSnapshot) {
  return {
    inputTokensUsed: usage.inputTokensUsed,
    outputTokensUsed: usage.outputTokensUsed,
    totalTokensUsed: usage.totalTokensUsed,
    inputTokensRemaining: usage.inputTokensRemaining,
    outputTokensRemaining: usage.outputTokensRemaining,
    totalTokensRemaining: usage.totalTokensRemaining,
    percentUsed: usage.percentUsed,
    quotaPeriodStart: usage.quotaPeriodStart,
    emergencyTokensAvailable: usage.emergencyTokensAvailable,
    emergencyTokensClaimedThisMonth: usage.emergencyTokensClaimedThisMonth,
    totalLimit: usage.totalLimit,
    planTier: usage.planTier,
  };
}
