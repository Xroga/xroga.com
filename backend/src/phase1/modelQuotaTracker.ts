/**
 * Per-model token pools — hard sharePct caps so no engine exceeds its slice.
 * Persists to user_token_usage.model_usage (DB-authoritative for dashboard).
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
import { connectPostgres, resolveDatabaseUrls } from '../lib/postgresConnect.js';
import { currentPeriodStart, normalizePeriodDate } from './tokenTracker.js';
import { phase1Logger } from './logger.js';

type ModelUsageMap = Partial<Record<XrogaModelRole, { input: number; output: number }>>;

/** Soft cache only — writers always force DB. */
const memoryModelUsage = new Map<string, ModelUsageMap>();
const memoryModelUsagePeriod = new Map<string, string>();

function emptyUsage(): ModelUsageMap {
  return {};
}

function totalModelTokens(usage: ModelUsageMap): number {
  return Object.values(usage).reduce((s, u) => s + (u?.input ?? 0) + (u?.output ?? 0), 0);
}

function parseModelUsage(raw: unknown): ModelUsageMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyUsage();
  const out: ModelUsageMap = {};
  for (const [role, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const input = Number(e.input ?? 0);
    const output = Number(e.output ?? 0);
    out[role as XrogaModelRole] = {
      input: Number.isFinite(input) ? Math.max(0, input) : 0,
      output: Number.isFinite(output) ? Math.max(0, output) : 0,
    };
  }
  return out;
}

async function loadModelUsage(userId: string, opts?: { forceDb?: boolean }): Promise<ModelUsageMap> {
  const period = currentPeriodStart();
  const cached = memoryModelUsage.get(userId);
  if (!opts?.forceDb && cached && memoryModelUsagePeriod.get(userId) === period) {
    return cached;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const mem = cached ?? emptyUsage();
    memoryModelUsage.set(userId, mem);
    memoryModelUsagePeriod.set(userId, period);
    return mem;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_token_usage')
      .select('model_usage, quota_period_start')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      phase1Logger.warn('model usage DB load error', { userId, error: error.message });
      return cached ?? emptyUsage();
    }

    if (!data) {
      memoryModelUsage.set(userId, emptyUsage());
      memoryModelUsagePeriod.set(userId, period);
      return emptyUsage();
    }

    const rowPeriod = normalizePeriodDate(data.quota_period_start);

    // New month: only treat as empty after a confident period advance.
    // Never wipe DB here — tokenTracker owns month reset; stale period label keeps history.
    if (rowPeriod && rowPeriod !== period) {
      phase1Logger.info('model usage period rollover pending', { userId, rowPeriod, period });
      // If totals were rolled already, model_usage may be {}; otherwise keep until next write merges.
      const parsed = parseModelUsage(data.model_usage);
      // Prefer empty for true new month only when JSON is already empty
      if (totalModelTokens(parsed) === 0) {
        memoryModelUsage.set(userId, emptyUsage());
        memoryModelUsagePeriod.set(userId, period);
        return emptyUsage();
      }
      // Keep showing prior engine usage until tokenTracker resets the row
      memoryModelUsage.set(userId, parsed);
      memoryModelUsagePeriod.set(userId, rowPeriod);
      return parsed;
    }

    const parsed = parseModelUsage(data.model_usage);
    memoryModelUsage.set(userId, parsed);
    memoryModelUsagePeriod.set(userId, period);
    return parsed;
  } catch (err) {
    phase1Logger.warn('model usage load failed', { error: (err as Error).message });
    return cached ?? emptyUsage();
  }
}

