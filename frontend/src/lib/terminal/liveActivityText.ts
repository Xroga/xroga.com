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
 * The sentence shown before the first backend row arrives.
 *
 * Every other row in the terminal comes from the backend. This one does not, and that
 * is the point: between pressing send and the first event there is nothing from the
 * server to display, which is exactly the window a user screenshotted as a blank
 * terminal and read as "it isn't working".
 *
 * It is scoped to what the client can actually observe — the request left the browser
 * and nothing has come back — so it stays true even if the run turns out to have
 * failed before it started. Naming a build step here would be a guess, and a guess is
 * how the previous UI lost people's trust.
 */
export function waitingLine(elapsedSeconds: number): string {
  return `Request sent — waiting for the build service to respond (${formatElapsed(elapsedSeconds)}).`;
}
