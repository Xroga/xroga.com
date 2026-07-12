/**
 * Per-model token pools — when Claude slice is exhausted, builds skip Claude
 * and use DeepSeek Pro / Grok instead.
 */

import type { XrogaModelRole } from '../config/modelRegistry.js';
import {
  CORE_BUILD_MODELS,
  XROGA_MODELS,
  inputLimitForPlan,
  outputLimitForPlan,
  quotaForPlanTier,
} from '../config/modelRegistry.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { phase1Logger } from './logger.js';

type ModelUsageMap = Partial<Record<XrogaModelRole, { input: number; output: number }>>;

const memoryModelUsage = new Map<string, ModelUsageMap>();

function currentPeriodStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function emptyUsage(): ModelUsageMap {
  return {};
}

async function loadModelUsage(userId: string): Promise<ModelUsageMap> {
  const cached = memoryModelUsage.get(userId);
  if (cached) return cached;

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return emptyUsage();
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('user_token_usage')
      .select('model_usage, quota_period_start')
      .eq('user_id', userId)
      .maybeSingle();

    const period = currentPeriodStart();
    if (!data || data.quota_period_start !== period) {
      memoryModelUsage.set(userId, emptyUsage());
      return emptyUsage();
    }

    const parsed = (data.model_usage as ModelUsageMap | null) ?? emptyUsage();
    memoryModelUsage.set(userId, parsed);
    return parsed;
  } catch {
    return emptyUsage();
  }
}

async function saveModelUsage(userId: string, usage: ModelUsageMap): Promise<void> {
  memoryModelUsage.set(userId, usage);
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('user_token_usage')
      .update({ model_usage: usage, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) {
      phase1Logger.debug('model usage update skipped (no row yet)', { userId });
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

  return (
    used.input + estimatedInput <= limits.input && used.output + estimatedOutput <= limits.output
  );
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

/** Pick fallback when Claude pool is empty — DeepSeek Pro for UI/QA, Grok for strategy. */
export function claudeFallbackRole(task: 'ui' | 'qa'): BuildModelRole {
  return task === 'ui' ? 'grok' : 'pro';
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
