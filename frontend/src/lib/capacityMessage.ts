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
  const iso = typeof nextUnlockAt === 'string' ? nextUnlockAt : null;
  if (!iso) return baseMessage;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return baseMessage;
  const formatted = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    date,
  );
  return `${baseMessage} More capacity unlocks ${formatted}.`;
}
