import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.js';
import { MODELS, requirePricing, type ModelId } from './models.js';
import { normalizeProviderError } from './providerRuntime.js';
import { capacityUnavailableError } from './capacityUnavailable.js';

export const SHARED_PROVIDER_ENTITLEMENT_MICRO_USD = 20_000_000;
export const FREE_PROVIDER_ENTITLEMENT_MICRO_USD = 1_650_000;
export const PROVIDER_PRICE_VERSION = '2026-07-28-v1';
export type BudgetPurpose = 'daily_work' | 'complexity' | 'completion';

export interface ProviderUsageResult {
  providerRequestId?: string;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  reasoningTokens?: number;
  toolCalls?: number;
  searchCalls?: number;
}

export interface ProviderReservation {
  id: string;
  reservedMicroUsd: number;
  priceVersion: string;
}

export interface EntitlementStatus {
  state: 'free_active' | 'promotional_active' | 'promotional_expired' | 'paid_active' | 'past_due' | 'paused' | 'cancelled' | 'billing_unavailable';
  pacing: 'balanced_month' | 'full_access' | null;
  startsAt: string | null;
  endsAt: string | null;
  nextUnlockAt: string | null;
  capacityRemainingPercent: number | null;
  availableNowPercent: number | null;
  promotionActivationDeadline: string;
  requiresCard: boolean;
  autoChargesAtPromotionEnd: boolean;
}

type MemoryCycle = {
  kind: 'free' | 'promotion' | 'paid';
  startsAt: Date;
  endsAt: Date;
  pacing: 'balanced_month' | 'full_access';
  acceleratedUnlockMicroUsd: number;
  settled: number;
  reserved: number;
  entitlement: number;
};

const memoryCycles = new Map<string, MemoryCycle>();
const memoryReservations = new Map<string, { userId: string; idempotencyKey: string; amount: number; status: string }>();

function asSafeInteger(value: number): number {
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(value)));
}

export function estimateProviderReservationMicroUsd(input: {
  modelId: ModelId;
  estimatedInputTokens: number;
  maximumOutputTokens: number;
  billingTolerance?: number;
}): number {
  const price = requirePricing(input.modelId);
  const inputCost = (Math.max(0, input.estimatedInputTokens) * price.inputUsdPer1M);
  const outputCost = (Math.max(0, input.maximumOutputTokens) * price.outputUsdPer1M);
  const tolerance = Math.max(1, input.billingTolerance ?? 1.2);
  // Rates are USD per one million tokens; multiplying by one converts USD to micro-USD.
  return Math.max(1_000, asSafeInteger((inputCost + outputCost) * tolerance));
}

export function actualProviderCostMicroUsd(input: {
  modelId: ModelId;
  inputTokens: number;
  cachedInputTokens?: number;
  outputTokens: number;
  reasoningTokens?: number;
}): number {
  const price = requirePricing(input.modelId);
  const cachedInput = Math.min(Math.max(0, input.cachedInputTokens ?? 0), Math.max(0, input.inputTokens));
  const billableInput = Math.max(0, input.inputTokens - cachedInput);
  const billableOutput = Math.max(0, input.outputTokens + (input.reasoningTokens ?? 0));
  // None of the active model specifications carries a separately verified cached-input
  // price. Charge the normal input rate conservatively; silently treating cache hits as
  // free undercounts real provider spend and can breach the product ceiling.
  return asSafeInteger(
    billableInput * price.inputUsdPer1M + cachedInput * price.inputUsdPer1M +
      billableOutput * price.outputUsdPer1M,
  );
}

export function unlockedEntitlementMicroUsd(input: {
  startsAt: Date;
  now: Date;
  pacing: 'balanced_month' | 'full_access';
  purpose: BudgetPurpose;
  acceleratedUnlockMicroUsd?: number;
}): number {
  const elapsed = input.now.getTime() - input.startsAt.getTime();
  if (elapsed < 0) return 0;
  const day = Math.min(30, Math.max(1, Math.floor(elapsed / 86_400_000) + 1));
  const daily = input.pacing === 'full_access' ? 12_000_000 : Math.min(12_000_000, day * 400_000);
  const complexity = input.pacing === 'full_access'
    ? 5_500_000
    : day >= 22 ? 5_500_000 : day >= 15 ? 4_125_000 : day >= 8 ? 2_750_000 : 1_375_000;
  const completion = input.purpose === 'completion' ? 2_500_000 : 0;
  return Math.min(
    SHARED_PROVIDER_ENTITLEMENT_MICRO_USD,
    Math.max(daily + complexity, input.acceleratedUnlockMicroUsd ?? 0) + completion,
  );
}

