/**
 * Why a provider reservation was refused, and when trying again might work.
 *
 * Production account `423e4261…` hit this mid-build: a booking-site build reached the
 * builder stage and its reservation was refused with the single sentence "Currently
 * unlocked AI capacity is unavailable." That sentence was accurate but told the account
 * owner nothing they could act on — not how much was actually available, not when it
 * would change, nothing.
 *
 * The account's own Plan & Usage panel already answers this, in two numbers that look
 * contradictory side by side: "Capacity remaining 83.8%" (of the whole 30-day
 * entitlement) against "Available now 0%" (of today's unlocked slice, under
 * `balanced_month` pacing, which releases the entitlement gradually rather than all at
 * once). The account owner explicitly asked to keep the next-unlock *timing* in the
 * message and drop any dollar amount — the product frames this as capacity, not a
 * balance, and a raw price figure does not belong in a build error.
 *
 * This also distinguishes true capacity exhaustion from an unrelated reservation
 * failure. The RPC-backed path previously mapped every error it could hit — a real
 * pacing cap and a genuine database failure alike — onto the same capacity sentence.
 * That is wrong when the failure has nothing to do with the account's spend: telling
 * someone to wait for an unlock that will not fix anything is worse than a vague error.
 */

export type CapacityFailureCode = 'PAID_PROVIDER_CAPACITY_UNAVAILABLE';

export interface CapacityUnavailableError extends Error {
  code: CapacityFailureCode;
  /** ISO timestamp of the next scheduled unlock, or null when none applies. */
  nextUnlockAt: string | null;
}

/**
 * Builds the error to throw for a refused reservation.
 *
 * `genuinelyAtCapacity` is the caller's own determination — from the exact check that
 * refused the reservation, not re-derived here — because only the caller knows whether
 * *this* failure was the pacing cap or something else. When it was not the cap,
 * `nextUnlockAt` is deliberately omitted: a time that would not have changed the
 * outcome is not useful information, it is noise dressed as a lead.
 */
export function capacityUnavailableError(
  genuinelyAtCapacity: boolean,
  nextUnlockAt: string | null,
): CapacityUnavailableError {
  const error = new Error(
    genuinelyAtCapacity
      ? "Today's unlocked AI capacity is fully in use."
      : 'AI capacity could not be reserved right now. Please try again in a moment.',
  ) as CapacityUnavailableError;
  error.code = 'PAID_PROVIDER_CAPACITY_UNAVAILABLE';
  error.nextUnlockAt = genuinelyAtCapacity ? nextUnlockAt : null;
  return error;
}
