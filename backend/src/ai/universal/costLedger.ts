import { randomUUID } from 'node:crypto';

export const PRO_PLAN_PRICE_MICRO_USD = 25_000_000;
export const PRO_VARIABLE_COST_CEILING_MICRO_USD = 20_000_000;
export const MODEL_STACK_SOFT_TARGET_MICRO_USD = 16_500_000;
export const COMPLETION_RESERVE_MICRO_USD = 2_500_000;

export type ReservationPurpose = 'ordinary' | 'completion';

export interface MeteredEstimate {
  readonly meterId: string;
  readonly estimatedMicroUsd: number;
  readonly maximumMicroUsd: number;
}

export interface CostReservation {
  readonly id: string;
  readonly accountId: string;
  readonly idempotencyKey: string;
  readonly meterId: string;
  readonly reservedMicroUsd: number;
  readonly purpose: ReservationPurpose;
}

interface AccountState { settled: number; reserved: number }
interface ReservationState extends CostReservation { status: 'reserved' | 'settled' | 'released' }

function amount(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer micro-USD amount.`);
  return value;
}

/** Generic in-process ledger. Durable adapters can implement the same atomic operations. */
export class UniversalCostLedger {
  readonly #accounts = new Map<string, AccountState>();
  readonly #reservations = new Map<string, ReservationState>();
  readonly #idempotency = new Map<string, string>();

  reserve(input: {
    accountId: string;
    idempotencyKey: string;
    estimate: MeteredEstimate;
    purpose?: ReservationPurpose;
  }): CostReservation {
    const key = `${input.accountId}:${input.idempotencyKey}`;
    const existingId = this.#idempotency.get(key);
    if (existingId) return this.#reservations.get(existingId)!;
    const estimate = amount(input.estimate.estimatedMicroUsd, 'estimatedMicroUsd');
    const maximum = amount(input.estimate.maximumMicroUsd, 'maximumMicroUsd');
    if (estimate > maximum || maximum === 0) throw new Error('A reservation needs a positive conservative maximum.');
    const state = this.#accounts.get(input.accountId) ?? { settled: 0, reserved: 0 };
    const purpose = input.purpose ?? 'ordinary';
    const ordinaryCeiling = PRO_VARIABLE_COST_CEILING_MICRO_USD - COMPLETION_RESERVE_MICRO_USD;
    const ceiling = purpose === 'completion' ? PRO_VARIABLE_COST_CEILING_MICRO_USD : ordinaryCeiling;
    if (state.settled + state.reserved + maximum > ceiling) throw new Error('VARIABLE_COST_CEILING_REACHED');
    const reservation: ReservationState = {
      id: randomUUID(), accountId: input.accountId, idempotencyKey: input.idempotencyKey,
      meterId: input.estimate.meterId, reservedMicroUsd: maximum, purpose, status: 'reserved',
    };
    state.reserved += maximum;
    this.#accounts.set(input.accountId, state);
    this.#reservations.set(reservation.id, reservation);
    this.#idempotency.set(key, reservation.id);
    return reservation;
  }

  settle(reservationId: string, actualMicroUsd: number): void {
    const actual = amount(actualMicroUsd, 'actualMicroUsd');
    const row = this.#reservations.get(reservationId);
    if (!row || row.status !== 'reserved') throw new Error('RESERVATION_NOT_ACTIVE');
    if (actual > row.reservedMicroUsd) throw new Error('ACTUAL_COST_EXCEEDED_RESERVATION');
    const state = this.#accounts.get(row.accountId)!;
    state.reserved -= row.reservedMicroUsd;
    state.settled += actual;
    row.status = 'settled';
  }

  release(reservationId: string): void {
    const row = this.#reservations.get(reservationId);
    if (!row || row.status !== 'reserved') return;
    const state = this.#accounts.get(row.accountId)!;
    state.reserved -= row.reservedMicroUsd;
    row.status = 'released';
  }

  status(accountId: string): { settledMicroUsd: number; reservedMicroUsd: number; remainingMicroUsd: number } {
    const state = this.#accounts.get(accountId) ?? { settled: 0, reserved: 0 };
    return { settledMicroUsd: state.settled, reservedMicroUsd: state.reserved,
      remainingMicroUsd: Math.max(0, PRO_VARIABLE_COST_CEILING_MICRO_USD - state.settled - state.reserved) };
  }
}
