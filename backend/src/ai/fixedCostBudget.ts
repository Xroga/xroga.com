import { randomUUID } from 'node:crypto';

import { getSupabaseAdmin } from '../config/supabase.js';
import { capacityUnavailableError } from './capacityUnavailable.js';
import {
  FREE_PROVIDER_ENTITLEMENT_MICRO_USD,
  PROVIDER_PRICE_VERSION,
  getProviderEntitlementStatus,
  unlockedEntitlementMicroUsd,
  type BudgetPurpose,
  type ProviderReservation,
} from './providerBudget.js';

/**
 * Per-call (fixed cost) external spend, for example a paid Composio Instant tool, recorded in the SAME
 * provider reservation ledger as model calls. It reuses the existing service-only reserve, settle and
 * release routines (`reserve_xroga_provider_budget`, `settle_xroga_provider_budget`,
 * `release_xroga_provider_budget`) so the reservation counts against the owner's unlocked entitlement
 * under the same owner-keyed lock. The ledger route is a free-text label, not a model id, and token
 * counts are zero. No schema change and no change to providerBudget.ts.
 *
 * Every call carries the verified owner. A reservation is settled only to an amount not above what was
 * reserved: a provider that charges more is held for reconciliation by the caller, never absorbed.
 */

const ROUTE = /^[a-z0-9][a-z0-9:._-]{2,63}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

function hasDurableStore(): boolean {
  const configured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('Durable provider accounting is unavailable');
  return configured;
}

function microUsd(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid provider accounting amount');
  return value;
}

const exactCount = (value: unknown, expected: number): boolean =>
  (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) && Number.isSafeInteger(Number(value)) && Number(value) === expected;

interface MemoryRow { userId: string; idempotencyKey: string; route: string; amount: number; purpose: BudgetPurpose; status: 'reserved' | 'settled' | 'released' | 'pending_reconciliation' }
interface MemoryCycle { startsAt: Date; endsAt: Date; settled: number; reserved: number }
const memoryRows = new Map<string, MemoryRow>();
const memoryCycles = new Map<string, MemoryCycle>();

export function resetFixedCostMemoryForTests(): void {
  memoryRows.clear();
  memoryCycles.clear();
}

export async function reserveFixedCostBudget(input: {
  userId: string;
  route: string;
  reservationMicroUsd: number;
  idempotencyKey?: string;
  purpose?: BudgetPurpose;
}): Promise<ProviderReservation> {
  if (!ROUTE.test(input.route)) throw new Error('Invalid ledger route');
  const amount = microUsd(input.reservationMicroUsd);
  if (amount <= 0) throw new Error('Invalid provider accounting amount');
  const purpose = input.purpose ?? 'daily_work';
  const idempotencyKey = input.idempotencyKey ?? randomUUID();

  if (hasDurableStore()) {
    const rpc = () => getSupabaseAdmin().rpc('reserve_xroga_provider_budget', {
      p_user_id: input.userId, p_idempotency_key: idempotencyKey, p_purpose: purpose, p_internal_route: input.route,
      p_price_version: PROVIDER_PRICE_VERSION, p_estimated_input_tokens: 0, p_maximum_output_tokens: 0, p_reservation_micro_usd: amount,
    });
    let result = await rpc();
    if (result.error && /active_billing_cycle_required/i.test(result.error.message)) {
      await getSupabaseAdmin().rpc('ensure_xroga_free_cycle', { p_user_id: input.userId });
      result = await rpc();
    }
    if (result.error) {
      const status = await getProviderEntitlementStatus(input.userId).catch(() => null);
      throw capacityUnavailableError(status?.availableNowPercent != null && status.availableNowPercent <= 0, status?.nextUnlockAt ?? null);
    }
    const row = result.data as Record<string, unknown> | null;
    if (!row || Array.isArray(row) || typeof row.id !== 'string' || !UUID.test(row.id)
      || row.user_id !== input.userId || row.idempotency_key !== idempotencyKey || row.internal_route !== input.route
      || row.purpose !== purpose || row.status !== 'reserved' || !exactCount(row.reserved_micro_usd, amount)
      || row.price_version !== PROVIDER_PRICE_VERSION) throw new Error('Provider reservation evidence is invalid');
    return { id: row.id, reservedMicroUsd: amount, priceVersion: row.price_version };
  }

  const existing = [...memoryRows.entries()].find(([, row]) => row.userId === input.userId && row.idempotencyKey === idempotencyKey);
  if (existing) {
    if (existing[1].status !== 'reserved' || existing[1].amount !== amount || existing[1].route !== input.route) throw new Error('Provider reservation evidence is invalid');
    return { id: existing[0], reservedMicroUsd: amount, priceVersion: PROVIDER_PRICE_VERSION };
  }
  const cycle = memoryCycles.get(input.userId) ?? { startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86_400_000), settled: 0, reserved: 0 };
  memoryCycles.set(input.userId, cycle);
  const unlocked = unlockedEntitlementMicroUsd({
    startsAt: cycle.startsAt, now: new Date(), pacing: 'balanced_month', purpose, entitlementMicroUsd: FREE_PROVIDER_ENTITLEMENT_MICRO_USD,
  });
  if (cycle.settled + cycle.reserved + amount > unlocked) throw capacityUnavailableError(true, null);
  cycle.reserved += amount;
  const id = randomUUID();
  memoryRows.set(id, { userId: input.userId, idempotencyKey, route: input.route, amount, purpose, status: 'reserved' });
  return { id, reservedMicroUsd: amount, priceVersion: PROVIDER_PRICE_VERSION };
}