function hasDurableStore(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function activatePaidCycle(input: {
  userId: string;
  providerReference: string;
  startsAt: Date;
  endsAt: Date;
}): Promise<EntitlementStatus> {
  if (!input.providerReference.trim()) throw new Error('Paid cycle evidence reference is required');
  const duration = input.endsAt.getTime() - input.startsAt.getTime();
  if (duration <= 0 || duration > 31 * 86_400_000) throw new Error('Invalid paid cycle period');
  if (hasDurableStore()) {
    const { error } = await getSupabaseAdmin().rpc('activate_xroga_paid_cycle', {
      p_user_id: input.userId,
      p_provider_reference: input.providerReference,
      p_starts_at: input.startsAt.toISOString(),
      p_ends_at: input.endsAt.toISOString(),
    });
    if (error) throw new Error('Paid entitlement could not be activated');
  } else {
    memoryCycles.set(input.userId, {
      kind: 'paid',
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      pacing: 'balanced_month',
      acceleratedUnlockMicroUsd: 0,
      settled: 0,
      reserved: 0,
      entitlement: SHARED_PROVIDER_ENTITLEMENT_MICRO_USD,
    });
  }
  return getProviderEntitlementStatus(input.userId);
}

function nextCycleUnlock(startsAt: Date, now: Date, endsAt: Date): string | null {
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - startsAt.getTime()) / 86_400_000));
  const next = new Date(startsAt.getTime() + (elapsedDays + 1) * 86_400_000);
  return next < endsAt ? next.toISOString() : null;
}

export async function getProviderEntitlementStatus(userId: string): Promise<EntitlementStatus> {
  const deadline = '2026-08-31T00:00:00.000Z';
  const now = new Date();
  if (hasDurableStore()) {
    const { error: ensureError } = await getSupabaseAdmin().rpc('ensure_xroga_free_cycle', { p_user_id: userId });
    if (ensureError) throw new Error('Billing entitlement is unavailable');
    const { data, error } = await getSupabaseAdmin()
      .from('xroga_billing_cycles')
      .select('cycle_kind,status,starts_at,ends_at,entitlement_micro_usd,pacing,settled_micro_usd,reserved_micro_usd,accounting_safety_hold_micro_usd,accelerated_unlock_micro_usd')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error('Billing entitlement is unavailable');
    if (!data) throw new Error('Billing entitlement is unavailable');
    const row = data as unknown as {
      cycle_kind: 'free' | 'promotion' | 'paid'; status: 'active' | 'expired' | 'past_due' | 'paused' | 'cancelled';
      starts_at: string; ends_at: string; entitlement_micro_usd: number; pacing: 'balanced_month' | 'full_access';
      settled_micro_usd: number; reserved_micro_usd: number; accounting_safety_hold_micro_usd: number;
      accelerated_unlock_micro_usd: number;
    };
    const entitlement = Number(row.entitlement_micro_usd);
    const committed = Number(row.settled_micro_usd) + Number(row.reserved_micro_usd) + Number(row.accounting_safety_hold_micro_usd);
    const expired = now >= new Date(row.ends_at) || row.status === 'expired';
    const unlocked = unlockedEntitlementMicroUsd({
      startsAt: new Date(row.starts_at), now, pacing: row.pacing, purpose: 'daily_work',
      acceleratedUnlockMicroUsd: Number(row.accelerated_unlock_micro_usd),
    });
    const state: EntitlementStatus['state'] = expired && row.cycle_kind === 'promotion'
      ? 'promotional_expired'
      : row.status === 'active'
        ? row.cycle_kind === 'free' ? 'free_active' : row.cycle_kind === 'promotion' ? 'promotional_active' : 'paid_active'
        : row.status === 'expired' ? 'cancelled' : row.status;
    return {
      state,
      pacing: row.pacing,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      nextUnlockAt: row.pacing === 'balanced_month' && !expired
        ? nextCycleUnlock(new Date(row.starts_at), now, new Date(row.ends_at))
        : null,
      capacityRemainingPercent: entitlement > 0 ? Math.max(0, Math.round(((entitlement - committed) / entitlement) * 1000) / 10) : null,
      availableNowPercent: entitlement > 0 ? Math.max(0, Math.round(((unlocked - committed) / entitlement) * 1000) / 10) : null,
      promotionActivationDeadline: deadline,
      requiresCard: row.cycle_kind === 'paid',
      autoChargesAtPromotionEnd: false,
    };
  }

  const cycle = memoryCycles.get(userId);
  if (!cycle) {
    const startsAt = new Date();
    memoryCycles.set(userId, { kind: 'free', startsAt, endsAt: new Date(startsAt.getTime() + 30 * 86_400_000), pacing: 'balanced_month', acceleratedUnlockMicroUsd: 0, settled: 0, reserved: 0, entitlement: FREE_PROVIDER_ENTITLEMENT_MICRO_USD });
    return getProviderEntitlementStatus(userId);
  }
  const committed = cycle.settled + cycle.reserved;
  const unlocked = unlockedEntitlementMicroUsd({
    startsAt: cycle.startsAt,
    now,
    pacing: cycle.pacing,
    purpose: 'daily_work',
    acceleratedUnlockMicroUsd: cycle.acceleratedUnlockMicroUsd,
  });
  return {
    state: now >= cycle.endsAt
      ? cycle.kind === 'promotion' ? 'promotional_expired' : 'cancelled'
      : cycle.kind === 'free' ? 'free_active' : cycle.kind === 'promotion' ? 'promotional_active' : 'paid_active',
    pacing: cycle.pacing,
    startsAt: cycle.startsAt.toISOString(), endsAt: cycle.endsAt.toISOString(),
    nextUnlockAt: nextCycleUnlock(cycle.startsAt, now, cycle.endsAt),
    capacityRemainingPercent: Math.max(0, Math.round(((cycle.entitlement - committed) / cycle.entitlement) * 1000) / 10),
    availableNowPercent: Math.max(0, Math.round(((Math.min(unlocked, cycle.entitlement) - committed) / cycle.entitlement) * 1000) / 10),
    promotionActivationDeadline: deadline,
    requiresCard: cycle.kind === 'paid',
    autoChargesAtPromotionEnd: false,
  };
}