async function mergeModelUsageAtomic(userId: string, delta: ModelUsageMap): Promise<ModelUsageMap | null> {
  const period = currentPeriodStart();
  const deltaJson: Record<string, { input: number; output: number }> = {};
  for (const [role, used] of Object.entries(delta)) {
    if (!used) continue;
    deltaJson[role] = { input: used.input ?? 0, output: used.output ?? 0 };
  }

  if (resolveDatabaseUrls().length) {
    try {
      const client = await connectPostgres();
      try {
        const { rows } = await client.query<{ merge_user_model_usage: ModelUsageMap }>(
          `SELECT public.merge_user_model_usage($1::uuid, $2::jsonb, $3::date) AS merge_user_model_usage`,
          [userId, JSON.stringify(deltaJson), period]
        );
        const merged = parseModelUsage(rows[0]?.merge_user_model_usage);
        return merged;
      } finally {
        await client.end().catch(() => undefined);
      }
    } catch (err) {
      phase1Logger.warn('model usage postgres merge failed — trying supabase rpc', {
        error: (err as Error).message,
      });
    }
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('merge_user_model_usage', {
      p_user_id: userId,
      p_delta: deltaJson,
      p_period: period,
    });
    if (error) {
      phase1Logger.warn('merge_user_model_usage rpc failed', { userId, error: error.message });
      return null;
    }
    return parseModelUsage(data);
  } catch (err) {
    phase1Logger.warn('merge_user_model_usage rpc exception', { error: (err as Error).message });
    return null;
  }
}

async function saveModelUsageFallback(userId: string, usage: ModelUsageMap): Promise<boolean> {
  memoryModelUsage.set(userId, usage);
  memoryModelUsagePeriod.set(userId, currentPeriodStart());
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return false;

  try {
    await ensureUserRecords(userId);
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('user_token_usage')
      .update({ model_usage: usage, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    if (error) {
      phase1Logger.warn('model usage update failed', { userId, error: error.message });
      return false;
    }
    return true;
  } catch (err) {
    phase1Logger.warn('model usage save failed', { error: (err as Error).message });
    return false;
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
      supabase
        .from('user_token_usage')
        .select('emergency_bonus, bonus_tokens, quota_period_start')
        .eq('user_id', userId)
        .maybeSingle(),
    ]);
    const tier = tierRow?.plan_tier ?? 'unpaid';
    const base = quotaForPlanTier(tier);
    const period = currentPeriodStart();
    const rowPeriod = normalizePeriodDate(usageRow?.quota_period_start);
    if (!usageRow || (rowPeriod && rowPeriod !== period)) return base;
    return base + Number(usageRow.emergency_bonus ?? 0) + Number(usageRow.bonus_tokens ?? 0);
  } catch {
    return quotaForPlanTier('unpaid');
  }
}

/** Can this model role accept more tokens this month? Hard sharePct enforcement. */
export async function canUseModelRole(
  userId: string | undefined,
  role: XrogaModelRole,
  estimatedInput: number,
  estimatedOutput: number
): Promise<boolean> {
  if (!userId) return true;
  if (!CORE_BUILD_MODELS.includes(role)) return true;

  const [usage, totalLimit] = await Promise.all([loadModelUsage(userId, { forceDb: true }), getTotalLimit(userId)]);
  const limits = modelLimitsForUser(totalLimit, role);
  const used = usage[role] ?? { input: 0, output: 0 };

  const withinPool =
    used.input + estimatedInput <= limits.input && used.output + estimatedOutput <= limits.output;

  if (!withinPool) {
    phase1Logger.info('Model sharePct cap reached', {
      userId,
      role,
      used,
      limits,
      estimatedInput,
      estimatedOutput,
    });
    return false;
  }

  if (CLAUDE_MODEL_ROLES.includes(role)) {
    const spent = claudeUsdFromUsage(usage);
    const next = estimateUsdCost(estimatedInput, estimatedOutput, role);
    if (spent + next > CLAUDE_MONTHLY_BUDGET_USD) {
      phase1Logger.info('Claude USD budget exhausted', { userId, spent, next, cap: CLAUDE_MONTHLY_BUDGET_USD });
      return false;
    }
  }

  return true;
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

  const delta: ModelUsageMap = {};
  for (const line of lines) {
    const prev = delta[line.role] ?? { input: 0, output: 0 };
    delta[line.role] = {
      input: prev.input + Math.max(0, Math.round(line.inputTokens)),
      output: prev.output + Math.max(0, Math.round(line.outputTokens)),
    };
  }

  const merged = await mergeModelUsageAtomic(userId, delta);
  if (merged) {
    memoryModelUsage.set(userId, merged);
    memoryModelUsagePeriod.set(userId, currentPeriodStart());
    phase1Logger.info('Model usage recorded', {
      userId,
      totalModelTokens: totalModelTokens(merged),
      persisted: true,
    });
    return;
  }

  // Fallback: load → add → update (racy across instances, but better than drop)
  const usage = await loadModelUsage(userId, { forceDb: true });
  for (const [role, add] of Object.entries(delta)) {
    if (!add) continue;
    const prev = usage[role as XrogaModelRole] ?? { input: 0, output: 0 };
    usage[role as XrogaModelRole] = {
      input: prev.input + add.input,
      output: prev.output + add.output,
    };
  }
  const ok = await saveModelUsageFallback(userId, usage);
  phase1Logger.info('Model usage recorded (fallback)', {
    userId,
    totalModelTokens: totalModelTokens(usage),
    persisted: ok,
  });
}