export async function settleFixedCostBudget(input: {
  userId: string;
  route: string;
  reservation: ProviderReservation;
  actualMicroUsd: number;
  providerRequestId?: string;
  calls?: number;
}): Promise<void> {
  const actual = microUsd(input.actualMicroUsd);
  const calls = input.calls ?? 1;
  if (!Number.isSafeInteger(calls) || calls < 0) throw new Error('Invalid provider usage count');
  if (!Number.isSafeInteger(input.reservation.reservedMicroUsd) || input.reservation.reservedMicroUsd < 0) throw new Error('Provider reservation evidence is invalid');
  if (actual > input.reservation.reservedMicroUsd) throw new Error('Provider cost exceeded the conservative reservation');
  if (hasDurableStore()) {
    const { data, error } = await getSupabaseAdmin().rpc('settle_xroga_provider_budget', {
      p_user_id: input.userId, p_reservation_id: input.reservation.id, p_actual_micro_usd: actual,
      p_provider_request_id: input.providerRequestId ?? '', p_actual_input_tokens: 0, p_cached_input_tokens: 0, p_output_tokens: 0,
      p_reasoning_tokens: 0, p_tool_calls: calls, p_search_calls: 0,
    });
    if (error) throw new Error('Provider reservation settlement failed');
    const row = data as Record<string, unknown> | null;
    if (!row || Array.isArray(row) || row.id !== input.reservation.id || row.user_id !== input.userId || row.status !== 'settled'
      || row.internal_route !== input.route || row.price_version !== input.reservation.priceVersion
      || !exactCount(row.reserved_micro_usd, input.reservation.reservedMicroUsd) || !exactCount(row.settled_micro_usd, actual)
      || row.provider_request_id !== (input.providerRequestId?.trim() || null) || !exactCount(row.tool_calls, calls)) {
      throw new Error('Provider settlement evidence is inconsistent or unavailable');
    }
    return;
  }
  const row = memoryRows.get(input.reservation.id);
  const cycle = memoryCycles.get(input.userId);
  if (!row || row.userId !== input.userId || !cycle || row.status !== 'reserved') return;
  cycle.reserved -= row.amount;
  cycle.settled += actual;
  row.status = 'settled';
}

/**
 * Ends a reservation without settling it. `pendingReconciliation: false` frees the hold (nothing could have
 * been billed). `true` keeps it counted against the owner until an operator reconciles it (the provider
 * may have billed).
 */
export async function releaseFixedCostBudget(input: {
  userId: string;
  reservation: ProviderReservation;
  pendingReconciliation: boolean;
  category: 'definitive_refusal' | 'unknown_outcome' | 'charge_anomaly';
}): Promise<void> {
  if (hasDurableStore()) {
    const { error } = await getSupabaseAdmin().rpc('release_xroga_provider_budget', {
      p_user_id: input.userId, p_reservation_id: input.reservation.id, p_error_category: input.category, p_pending_reconciliation: input.pendingReconciliation,
    });
    if (error) throw new Error('Provider reservation outcome could not be recorded');
    return;
  }
  const row = memoryRows.get(input.reservation.id);
  const cycle = memoryCycles.get(input.userId);
  if (!row || row.userId !== input.userId || !cycle || row.status !== 'reserved') return;
  if (input.pendingReconciliation) {
    row.status = 'pending_reconciliation';
    return;
  }
  cycle.reserved -= row.amount;
  row.status = 'released';
}