export async function setUsagePacing(
  userId: string,
  pacing: 'balanced_month' | 'full_access',
  confirmed: boolean,
): Promise<EntitlementStatus> {
  if (pacing === 'full_access' && !confirmed) throw new Error('Full Access confirmation is required');
  const current = await getProviderEntitlementStatus(userId);
  if (current.state === 'free_active' && pacing === 'full_access') throw new Error('Xroga Pro is required for Full Access pacing');
  if (hasDurableStore()) {
    const { error } = await getSupabaseAdmin().rpc('set_xroga_usage_pacing', {
      p_user_id: userId, p_pacing: pacing, p_confirm_full_access: confirmed,
    });
    if (error) throw new Error('Usage pacing could not be updated');
  } else {
    const cycle = memoryCycles.get(userId);
    if (!cycle) throw new Error('Active billing cycle required');
    cycle.pacing = pacing;
    if (pacing === 'full_access') {
      cycle.acceleratedUnlockMicroUsd = 17_500_000;
    }
  }
  return getProviderEntitlementStatus(userId);
}

export async function reserveProviderBudget(input: {
  userId: string;
  modelId: ModelId;
  estimatedInputTokens: number;
  maximumOutputTokens: number;
  purpose?: BudgetPurpose;
  idempotencyKey?: string;
}): Promise<ProviderReservation> {
  const purpose = input.purpose ?? 'daily_work';
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const amount = estimateProviderReservationMicroUsd(input);

  if (hasDurableStore()) {
    const rpc = () => getSupabaseAdmin().rpc('reserve_xroga_provider_budget', {
      p_user_id: input.userId,
      p_idempotency_key: idempotencyKey,
      p_purpose: purpose,
      p_internal_route: input.modelId,
      p_price_version: PROVIDER_PRICE_VERSION,
      p_estimated_input_tokens: Math.max(0, Math.round(input.estimatedInputTokens)),
      p_maximum_output_tokens: Math.max(0, Math.round(input.maximumOutputTokens)),
      p_reservation_micro_usd: amount,
    });
    let result = await rpc();
    if (result.error && /active_billing_cycle_required/i.test(result.error.message)) {
      await getSupabaseAdmin().rpc('ensure_xroga_free_cycle', { p_user_id: input.userId });
      result = await rpc();
    }
    if (result.error) {
      // The RPC does its own bookkeeping in the database, so this failure can be the
      // pacing cap or an unrelated database error — re-check the account's own
      // entitlement to tell them apart rather than blaming the schedule for both.
      const status = await getProviderEntitlementStatus(input.userId).catch(() => null);
      const atCapacity = status?.availableNowPercent != null && status.availableNowPercent <= 0;
      throw capacityUnavailableError(atCapacity, status?.nextUnlockAt ?? null);
    }
    const row = result.data as unknown as { id: string; reserved_micro_usd: number; price_version: string };
    return { id: row.id, reservedMicroUsd: Number(row.reserved_micro_usd), priceVersion: row.price_version };
  }

  const existingReservation = [...memoryReservations.entries()].find(([, row]) =>
    row.userId === input.userId && row.idempotencyKey === idempotencyKey,
  );
  if (existingReservation) {
    return {
      id: existingReservation[0],
      reservedMicroUsd: existingReservation[1].amount,
      priceVersion: PROVIDER_PRICE_VERSION,
    };
  }

  const cycle = memoryCycles.get(input.userId) ?? {
    kind: 'free' as const,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 30 * 86_400_000),
    pacing: 'balanced_month' as const,
    acceleratedUnlockMicroUsd: 0,
    settled: 0,
    reserved: 0,
    entitlement: FREE_PROVIDER_ENTITLEMENT_MICRO_USD,
  };
  memoryCycles.set(input.userId, cycle);
  const unlocked = unlockedEntitlementMicroUsd({
    startsAt: cycle.startsAt,
    now: new Date(),
    pacing: cycle.pacing,
    purpose,
    acceleratedUnlockMicroUsd: cycle.acceleratedUnlockMicroUsd,
  });
  if (cycle.settled + cycle.reserved + amount > unlocked) {
    // This is the exact check that refused the reservation, so it is the source of
    // truth for whether the pacing cap caused it — no need to re-derive it.
    throw capacityUnavailableError(true, nextCycleUnlock(cycle.startsAt, new Date(), cycle.endsAt));
  }
  cycle.reserved += amount;
  const id = randomUUID();
  memoryReservations.set(id, { userId: input.userId, idempotencyKey, amount, status: 'reserved' });
  return { id, reservedMicroUsd: amount, priceVersion: PROVIDER_PRICE_VERSION };
}

