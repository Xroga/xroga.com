import { getSupabaseAdmin } from '../config/supabase.js';
import {
  MODELS,
  MONTHLY_TOTAL_BUDGET_USD,
  MONTHLY_TOTAL_TOKENS,
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
    role: string;
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
  if (modelId.startsWith('deepseek')) return 'deepseek_v4';
  if (modelId.startsWith('grok')) return 'grok';
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

/** In-memory fallback when DB/RPC unavailable — still shared per process; Supabase is source of truth across devices. */
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
      role: p.role,
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

async function resolvePlanTier(userId: string): Promise<string> {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 'spark';
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('user_actions')
      .select('plan_tier')
      .eq('user_id', userId)
      .maybeSingle();
    const tier = data?.plan_tier ? String(data.plan_tier) : 'unpaid';
    return getPlanByTier(tier) ? tier : 'unpaid';
  } catch {
    return 'spark';
  }
}

export async function getUsage(userId: string): Promise<UsageSnapshot> {
  const start = periodStart();
  let inputUsed = 0;
  let outputUsed = 0;
  let spentUsd = 0;
  let rolloverUsd = 0;
  let planTier = await resolvePlanTier(userId);
  let planBudgetUsd = getApiBudgetUsd(planTier);
  const modelUsed: Record<string, { in: number; out: number; cost: number }> = {};

  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('user_token_usage')
        .select(
          'input_tokens, output_tokens, model_usage, quota_period_start, spent_usd, rollover_usd, plan_budget_usd, plan_tier',
        )
        .eq('user_id', userId)
        .maybeSingle();

      if (data) {
        const rowPeriod = data.quota_period_start
          ? String(data.quota_period_start).slice(0, 10)
          : start;
        const samePeriod =
          rowPeriod === start || rowPeriod.startsWith(start.slice(0, 7));

        if (data.plan_tier) {
          planTier = String(data.plan_tier);
          planBudgetUsd = Number(data.plan_budget_usd) || getApiBudgetUsd(planTier);
        } else {
          planBudgetUsd = getApiBudgetUsd(planTier);
        }

        if (samePeriod) {
          inputUsed = Number(data.input_tokens) || 0;
          outputUsed = Number(data.output_tokens) || 0;
          spentUsd = Number(data.spent_usd) || 0;
          rolloverUsd = Number(data.rollover_usd) || 0;
          const mu = (data.model_usage ?? {}) as Record<
            string,
            { input?: number; output?: number; cost_usd?: number }
          >;
          for (const [role, v] of Object.entries(mu)) {
            modelUsed[role] = {
              in: Number(v?.input) || 0,
              out: Number(v?.output) || 0,
              cost: Number(v?.cost_usd) || 0,
            };
          }
        } else {
          // Month flipped but row not yet reset via RPC — treat as fresh period with rollover.
          const prevBudget = Number(data.plan_budget_usd) || planBudgetUsd;
          const prevSpent = Number(data.spent_usd) || 0;
          const prevRollover = Number(data.rollover_usd) || 0;
          rolloverUsd = roundUsd(
            Math.min(
              Math.max(0, prevBudget + prevRollover - prevSpent),
              planBudgetUsd,
            ),
          );
          spentUsd = 0;
        }
      }
    }
  } catch (err) {
    console.warn('[quota] getUsage DB skipped:', (err as Error).message);
  }

  const mem = memUsage.get(memKey(userId));
  if (mem) {
    inputUsed = Math.max(inputUsed, mem.input);
    outputUsed = Math.max(outputUsed, mem.output);
    spentUsd = Math.max(spentUsd, mem.spentUsd);
    rolloverUsd = Math.max(rolloverUsd, mem.rolloverUsd);
    planBudgetUsd = mem.planBudgetUsd || planBudgetUsd;
    planTier = mem.planTier || planTier;
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
  const start = periodStart();
  const key = memKey(userId);
  const role = poolRoleFor(modelId);
  const costUsd = costUsdForTokens(modelId, inputTokens, outputTokens);
  const planTier = await resolvePlanTier(userId);
  const planBudgetUsd = getApiBudgetUsd(planTier);

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
  if (usage.totalTokensRemaining <= 0) {
    throw quotaError('Monthly AI token quota exhausted — upgrade your plan to continue.');
  }
  return usage;
}

/** Enforce total credit + hard per-model pool caps before a call. */
export async function assertCanUseModel(
  userId: string,
  modelId: ModelId,
): Promise<UsageSnapshot> {
  const usage = await assertHasQuota(userId);
  const remaining = modelBudgetRemaining(usage, modelId);
  if (remaining.tokensRemaining <= 0 || remaining.creditRemainingUsd <= 0) {
    const label = MODELS[modelId]?.label ?? modelId;
    throw quotaError(
      `${label} monthly capacity is used up — try a lighter model or upgrade your plan.`,
      'MODEL_CAP_REACHED',
    );
  }
  return usage;
}

export function modelBudgetRemaining(
  usage: UsageSnapshot,
  modelId: ModelId,
): { tokensRemaining: number; creditRemainingUsd: number } {
  const poolRole = poolRoleFor(modelId);
  const pool = usage.byModel.find((m) => m.role === poolRole);
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
    planBudgetUsd: usage.planBudgetUsd,
    rolloverUsd: usage.rolloverUsd,
    spentUsd: usage.spentUsd,
    creditRemainingUsd: usage.creditRemainingUsd,
    percentCreditUsed: usage.percentCreditUsed,
    planTier: usage.planTier,
  };
}

export function usageToDashboardTokens(usage: UsageSnapshot) {
  const daysInMonth = 30;
  const dayOfMonth = new Date().getUTCDate();
  const daysRemaining = Math.max(1, daysInMonth - dayOfMonth + 1);
  return {
    totalLimit: usage.totalLimit,
    totalUsed: usage.totalTokensUsed,
    totalRemaining: usage.totalTokensRemaining,
    percentUsed: usage.percentUsed,
    inputUsed: usage.inputTokensUsed,
    inputLimit: Math.floor(usage.totalLimit / 2),
    inputRemaining: usage.inputTokensRemaining,
    outputUsed: usage.outputTokensUsed,
    outputLimit: Math.ceil(usage.totalLimit / 2),
    outputRemaining: usage.outputTokensRemaining,
    emergencyAvailable: false,
    emergencyClaimed: false,
    daysRemaining,
    estimatedDailyUsage:
      dayOfMonth > 0 ? Math.round(usage.totalTokensUsed / dayOfMonth) : 0,
    quotaPeriodStart: usage.quotaPeriodStart,
    planBudgetUsd: usage.planBudgetUsd,
    rolloverUsd: usage.rolloverUsd,
    spentUsd: usage.spentUsd,
    creditRemainingUsd: usage.creditRemainingUsd,
    percentCreditUsed: usage.percentCreditUsed,
    byModel: usage.byModel,
  };
}

/** Defaults for economics endpoint / docs. */
export function baseEconomics() {
  return {
    monthlyTotalBudgetUsd: MONTHLY_TOTAL_BUDGET_USD,
    monthlyTotalTokens: MONTHLY_TOTAL_TOKENS,
  };
}
