/**
 * The terminal-facing line for a capacity-exhausted reservation.
 *
 * The backend already computes when the account's next AI-capacity unlock happens and
 * sends it as `nextUnlockAt` on the CAPACITY_UNAVAILABLE error. This turns that into
 * the one fact a user needs — when to try again — formatted the same way the Plan &
 * Usage panel already shows "Next unlock" (`Intl.DateTimeFormat` with the browser's own
 * locale and timezone, so the two never disagree). It never states a dollar amount:
 * the product frames this as capacity, not a balance, and the account owner asked
 * specifically for the timing without the price attached.
 */
export function capacityUnavailableLine(baseMessage: string, nextUnlockAt: unknown): string {
  const formatted = formatUnlockTime(nextUnlockAt);
  return formatted ? `${baseMessage} More capacity unlocks ${formatted}.` : baseMessage;
}

/**
 * `nextUnlockAt`, formatted the one way this product ever shows a time — shared so the
 * Plan & Usage panel, the terminal transcript, and the inline "Use full power now" card
 * can never drift into disagreeing about what time it is.
 *
 * Returns `null` for anything that isn't a parseable timestamp, so a caller can decide
 * whether to omit the whole sentence rather than print "Invalid Date".
 */
export function formatUnlockTime(nextUnlockAt: unknown): string | null {
  const iso = typeof nextUnlockAt === 'string' ? nextUnlockAt : null;
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