export type BuildModelRole = 'flash' | 'pro' | 'grok' | 'sonnet' | 'opus';

const ROLE_TO_XROGA: Record<BuildModelRole, XrogaModelRole> = {
  flash: 'deepseek_flash',
  pro: 'deepseek_pro',
  grok: 'grok_reasoning',
  sonnet: 'claude_sonnet',
  opus: 'claude_opus',
};

/** Cheaper fallbacks when a role’s sharePct slice is exhausted — never escalate cost. */
const ROLE_FALLBACKS: Record<BuildModelRole, BuildModelRole[]> = {
  opus: ['sonnet', 'pro', 'flash'],
  sonnet: ['pro', 'flash'],
  grok: ['pro', 'flash'],
  pro: ['flash'],
  flash: [],
};

/** Pick fallback when Claude pool is empty — NEVER escalate to Grok (cost). */
export function claudeFallbackRole(task: 'ui' | 'qa'): BuildModelRole {
  return task === 'ui' ? 'flash' : 'pro';
}

/**
 * Hard-cap resolver for every Black Hole V∞ engine.
 * If the requested role’s % slice is exhausted, remap to a cheaper role with room.
 */
export async function resolveBuildModelRole(
  userId: string | undefined,
  role: BuildModelRole,
  task: 'ui' | 'qa' | 'general' = 'general',
  estimate = { input: 12_000, output: 8_000 }
): Promise<BuildModelRole> {
  const candidates: BuildModelRole[] = [role, ...ROLE_FALLBACKS[role]];
  // Claude UI/QA historic shortcut still prefers flash/pro when sonnet/opus empty
  if ((role === 'sonnet' || role === 'opus') && task !== 'general') {
    const preferred = claudeFallbackRole(task);
    if (!candidates.includes(preferred)) candidates.push(preferred);
  }

  for (const candidate of candidates) {
    const xrogaRole = ROLE_TO_XROGA[candidate];
    const ok = await canUseModelRole(userId, xrogaRole, estimate.input, estimate.output);
    if (ok) {
      if (candidate !== role) {
        phase1Logger.info('Model sharePct remapped', { from: role, to: candidate, userId, task });
      }
      return candidate;
    }
  }

  // All capped — still return cheapest so call can proceed under global checkQuota
  phase1Logger.warn('All model sharePct slices tight — using flash', { role, userId });
  return 'flash';
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
  const [usage, totalLimit] = await Promise.all([
    loadModelUsage(userId, { forceDb: true }),
    getTotalLimit(userId),
  ]);
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
        totalLimitForModel > 0
          ? Math.min(100, Math.round((totalUsedForModel / totalLimitForModel) * 100))
          : 0,
    };
  });
}

export function clearModelQuotaMemoryCache(userId?: string): void {
  if (userId) {
    memoryModelUsage.delete(userId);
    memoryModelUsagePeriod.delete(userId);
  } else {
    memoryModelUsage.clear();
    memoryModelUsagePeriod.clear();
  }
}
