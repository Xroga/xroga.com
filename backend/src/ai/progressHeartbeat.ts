/**
 * Truthful heartbeats across the long silences in a build.
 *
 * Timings taken from production run `46d07c5d`:
 *
 *   research/searching  15:20:43 → research/skipped   15:21:14   (31s silent)
 *   builder/building    15:21:38 → model_fallback     15:22:39   (61s silent)
 *                                → model_fallback     15:23:40   (61s silent)
 *
 * A minute of nothing is indistinguishable from a hung product. The work was real —
 * a provider was being waited on — but the pipeline had no way to say so mid-await,
 * because progress is only emitted between steps.
 *
 * This wraps an in-flight promise and emits a line at a fixed interval for as long as
 * it is unsettled. Three properties are deliberate:
 *
 * 1. **It observes; it never intervenes.** The wrapped promise is returned untouched,
 *    so the first-token and generation deadlines in `builderAttempt` are unaffected. A
 *    heartbeat cannot extend, reset, or mask a timeout — if the operation is going to
 *    fail at 60s it still fails at 60s, and the last heartbeat before that is not a
 *    claim that it will succeed.
 * 2. **It reports waiting, not progress.** The line says what is being waited on and
 *    how long it has been. It never invents a percentage, a step count, or an ETA,
 *    and it never implies output has arrived.
 * 3. **It stops the moment the promise settles**, including on rejection, so a failed
 *    step cannot keep announcing itself.
 */

export interface HeartbeatOptions {
  /** Milliseconds between beats. The first beat lands one interval in, not at zero. */
  everyMs: number;
  /** Emits the line. Any throw is swallowed — a heartbeat must not fail the build. */
  emit: (elapsedMs: number) => void;
  /** Injected for tests. */
  setTimer?: typeof setInterval;
  clearTimer?: typeof clearInterval;
  now?: () => number;
}

/** Whole seconds, for a line a person reads. Sub-second precision is noise here. */
export function elapsedLabel(elapsedMs: number): string {
  const seconds = Math.max(0, Math.round(elapsedMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/**
 * A waiting line for a named operation.
 *
 * Phrased so it stays true whatever happens next: "no output received yet" is a fact
 * about the present, and remains accurate if the operation subsequently fails.
 */
export function heartbeatMessage(operation: string, elapsedMs: number): string {
  return `Still waiting on ${operation} — no output received yet (${elapsedLabel(elapsedMs)}).`;
}

/**
 * Runs `work`, emitting a heartbeat every `everyMs` until it settles.
 *
 * The result and any rejection pass through unchanged, so callers can wrap an existing
 * await without altering its behaviour or its error handling.
 */
export async function withProgressHeartbeat<T>(
  options: HeartbeatOptions,
  work: () => Promise<T>,
): Promise<T> {
  const setTimer = options.setTimer ?? setInterval;
  const clearTimer = options.clearTimer ?? clearInterval;
  const now = options.now ?? Date.now;
  const startedAt = now();

  const timer = setTimer(() => {
    try {
      options.emit(now() - startedAt);
    } catch {
      // A heartbeat is an observation. It must never be the reason a build fails.
    }
  }, Math.max(1, options.everyMs));
  (timer as { unref?: () => void }).unref?.();

  try {
    return await work();
  } finally {
    clearTimer(timer);
  }
}