export async function settleProviderBudget(input: {
  userId: string;
  modelId: ModelId;
  reservation: ProviderReservation;
  result: ProviderUsageResult;
}): Promise<void> {
  const actual = actualProviderCostMicroUsd({ modelId: input.modelId, ...input.result });
  if (actual > input.reservation.reservedMicroUsd) {
    throw new Error('Provider cost exceeded the conservative reservation');
  }
  if (hasDurableStore()) {
    const { error } = await getSupabaseAdmin().rpc('settle_xroga_provider_budget', {
      p_user_id: input.userId,
      p_reservation_id: input.reservation.id,
      p_actual_micro_usd: actual,
      p_provider_request_id: input.result.providerRequestId ?? '',
      p_actual_input_tokens: input.result.inputTokens,
      p_cached_input_tokens: input.result.cachedInputTokens ?? 0,
      p_output_tokens: input.result.outputTokens,
      p_reasoning_tokens: input.result.reasoningTokens ?? 0,
      p_tool_calls: input.result.toolCalls ?? 0,
      p_search_calls: input.result.searchCalls ?? 0,
    });
    if (error) throw new Error('Provider reservation settlement failed');
    return;
  }
  const row = memoryReservations.get(input.reservation.id);
  const cycle = memoryCycles.get(input.userId);
  if (!row || !cycle || row.status !== 'reserved') return;
  cycle.reserved -= row.amount;
  cycle.settled += actual;
  row.status = 'settled';
}

export async function finishFailedProviderReservation(input: {
  userId: string;
  reservation: ProviderReservation;
  error: unknown;
}): Promise<void> {
  const failure = normalizeProviderError(input.error);
  const pending = ['timeout', 'cancelled', 'transient', 'unknown'].includes(failure.kind);
  if (hasDurableStore()) {
    const { error } = await getSupabaseAdmin().rpc('release_xroga_provider_budget', {
      p_user_id: input.userId,
      p_reservation_id: input.reservation.id,
      p_error_category: failure.kind,
      p_pending_reconciliation: pending,
    });
    if (error) console.error('[provider-budget] failed to record reservation outcome', { category: 'accounting_write_failure' });
    return;
  }
  const row = memoryReservations.get(input.reservation.id);
  const cycle = memoryCycles.get(input.userId);
  if (!row || !cycle || row.status !== 'reserved') return;
  if (pending) {
    row.status = 'pending_reconciliation';
  } else {
    cycle.reserved -= row.amount;
    row.status = 'released';
  }
}

export async function withProviderReservation<T extends ProviderUsageResult>(input: {
  userId: string;
  modelId: ModelId;
  estimatedInputTokens: number;
  maximumOutputTokens: number;
  purpose?: BudgetPurpose;
  execute: () => Promise<T>;
}): Promise<T> {
  const reservation = await reserveProviderBudget(input);
  try {
    const result = await input.execute();
    await settleProviderBudget({ userId: input.userId, modelId: input.modelId, reservation, result });
    return result;
  } catch (error) {
    await finishFailedProviderReservation({ userId: input.userId, reservation, error });
    throw error;
  }
}

export function resetProviderBudgetMemoryForTests(): void {
  memoryCycles.clear();
  memoryReservations.clear();
}
