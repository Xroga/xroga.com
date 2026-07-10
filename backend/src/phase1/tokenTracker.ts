import { QUOTA } from './models.js';
import { phase1Logger } from './logger.js';
import type { TokenUsageSnapshot } from './types.js';
import { getSupabaseAdmin } from '../config/supabase.js';

interface UserUsageRecord {
  inputTokens: number;
  outputTokens: number;
  emergencyBonus: number;
  emergencyClaimedAt: string | null;
  periodStart: string;
}

const memoryStore = new Map<string, UserUsageRecord>();

function currentPeriodStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

function emptyRecord(): UserUsageRecord {
  return {
    inputTokens: 0,
    outputTokens: 0,
    emergencyBonus: 0,
    emergencyClaimedAt: null,
    periodStart: currentPeriodStart(),
  };
}

function maybeResetPeriod(record: UserUsageRecord): UserUsageRecord {
  const period = currentPeriodStart();
  if (record.periodStart !== period) {
    return { ...emptyRecord(), periodStart: period };
  }
  return record;
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

    if (error || !data) return null;

    const period = currentPeriodStart();
    if (data.quota_period_start !== period) {
      return emptyRecord();
    }

    return {
      inputTokens: Number(data.input_tokens ?? 0),
      outputTokens: Number(data.output_tokens ?? 0),
      emergencyBonus: Number(data.emergency_bonus ?? 0),
      emergencyClaimedAt: data.emergency_claimed_at ?? null,
      periodStart: period,
    };
  } catch (err) {
    phase1Logger.debug('Token usage DB load skipped', { error: (err as Error).message });
    return null;
  }
}

async function saveToDb(userId: string, record: UserUsageRecord): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from('user_token_usage').upsert(
      {
        user_id: userId,
        input_tokens: record.inputTokens,
        output_tokens: record.outputTokens,
        emergency_bonus: record.emergencyBonus,
        emergency_claimed_at: record.emergencyClaimedAt,
        quota_period_start: record.periodStart,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
  } catch (err) {
    phase1Logger.warn('Token usage DB save failed', { error: (err as Error).message });
  }
}

async function getRecord(userId: string): Promise<UserUsageRecord> {
  let record = memoryStore.get(userId);
  if (!record) {
    record = (await loadFromDb(userId)) ?? emptyRecord();
    memoryStore.set(userId, record);
  }
  record = maybeResetPeriod(record);
  memoryStore.set(userId, record);
  return record;
}

function computeSnapshot(record: UserUsageRecord): TokenUsageSnapshot {
  const totalLimit = QUOTA.totalTokens + record.emergencyBonus;
  const inputLimit = QUOTA.inputTokens;
  const outputLimit = QUOTA.outputTokens + record.emergencyBonus;

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
    percentUsed: Math.min(100, Math.round((totalUsed / totalLimit) * 100)),
    quotaPeriodStart: record.periodStart,
    emergencyTokensAvailable: emergencyAvailable,
    emergencyTokensClaimedThisMonth: Boolean(record.emergencyClaimedAt),
  };
}

export async function getUsage(userId: string): Promise<TokenUsageSnapshot> {
  const record = await getRecord(userId);
  return computeSnapshot(record);
}

export async function checkQuota(
  userId: string,
  estimatedInput: number,
  estimatedOutput: number
): Promise<{ allowed: boolean; snapshot: TokenUsageSnapshot }> {
  const record = await getRecord(userId);
  const snapshot = computeSnapshot(record);
  const totalLimit = QUOTA.totalTokens + record.emergencyBonus;

  const wouldExceedTotal =
    record.inputTokens + record.outputTokens + estimatedInput + estimatedOutput > totalLimit;
  const wouldExceedInput = record.inputTokens + estimatedInput > QUOTA.inputTokens;
  const wouldExceedOutput =
    record.outputTokens + estimatedOutput > QUOTA.outputTokens + record.emergencyBonus;

  const allowed = !wouldExceedTotal && !wouldExceedInput && !wouldExceedOutput;
  return { allowed, snapshot };
}

export async function recordUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number
): Promise<TokenUsageSnapshot> {
  const record = await getRecord(userId);
  record.inputTokens += inputTokens;
  record.outputTokens += outputTokens;
  memoryStore.set(userId, record);
  await saveToDb(userId, record);

  phase1Logger.debug('Token usage recorded', {
    userId,
    inputTokens,
    outputTokens,
    total: record.inputTokens + record.outputTokens,
  });

  return computeSnapshot(record);
}

export async function claimEmergencyTokens(userId: string): Promise<{
  success: boolean;
  message: string;
  usage: TokenUsageSnapshot;
}> {
  const record = await getRecord(userId);
  const snapshot = computeSnapshot(record);

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

  const updated = computeSnapshot(record);
  phase1Logger.info('Emergency tokens claimed', { userId, bonus: QUOTA.emergencyTokens });

  return {
    success: true,
    message: `Emergency tokens activated: ${QUOTA.emergencyTokens.toLocaleString()} bonus tokens added.`,
    usage: updated,
  };
}
