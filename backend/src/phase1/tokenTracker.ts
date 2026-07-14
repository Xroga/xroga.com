/**
 * Token usage — DB-authoritative monthly quotas.
 * Always re-read from Supabase for getUsage so multi-instance Fly + refresh shows real %
 * (not a per-process memory Map that resets to 0% after leave/return).
 */

import { QUOTA } from './models.js';
import { phase1Logger } from './logger.js';
import type { TokenUsageSnapshot } from './types.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { quotaForPlanTier, inputLimitForPlan, outputLimitForPlan } from '../config/modelRegistry.js';
import { ensureUserRecords } from '../services/ensureUserRecords.js';
import { connectPostgres, resolveDatabaseUrls } from '../lib/postgresConnect.js';

interface UserUsageRecord {
  inputTokens: number;
  outputTokens: number;
  emergencyBonus: number;
  bonusTokens: number;
  emergencyClaimedAt: string | null;
  periodStart: string;
}

/** Soft cache only — never sole source of truth for dashboard. */
const memoryStore = new Map<string, UserUsageRecord>();

export function currentPeriodStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Normalize DATE / timestamptz / string to YYYY-MM-DD for safe compare. */
export function normalizePeriodDate(value: unknown): string {
  if (value == null) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function emptyRecord(): UserUsageRecord {
  return {
    inputTokens: 0,
    outputTokens: 0,
    emergencyBonus: 0,
    bonusTokens: 0,
    emergencyClaimedAt: null,
    periodStart: currentPeriodStart(),
  };
}

function maybeResetPeriod(record: UserUsageRecord): UserUsageRecord {
  const period = currentPeriodStart();
  const start = normalizePeriodDate(record.periodStart);
  if (start && start !== period) {
    return {
      ...emptyRecord(),
      periodStart: period,
      // Keep bonuses within the new month only after claimed — emergency resets monthly.
      bonusTokens: 0,
      emergencyBonus: 0,
      emergencyClaimedAt: null,
    };
  }
  return { ...record, periodStart: period };
}

async function loadFromDb(userId: string): Promise<UserUsageRecord | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_token_usage')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      phase1Logger.warn('Token usage DB load error', { userId, error: error.message });
      return null;
    }
    if (!data) return null;

    const period = currentPeriodStart();
    const rowPeriod = normalizePeriodDate(data.quota_period_start);

    // Only wipe when we confidently know the calendar month advanced.
    if (rowPeriod && rowPeriod !== period) {
      const { error: resetErr } = await supabase
        .from('user_token_usage')
        .update({
          input_tokens: 0,
          output_tokens: 0,
          model_usage: {},
          emergency_bonus: 0,
          emergency_claimed_at: null,
          quota_period_start: period,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
      if (resetErr) {
        phase1Logger.warn('Token usage period reset failed — keeping prior counters', {
          userId,
          error: resetErr.message,
          rowPeriod,
          period,
        });
        // Do NOT zero in memory if DB reset failed
        return {
          inputTokens: Number(data.input_tokens ?? 0),
          outputTokens: Number(data.output_tokens ?? 0),
          emergencyBonus: Number(data.emergency_bonus ?? 0),
          bonusTokens: Number(data.bonus_tokens ?? 0),
          emergencyClaimedAt: data.emergency_claimed_at ?? null,
          periodStart: rowPeriod || period,
        };
      }
      return emptyRecord();
    }

    return {
      inputTokens: Number(data.input_tokens ?? 0),
      outputTokens: Number(data.output_tokens ?? 0),
      emergencyBonus: Number(data.emergency_bonus ?? 0),
      bonusTokens: Number(data.bonus_tokens ?? 0),
      emergencyClaimedAt: data.emergency_claimed_at ?? null,
      periodStart: period,
    };
  } catch (err) {
    phase1Logger.warn('Token usage DB load skipped', { error: (err as Error).message });
    return null;
  }
}

