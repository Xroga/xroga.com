/**
 * Promotional product access window — unlocks Xroga product features only.
 * Does NOT disable provider billing, rate limits, auth, or cost safeguards.
 */
export const PROMO_FULL_ACCESS_END =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_PROMO_FULL_ACCESS_END) ||
  '2026-08-30T23:59:59Z';

export function isPromoFullAccessActive(now = new Date()): boolean {
  const end = Date.parse(PROMO_FULL_ACCESS_END);
  if (!Number.isFinite(end)) return false;
  return now.getTime() <= end;
}
