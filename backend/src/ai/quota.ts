import { getSupabaseAdmin } from '../config/supabase.js';
import {
  MODELS,
  MONTHLY_TOTAL_TOKENS,
  type ModelId,
  dashboardModelPools,
} from './models.js';

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

/** In-memory fallback when DB/RPC unavailable. */
const memUsage = new Map<
  string,
  { input: number; output: number; byModel: Record<string, { in: number; out: number }> }
>();

function memKey(userId: string): string {
  return `${userId}:${periodStart()}`;
}

function buildSnapshot(
  inputUsed: number,
  outputUsed: number,
  modelUsed: Record<string, { in: number; out: number }>,
  start: string,
): UsageSnapshot {
  const totalUsed = inputUsed + outputUsed;
  const totalLimit = MONTHLY_TOTAL_TOKENS;
  const totalRemaining = Math.max(0, totalLimit - totalUsed);
  const percentUsed =
    totalUsed <= 0 ? 0 : Math.min(100, Math.round((totalUsed / totalLimit) * 1000) / 10);

  const byModel = dashboardModelPools().map((p) => {
    const usedIn = modelUsed[p.role]?.in ?? 0;
    const usedOut = modelUsed[p.role]?.out ?? 0;
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
    };
  });

  return {
    inputTokensUsed: inputUsed,
    outputTokensUsed: outputUsed,
    totalTokensUsed: totalUsed,
    inputTokensRemaining: Math.max(0, Math.floor(totalLimit * 0.5) - inputUsed),
    outputTokensRemaining: Math.max(0, Math.ceil(totalLimit * 0.5) - outputUsed),
    totalTokensRemaining: totalRemaining,
    percentUsed,
    quotaPeriodStart: start,
    emergencyTokensAvailable: false,
    emergencyTokensClaimedThisMonth: false,
    totalLimit,
    byModel,
  };
}

export async function getUsage(userId: string): Promise<UsageSnapshot> {
  const start = periodStart();
  let inputUsed = 0;
  let outputUsed = 0;
  const modelUsed: Record<string, { in: number; out: number }> = {};

  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = getSupabaseAdmin();
      const { data } = await supabase
        .from('user_token_usage')
        .select('input_tokens, output_tokens, model_usage, quota_period_start')
        .eq('user_id', userId)
        .maybeSingle();

      if (data) {
        const rowPeriod = data.quota_period_start
          ? String(data.quota_period_start).slice(0, 10)
          : start;
        if (rowPeriod === start || rowPeriod.startsWith(start.slice(0, 7))) {
          inputUsed = Number(data.input_tokens) || 0;
          outputUsed = Number(data.output_tokens) || 0;
          const mu = (data.model_usage ?? {}) as Record<string, { input?: number; output?: number }>;
          for (const [role, v] of Object.entries(mu)) {
            modelUsed[role] = {
              in: Number(v?.input) || 0,
              out: Number(v?.output) || 0,
            };
          }
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
    for (const [k, v] of Object.entries(mem.byModel)) {
      modelUsed[k] = {
        in: Math.max(modelUsed[k]?.in ?? 0, v.in),
        out: Math.max(modelUsed[k]?.out ?? 0, v.out),
      };
    }
  }

  return buildSnapshot(inputUsed, outputUsed, modelUsed, start);
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
  const prev = memUsage.get(key) ?? { input: 0, output: 0, byModel: {} };
  prev.input += inputTokens;
  prev.output += outputTokens;
  const m = prev.byModel[role] ?? { in: 0, out: 0 };
  m.in += inputTokens;
  m.out += outputTokens;
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
      });
      await supabase.rpc('merge_user_model_usage', {
        p_user_id: userId,
        p_delta: {
          [role]: { input: inputTokens, output: outputTokens },
        },
        p_period: start,
      });
    }
  } catch (err) {
    console.warn('[quota] persist skipped:', (err as Error).message);
  }

  return getUsage(userId);
}

export async function assertHasQuota(userId: string): Promise<UsageSnapshot> {
  const usage = await getUsage(userId);
  if (usage.totalTokensRemaining <= 0) {
    const err = new Error('Monthly AI token quota exhausted — upgrade your plan to continue.');
    (err as Error & { code?: string }).code = 'OUT_OF_TOKENS';
    throw err;
  }
  return usage;
}

export function modelBudgetRemaining(usage: UsageSnapshot, modelId: ModelId): number {
  const def = MODELS[modelId];
  const poolRole = poolRoleFor(modelId);
  const pool = usage.byModel.find((m) => m.role === poolRole);
  if (!pool) return def.monthlyTokens;
  return Math.max(0, pool.totalLimit - pool.totalUsed);
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
    byModel: usage.byModel,
  };
}
