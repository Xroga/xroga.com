/** Human-readable duration used by the live request surface. */
export function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe < 60) return `${safe}s`;

  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;

  return rest === 0
    ? `${minutes}m`
    : `${minutes}m ${rest}s`;
}

/**
 * The backend normally emits a real progress event almost immediately. Keep the
 * client-only state out of view for a moment so fast requests do not flicker.
 */
export const WAITING_LINE_AFTER_MS = 400;

/**
 * Client-only wording used before the first verified backend progress event arrives.
 *
 * It deliberately avoids "build service", model names, percentages, or invented
 * execution steps because the same workspace surface handles chat, Xroga Connect,
 * research and builds. The only fact the browser knows here is that the request is
 * active and Xroga has not returned its first progress event yet.
 */
export function waitingLine(): string {
  return 'Responding';
}

export function shouldShowWaitingLine(elapsedMs: number): boolean {
  return elapsedMs >= WAITING_LINE_AFTER_MS;
}
