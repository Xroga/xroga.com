/**
 * Text for the live run transcript.
 *
 * Kept out of the component so it can be tested directly, and so the wording of the
 * one line the UI is allowed to originate itself sits next to the reasoning for it.
 */

export function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe < 60) return `${safe}s`;
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/**
 * Seconds of silence before the connecting line is worth showing.
 *
 * The backend's first event now leaves within milliseconds of the request arriving, so
 * this line is a fallback for a slow network rather than the normal experience. A user
 * asked not to be shown a waiting message at all — they want the work, not a notice
 * that work is pending — and below this threshold the gap is imperceptible anyway.
 * Showing nothing for two seconds is better than showing a sentence about nothing.
 */
export const WAITING_LINE_AFTER_SECONDS = 2;

/**
 * The line shown only when the connection itself is slow.
 *
 * Every other row in the terminal comes from the backend. This one does not, and it is
 * scoped to what the client can actually observe — the request left the browser and
 * nothing has come back. Naming a build step here would be a guess, and a guess is how
 * the previous UI lost people's trust.
 */
export function waitingLine(elapsedSeconds: number): string {
  return `Connecting to the build service (${formatElapsed(elapsedSeconds)})…`;
}

/** True when the connecting line has earned its place on screen. */
export function shouldShowWaitingLine(elapsedSeconds: number): boolean {
  return elapsedSeconds >= WAITING_LINE_AFTER_SECONDS;
}
