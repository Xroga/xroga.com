/**
 * Per-model token pools — when Claude slice is exhausted, builds skip Claude
 * and use DeepSeek Pro / Grok instead.
 */

import { publicModelLabel, publicModelTagline } from '../config/xrogaPublicModels.js';
import type { XrogaModelRole } from '../config/modelRegistry.js';
import {
  CLAUDE_MODEL_ROLES,
  CLAUDE_MONTHLY_BUDGET_USD,
  CORE_BUILD_MODELS,
  XROGA_MODELS,
  claudeUsdFromUsage,
  estimateUsdCost,
  inputLimitForPlan,
  outputLimitForPlan,
  quotaForPlanTier,
} from '../config/modelRegistry.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { ensureUserRecords } from '../services/ensureUserRecords.js';
import { phase1Logger } from './logger.js';

type ModelUsageMap = Partial<Record<XrogaModelRole, { input: number; output: number }>>;

const memoryModelUsage = new Map<string, ModelUsageMap>();
const memoryModelUsagePeriod = new Map<string, string>();

function currentPeriodStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function emptyUsage(): ModelUsageMap {
  return {};
}

async function loadModelUsage(userId: string): Promise<ModelUsageMap> {
  const period = currentPeriodStart();
  const cached = memoryModelUsage.get(userId);
  if (cached && memoryModelUsagePeriod.get(userId) === period) {
    return cached;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    memoryModelUsage.set(userId, emptyUsage());
    memoryModelUsagePeriod.set(userId, period);
    return emptyUsage();
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('user_token_usage')
      .select('model_usage, quota_period_start')
      .eq('user_id', userId)
      .maybeSingle();

    if (!data || data.quota_period_start !== period) {
      memoryModelUsage.set(userId, emptyUsage());
      memoryModelUsagePeriod.set(userId, period);
      if (data && data.quota_period_start !== period) {
        await supabase
          .from('user_token_usage')
          .update({ model_usage: {}, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
      }
      return emptyUsage();
    }

    const parsed = (data.model_usage as ModelUsageMap | null) ?? emptyUsage();
    memoryModelUsage.set(userId, parsed);
    memoryModelUsagePeriod.set(userId, period);
    return parsed;
  } catch {
    return emptyUsage();
  }
}

async function saveModelUsage(userId: string, usage: ModelUsageMap): Promise<void> {
  memoryModelUsage.set(userId, usage);
  memoryModelUsagePeriod.set(userId, currentPeriodStart());
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    await ensureUserRecords(userId);
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('user_token_usage')
      .update({ model_usage: usage, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) {
      phase1Logger.debug('model usage update skipped', { userId, error: error.message });
    }
  } catch (err) {
    phase1Logger.warn('model usage save failed', { error: (err as Error).message });
  }
}

function modelLimitsForUser(totalLimit: number, role: XrogaModelRole): { input: number; output: number } {
  const inputPool = inputLimitForPlan(totalLimit);
  const outputPool = outputLimitForPlan(totalLimit);
  const m = XROGA_MODELS[role];
  return {
    input: Math.round((inputPool * m.inputSharePct) / 100),
    output: Math.round((outputPool * m.outputSharePct) / 100),
  };
}

async function getTotalLimit(userId: string): Promise<number> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return quotaForPlanTier('unpaid');
  try {
    const supabase = getSupabaseAdmin();
    const [{ data: tierRow }, { data: usageRow }] = await Promise.all([
      supabase.from('user_actions').select('plan_tier').eq('user_id', userId).maybeSingle(),
      supabase.from('user_token_usage').select('emergency_bonus, bonus_tokens, quota_period_start').eq('user_id', userId).maybeSingle(),
    ]);
    const tier = tierRow?.plan_tier ?? 'unpaid';
    const base = quotaForPlanTier(tier);
    const period = currentPeriodStart();
    if (!usageRow || usageRow.quota_period_start !== period) return base;
    return base + Number(usageRow.emergency_bonus ?? 0) + Number(usageRow.bonus_tokens ?? 0);
  } catch {
    return quotaForPlanTier('unpaid');
  }
}

/** Can this model role accept more tokens this month? */
export async function canUseModelRole(
  userId: string | undefined,
  role: XrogaModelRole,
  estimatedInput: number,
  estimatedOutput: number
): Promise<boolean> {
  if (!userId) return true;
  if (!CORE_BUILD_MODELS.includes(role)) return true;

  const [usage, totalLimit] = await Promise.all([loadModelUsage(userId), getTotalLimit(userId)]);
  const limits = modelLimitsForUser(totalLimit, role);
  const used = usage[role] ?? { input: 0, output: 0 };

  const withinPool =
    used.input + estimatedInput <= limits.input && used.output + estimatedOutput <= limits.output;

  if (CLAUDE_MODEL_ROLES.includes(role)) {
    const spent = claudeUsdFromUsage(usage);
    const next = estimateUsdCost(estimatedInput, estimatedOutput, role);
    if (spent + next > CLAUDE_MONTHLY_BUDGET_USD) {
      phase1Logger.info('Claude USD budget exhausted', { userId, spent, next, cap: CLAUDE_MONTHLY_BUDGET_USD });
      return false;
    }
  }

  return withinPool;
}

export async function clearModelUsageForUser(userId: string): Promise<void> {
  memoryModelUsage.set(userId, emptyUsage());
  memoryModelUsagePeriod.set(userId, currentPeriodStart());
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const supabase = getSupabaseAdmin();
    await supabase
      .from('user_token_usage')
      .update({ model_usage: {}, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  } catch {
    /* optional */
  }
}

/** Record per-model usage after a build completes. */
export async function recordModelUsage(
  userId: string,
  lines: Array<{ role: XrogaModelRole; inputTokens: number; outputTokens: number }>
): Promise<void> {
  if (!lines.length) return;
  const usage = await loadModelUsage(userId);
  for (const line of lines) {
    const prev = usage[line.role] ?? { input: 0, output: 0 };
    usage[line.role] = {
      input: prev.input + line.inputTokens,
      output: prev.output + line.outputTokens,
    };
  }
  await saveModelUsage(userId, usage);
}

export type BuildModelRole = 'flash' | 'pro' | 'grok' | 'sonnet' | 'opus';

const ROLE_TO_XROGA: Record<BuildModelRole, XrogaModelRole> = {
  flash: 'deepseek_flash',
  pro: 'deepseek_pro',
  grok: 'grok_reasoning',
  sonnet: 'claude_sonnet',
  opus: 'claude_opus',
};

/** Pick fallback when Claude pool is empty — NEVER escalate to Grok (cost). */
export function claudeFallbackRole(task: 'ui' | 'qa'): BuildModelRole {
  return task === 'ui' ? 'flash' : 'pro';
}

export async function resolveBuildModelRole(
  userId: string | undefined,
  role: BuildModelRole,
  task: 'ui' | 'qa' | 'general' = 'general',
  estimate = { input: 12_000, output: 8_000 }
): Promise<BuildModelRole> {
  if (role !== 'sonnet' && role !== 'opus') return role;
  const xrogaRole = ROLE_TO_XROGA[role];
  const ok = await canUseModelRole(userId, xrogaRole, estimate.input, estimate.output);
  if (ok) return role;
  const fallback = claudeFallbackRole(task === 'general' ? 'qa' : task);
  phase1Logger.info('Claude pool exhausted — fallback', { from: role, to: fallback, userId });
  return fallback;
}

export interface ModelUsageBreakdownRow {
  role: XrogaModelRole;
  label: string;
  tagline: string;
  inputUsed: number;
  outputUsed: number;
  inputLimit: number;
  outputLimit: number;
  totalUsed: number;
  totalLimit: number;
  percentUsed: number;
}

/** Per-model usage vs allocated pool — for dashboard (Xroga-branded labels only). */
export async function getModelUsageBreakdown(userId: string): Promise<ModelUsageBreakdownRow[]> {
  const [usage, totalLimit] = await Promise.all([loadModelUsage(userId), getTotalLimit(userId)]);
  return CORE_BUILD_MODELS.map((role) => {
    const limits = modelLimitsForUser(totalLimit, role);
    const used = usage[role] ?? { input: 0, output: 0 };
    const totalLimitForModel = limits.input + limits.output;
    const totalUsedForModel = used.input + used.output;
    return {
      role,
      label: publicModelLabel(role),
      tagline: publicModelTagline(role),
      inputUsed: used.input,
      outputUsed: used.output,
      inputLimit: limits.input,
      outputLimit: limits.output,
      totalUsed: totalUsedForModel,
      totalLimit: totalLimitForModel,
      percentUsed:
        totalLimitForModel > 0 ? Math.min(100, Math.round((totalUsedForModel / totalLimitForModel) * 100)) : 0,
    };
  });
}
