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
import { ensurePhase1Schema } from '../db/ensurePhase1Schema.js';
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

/** Inline SQL increment — works even when migration RPC was never applied. */
const INLINE_INCREMENT_SQL = `
INSERT INTO public.user_token_usage AS t (
  user_id, input_tokens, output_tokens, quota_period_start, updated_at
)
VALUES ($1::uuid, $2::bigint, $3::bigint, $4::date, NOW())
ON CONFLICT (user_id) DO UPDATE
SET
  input_tokens = CASE
    WHEN t.quota_period_start IS DISTINCT FROM EXCLUDED.quota_period_start
      THEN EXCLUDED.input_tokens
    ELSE t.input_tokens + EXCLUDED.input_tokens
  END,
  output_tokens = CASE
    WHEN t.quota_period_start IS DISTINCT FROM EXCLUDED.quota_period_start
      THEN EXCLUDED.output_tokens
    ELSE t.output_tokens + EXCLUDED.output_tokens
  END,
  model_usage = CASE
    WHEN t.quota_period_start IS DISTINCT FROM EXCLUDED.quota_period_start
      THEN '{}'::jsonb
    ELSE t.model_usage
  END,
  emergency_bonus = CASE
    WHEN t.quota_period_start IS DISTINCT FROM EXCLUDED.quota_period_start THEN 0
    ELSE t.emergency_bonus
  END,
  emergency_claimed_at = CASE
    WHEN t.quota_period_start IS DISTINCT FROM EXCLUDED.quota_period_start THEN NULL
    ELSE t.emergency_claimed_at
  END,
  bonus_tokens = CASE
    WHEN t.quota_period_start IS DISTINCT FROM EXCLUDED.quota_period_start THEN 0
    ELSE t.bonus_tokens
  END,
  quota_period_start = EXCLUDED.quota_period_start,
  updated_at = NOW()
RETURNING input_tokens, output_tokens, emergency_bonus, bonus_tokens, emergency_claimed_at, quota_period_start
`;

/**
 * REST optimistic lock — works with only SUPABASE_SERVICE_ROLE_KEY
 * (no DATABASE_URL / RPC required). Retries on concurrent writers.
 */
async function incrementViaOptimisticRest(
  userId: string,
  input: number,
  output: number,
  period: string
): Promise<UserUsageRecord | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const supabase = getSupabaseAdmin();
  await ensureUserRecords(userId);

  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: row, error: readErr } = await supabase
      .from('user_token_usage')
      .select(
        'input_tokens, output_tokens, emergency_bonus, bonus_tokens, emergency_claimed_at, quota_period_start'
      )
      .eq('user_id', userId)
      .maybeSingle();

    if (readErr) {
      phase1Logger.warn('Token usage optimistic read failed', { userId, error: readErr.message });
      return null;
    }

    if (!row) {
      const { error: seedErr } = await supabase.from('user_token_usage').upsert(
        {
          user_id: userId,
          input_tokens: 0,
          output_tokens: 0,
          emergency_bonus: 0,
          bonus_tokens: 0,
          quota_period_start: period,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id', ignoreDuplicates: true }
      );
      if (seedErr) {
        phase1Logger.warn('Token usage seed failed', { userId, error: seedErr.message });
        return null;
      }
      continue;
    }

    const prevIn = Number(row.input_tokens ?? 0);
    const prevOut = Number(row.output_tokens ?? 0);
    const rowPeriod = normalizePeriodDate(row.quota_period_start);
    const rolled = Boolean(rowPeriod && rowPeriod !== period);

    const nextIn = rolled ? input : prevIn + input;
    const nextOut = rolled ? output : prevOut + output;
    const patch: Record<string, unknown> = {
      input_tokens: nextIn,
      output_tokens: nextOut,
      quota_period_start: period,
      updated_at: new Date().toISOString(),
    };
    if (rolled) {
      patch.model_usage = {};
      patch.emergency_bonus = 0;
      patch.bonus_tokens = 0;
      patch.emergency_claimed_at = null;
    }

    // Conditional update: only apply if counters are still what we read.
    // Do NOT filter on quota_period_start — Supabase may return DATE as timestamptz strings.
    const { data: updated, error: upErr } = await supabase
      .from('user_token_usage')
      .update(patch)
      .eq('user_id', userId)
      .eq('input_tokens', prevIn)
      .eq('output_tokens', prevOut)
      .select(
        'input_tokens, output_tokens, emergency_bonus, bonus_tokens, emergency_claimed_at, quota_period_start'
      )
      .maybeSingle();

    if (upErr) {
      phase1Logger.warn('Token usage optimistic update failed', { userId, error: upErr.message });
      return null;
    }
    if (updated) return recordFromIncrementRow(updated as IncrementRow);
    // Concurrent writer won — retry
  }

  phase1Logger.warn('Token usage optimistic increment exhausted retries', { userId });
  return null;
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

  // Ensure atomic RPCs / columns exist before first bill (boot may still be racing).
  if (resolveDatabaseUrls().length) {
    await ensurePhase1Schema().catch(() => false);
  }

  if (resolveDatabaseUrls().length) {
    try {
      const client = await connectPostgres();
      try {
        // Prefer RPC when 026 is applied
        try {
          const { rows } = await client.query<IncrementRow>(
            `SELECT * FROM public.increment_user_token_usage($1::uuid, $2::bigint, $3::bigint, $4::date)`,
            [userId, input, output, period]
          );
          if (rows[0]) return recordFromIncrementRow(rows[0]);
        } catch (rpcErr) {
          // Function missing — fall through to inline UPSERT so usage still persists
          phase1Logger.warn('increment_user_token_usage missing — using inline SQL', {
            error: (rpcErr as Error).message,
          });
        }
        const { rows } = await client.query<IncrementRow>(INLINE_INCREMENT_SQL, [
          userId,
          input,
          output,
          period,
        ]);
        if (rows[0]) return recordFromIncrementRow(rows[0]);
      } finally {
        await client.end().catch(() => undefined);
      }
    } catch (err) {
      phase1Logger.warn('Token usage postgres increment failed — trying supabase paths', {
        error: (err as Error).message,
      });
    }
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return null;

  // Supabase RPC (needs migration 026 applied + PostgREST reload)
  try {
    await ensureUserRecords(userId);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc('increment_user_token_usage', {
      p_user_id: userId,
      p_input: input,
      p_output: output,
      p_period: period,
    });
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row) return recordFromIncrementRow(row as IncrementRow);
    } else {
      phase1Logger.warn('increment_user_token_usage rpc failed — trying optimistic REST', {
        userId,
        error: error.message,
      });
    }
  } catch (err) {
    phase1Logger.warn('increment_user_token_usage rpc exception — trying optimistic REST', {
      error: (err as Error).message,
    });
  }

  // Last durable path: conditional REST update (service role only — no DB password needed)
  return incrementViaOptimisticRest(userId, input, output, period);
}

