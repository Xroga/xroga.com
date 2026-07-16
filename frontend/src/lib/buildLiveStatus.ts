/** Honest build waiting copy — no rotating marketing lines that look like fake work. */

/**
 * Heartbeat / marketing lines that are NOT real progress (ignore for stall detection).
 * "Waiting on AI model" IS real work — do not treat it as fake keepalive or we abort mid-call.
 */
export function isKeepaliveActivity(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/waiting on ai model/i.test(t)) return false;
  return (
    /still writing code|generating page sections|applying styles & layout|coding step still running/i.test(
      t
    ) ||
    /absorbing multiverse|polishing your niche|still coding — your project/i.test(t) ||
    /budget guard|taking longer than usual/i.test(t) ||
    /^phase_\d+$/i.test(t)
  );
}

function formatElapsed(elapsedSeconds: number): string {
  const mins = Math.floor(elapsedSeconds / 60);
  const secs = elapsedSeconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

/**
 * Single honest status: last real swarm line, or "waiting on model".
 * No tick-based rotation — that looked like progress while nothing changed.
 */
export function buildLiveStatusMessage(
  elapsedSeconds: number,
  lastRealActivity?: string | null
): string {
  const time = formatElapsed(elapsedSeconds);
  const real = lastRealActivity?.trim();
  if (real && !isKeepaliveActivity(real)) {
    return `${real} (${time})`;
  }
  return `Waiting on AI model response… (${time})`;
}

/** @deprecated Use buildLiveStatusMessage — kept for older call sites */
export function buildHeartbeatActivity(elapsedSeconds: number): string {
  return buildLiveStatusMessage(elapsedSeconds);
}
