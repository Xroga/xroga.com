/** Human-readable duration retained for expanded technical evidence only. */
export function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe < 60) return `${safe}s`;

  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

/**
 * A short delay prevents a loading indicator from flashing for fast replies.
 * The pending state is intentionally a single neutral word. It never rotates
 * based on elapsed time and never invents execution work.
 */
export const PENDING_REVEAL_DELAY_MS = 420;

export function pendingActivityLabel(): string {
  return 'Responding';
}