function preferHigherUsage(db: UserUsageRecord, memory: UserUsageRecord): UserUsageRecord {
  const period = currentPeriodStart();
  const mem = maybeResetPeriod(memory);
  const dbNorm = maybeResetPeriod(db);
  // After month roll, never resurrect last month's memory over a fresh DB row.
  if (normalizePeriodDate(mem.periodStart) !== period) return dbNorm;
  if (normalizePeriodDate(dbNorm.periodStart) !== period) return mem;

  const memTotal = mem.inputTokens + mem.outputTokens;
  const dbTotal = dbNorm.inputTokens + dbNorm.outputTokens;
  if (memTotal <= dbTotal) return dbNorm;

  // Same-process bills ahead of DB (failed/slow persist) — keep truth + heal DB.
  return {
    ...dbNorm,
    inputTokens: Math.max(dbNorm.inputTokens, mem.inputTokens),
    outputTokens: Math.max(dbNorm.outputTokens, mem.outputTokens),
    emergencyBonus: Math.max(dbNorm.emergencyBonus, mem.emergencyBonus),
    bonusTokens: Math.max(dbNorm.bonusTokens, mem.bonusTokens),
    emergencyClaimedAt: dbNorm.emergencyClaimedAt ?? mem.emergencyClaimedAt,
    periodStart: period,
  };
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
  const cached = memoryStore.get(userId);

  if (fromDb) {
    let record = maybeResetPeriod(fromDb);
    if (cached) {
      const merged = preferHigherUsage(record, cached);
      const healed = merged.inputTokens + merged.outputTokens > record.inputTokens + record.outputTokens;
      memoryStore.set(userId, merged);
      if (healed) {
        phase1Logger.warn('Token usage memory ahead of DB — healing persist', {
          userId,
          memory: merged.inputTokens + merged.outputTokens,
          db: record.inputTokens + record.outputTokens,
        });
        void saveToDb(userId, merged).catch(() => undefined);
      }
      return merged;
    }
    memoryStore.set(userId, record);
    return record;
  }

  // DB null/error: do NOT clobber recent in-process bills with fake zeros (refresh flicker).
  if (cached && cached.inputTokens + cached.outputTokens > 0) {
    phase1Logger.warn('Token usage DB empty — keeping memory until persist succeeds', {
      userId,
      total: cached.inputTokens + cached.outputTokens,
    });
    return maybeResetPeriod(cached);
  }

  const empty = emptyRecord();
  memoryStore.set(userId, empty);
  return empty;
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

  // Fallback: force DB read + absolute upsert (racy, but last resort) — retry once
  const record = await getRecord(userId, { forceDb: true });
  record.inputTokens += Math.max(0, Math.round(inputTokens));
  record.outputTokens += Math.max(0, Math.round(outputTokens));
  memoryStore.set(userId, record);
  let saved = await saveToDb(userId, record);
  if (!saved) {
    await new Promise((r) => setTimeout(r, 200));
    saved = await saveToDb(userId, record);
  }
  if (!saved) {
    phase1Logger.error('CRITICAL: usage not persisted — dashboard will reset after refresh', {
      userId,
      total: record.inputTokens + record.outputTokens,
      hint: 'Set DATABASE_URL / SUPABASE_DB_PASSWORD and apply migration 026',
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