async function saveToDb(userId: string, record: UserUsageRecord): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    phase1Logger.warn('Token usage not persisted — SUPABASE_SERVICE_ROLE_KEY missing');
    return false;
  }
  try {
    await ensureUserRecords(userId);
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('user_token_usage').upsert(
      {
        user_id: userId,
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
        emergency_bonus: record.emergencyBonus,
        bonus_tokens: record.bonusTokens,
        emergency_claimed_at: record.emergencyClaimedAt,
        quota_period_start: record.periodStart,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    if (error) {
      phase1Logger.warn('Token usage DB save failed', { userId, error: error.message });
      return false;
    }
    return true;
  } catch (err) {
    phase1Logger.warn('Token usage DB save failed', { error: (err as Error).message });
    return false;
  }
}

type IncrementRow = {
  input_tokens: number;
  output_tokens: number;
  emergency_bonus: number;
  bonus_tokens: number;
  emergency_claimed_at: string | null;
  quota_period_start: string;
};

function recordFromIncrementRow(row: IncrementRow): UserUsageRecord {
  return {
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    emergencyBonus: Number(row.emergency_bonus ?? 0),
    bonusTokens: Number(row.bonus_tokens ?? 0),
    emergencyClaimedAt: row.emergency_claimed_at ?? null,
    periodStart: normalizePeriodDate(row.quota_period_start) || currentPeriodStart(),
  };
}

/** Additive DB write — safe across multiple Fly instances (no absolute overwrite races). */
async function incrementUsageAtomic(
  userId: string,
  inputTokens: number,
  outputTokens: number
): Promise<UserUsageRecord | null> {
  const period = currentPeriodStart();
  const input = Math.max(0, Math.round(inputTokens));
  const output = Math.max(0, Math.round(outputTokens));

  if (resolveDatabaseUrls().length) {
    try {
      const client = await connectPostgres();
      try {
        const { rows } = await client.query<IncrementRow>(
          `SELECT * FROM public.increment_user_token_usage($1::uuid, $2::bigint, $3::bigint, $4::date)`,
          [userId, input, output, period]
        );
        if (rows[0]) return recordFromIncrementRow(rows[0]);
      } finally {
        await client.end().catch(() => undefined);
      }
    } catch (err) {
      phase1Logger.warn('Token usage postgres increment failed — trying supabase rpc', {
        error: (err as Error).message,
      });
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    await ensureUserRecords(userId);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('increment_user_token_usage', {
      p_user_id: userId,
      p_input: input,
      p_output: output,
      p_period: period,
    });
    if (error) {
      phase1Logger.warn('increment_user_token_usage rpc failed', { userId, error: error.message });
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return recordFromIncrementRow(row as IncrementRow);
  } catch (err) {
    phase1Logger.warn('increment_user_token_usage rpc exception', { error: (err as Error).message });
    return null;
  }
}

async function getRecord(userId: string, opts?: { forceDb?: boolean }): Promise<UserUsageRecord> {
  if (!opts?.forceDb) {
    let cached = memoryStore.get(userId);
    if (cached) {
      cached = maybeResetPeriod(cached);
      memoryStore.set(userId, cached);
      return cached;
    }
  }

  const fromDb = await loadFromDb(userId);
  let record = fromDb ?? emptyRecord();
  record = maybeResetPeriod(record);
  memoryStore.set(userId, record);
  return record;
}

async function getPlanTier(userId: string): Promise<string> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 'unpaid';
  try {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('user_actions').select('plan_tier').eq('user_id', userId).maybeSingle();
    return data?.plan_tier ?? 'unpaid';
  } catch {
    return 'unpaid';
  }
}

async function getTotalLimit(userId: string, record: UserUsageRecord): Promise<number> {
  const tier = await getPlanTier(userId);
  return quotaForPlanTier(tier) + record.emergencyBonus + record.bonusTokens;
}

function computeSnapshot(record: UserUsageRecord, totalLimit: number): TokenUsageSnapshot {
  const inputLimit = inputLimitForPlan(totalLimit);
  const outputLimit = outputLimitForPlan(totalLimit);

  const totalUsed = record.inputTokens + record.outputTokens;
  const totalRemaining = Math.max(0, totalLimit - totalUsed);
  const inputRemaining = Math.max(0, inputLimit - record.inputTokens);
  const outputRemaining = Math.max(0, outputLimit - record.outputTokens);

  const emergencyAvailable =
    !record.emergencyClaimedAt &&
    totalRemaining < QUOTA.emergencyThreshold &&
    totalRemaining > 0;

  return {
    inputTokensUsed: record.inputTokens,
    outputTokensUsed: record.outputTokens,
    totalTokensUsed: totalUsed,
    inputTokensRemaining: inputRemaining,
    outputTokensRemaining: outputRemaining,
    totalTokensRemaining: totalRemaining,
    percentUsed: totalLimit > 0 ? Math.min(100, Math.round((totalUsed / totalLimit) * 100)) : 0,
    quotaPeriodStart: record.periodStart,
    emergencyTokensAvailable: emergencyAvailable,
    emergencyTokensClaimedThisMonth: Boolean(record.emergencyClaimedAt),
  };
}

/** Dashboard / API — always refresh from DB so leave/return shows real usage. */
export async function getUsage(userId: string): Promise<TokenUsageSnapshot> {
  const record = await getRecord(userId, { forceDb: true });
  const totalLimit = await getTotalLimit(userId, record);
  return computeSnapshot(record, totalLimit);
}

export async function checkQuota(
  userId: string,
  estimatedInput: number,
  estimatedOutput: number
): Promise<{ allowed: boolean; snapshot: TokenUsageSnapshot }> {
  const record = await getRecord(userId, { forceDb: true });
  const totalLimit = await getTotalLimit(userId, record);
  const snapshot = computeSnapshot(record, totalLimit);
  const inputLimit = inputLimitForPlan(totalLimit);
  const outputLimit = outputLimitForPlan(totalLimit);

  const wouldExceedTotal =
    record.inputTokens + record.outputTokens + estimatedInput + estimatedOutput > totalLimit;
  const wouldExceedInput = record.inputTokens + estimatedInput > inputLimit;
  const wouldExceedOutput = record.outputTokens + estimatedOutput > outputLimit;

  const allowed = !wouldExceedTotal && !wouldExceedInput && !wouldExceedOutput;
  return { allowed, snapshot };
}

export async function recordUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number
): Promise<TokenUsageSnapshot> {
  // Prefer atomic SQL increment so Fly replicas cannot wipe each other's totals.
  const atomic = await incrementUsageAtomic(userId, inputTokens, outputTokens);
  if (atomic) {
    memoryStore.set(userId, atomic);
    phase1Logger.info('Token usage recorded', {
      userId,
      inputTokens,
      outputTokens,
      total: atomic.inputTokens + atomic.outputTokens,
      persisted: true,
      mode: 'atomic',
    });
    return computeSnapshot(atomic, await getTotalLimit(userId, atomic));
  }

  // Fallback: force DB read + absolute upsert (racy, but last resort)
  const record = await getRecord(userId, { forceDb: true });
  record.inputTokens += Math.max(0, Math.round(inputTokens));
  record.outputTokens += Math.max(0, Math.round(outputTokens));
  memoryStore.set(userId, record);
  const saved = await saveToDb(userId, record);
  if (!saved) {
    phase1Logger.warn('Usage billed in-memory only — dashboard may reset until DB save works', {
      userId,
      total: record.inputTokens + record.outputTokens,
    });
  }

  phase1Logger.info('Token usage recorded', {
    userId,
    inputTokens,
    outputTokens,
    total: record.inputTokens + record.outputTokens,
    persisted: saved,
    mode: 'fallback_upsert',
  });

  return computeSnapshot(record, await getTotalLimit(userId, record));
}

export async function claimEmergencyTokens(userId: string): Promise<{
  success: boolean;
  message: string;
  usage: TokenUsageSnapshot;
}> {
  const record = await getRecord(userId, { forceDb: true });
  const totalLimit = await getTotalLimit(userId, record);
  const snapshot = computeSnapshot(record, totalLimit);

  if (record.emergencyClaimedAt) {
    return {
      success: false,
      message: 'Emergency tokens already claimed this month.',
      usage: snapshot,
    };
  }

  if (snapshot.totalTokensRemaining >= QUOTA.emergencyThreshold) {
    return {
      success: false,
      message: `Emergency tokens only available when less than ${QUOTA.emergencyThreshold.toLocaleString()} tokens remain.`,
      usage: snapshot,
    };
  }

  record.emergencyBonus = QUOTA.emergencyTokens;
  record.emergencyClaimedAt = new Date().toISOString();
  memoryStore.set(userId, record);
  await saveToDb(userId, record);

  const updated = computeSnapshot(record, await getTotalLimit(userId, record));
  phase1Logger.info('Emergency tokens claimed', { userId, bonus: QUOTA.emergencyTokens });

  return {
    success: true,
    message: `Emergency tokens activated: ${QUOTA.emergencyTokens.toLocaleString()} bonus tokens added.`,
    usage: updated,
  };
}

/** Credit AI usage tokens (referrals, community pool, distribution). */
export async function creditBonusTokens(
  userId: string,
  amount: number
): Promise<TokenUsageSnapshot> {
  const record = await getRecord(userId, { forceDb: true });
  record.bonusTokens += amount;
  memoryStore.set(userId, record);
  await saveToDb(userId, record);
  phase1Logger.info('Bonus tokens credited', { userId, amount, totalBonus: record.bonusTokens });
  return computeSnapshot(record, await getTotalLimit(userId, record));
}

/** Total monthly token quota including bonuses (matches checkQuota enforcement). */
export async function getUserQuotaLimit(userId: string): Promise<number> {
  const record = await getRecord(userId, { forceDb: true });
  return getTotalLimit(userId, record);
}

/** Invalidate process cache after external writes (tests / admin). */
export function clearUsageMemoryCache(userId?: string): void {
  if (userId) memoryStore.delete(userId);
  else memoryStore.clear();
}
