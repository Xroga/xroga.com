/**
 * Promotional product access through a configurable end date.
 * Unlocks Xroga product features only — never disables provider billing,
 * rate limits, authentication, abuse prevention, or cost safeguards.
 */
export function promoFullAccessEndIso(): string {
  return (
    process.env.PROMO_FULL_ACCESS_END?.trim() ||
    process.env.NEXT_PUBLIC_PROMO_FULL_ACCESS_END?.trim() ||
    '2026-08-30T23:59:59Z'
  );
}

export function isPromoFullAccessActive(now = new Date()): boolean {
  const end = Date.parse(promoFullAccessEndIso());
  if (!Number.isFinite(end)) return false;
  return now.getTime() <= end;
}
