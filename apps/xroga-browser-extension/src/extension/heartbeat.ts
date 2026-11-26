// Keeps the service worker from being suspended in the middle of a task: while any run is in progress, a cheap extension call is made every 20 seconds, which counts as activity for Chrome.
// A long model request or a slow page can otherwise go quiet for longer than the worker is allowed to. The idea is agent-webbridge's keepalive (jeet-dhandha/agent-webbridge, MIT,
// agent-webbridge-extension/src/keepalive.mjs: an in-flight counter and a 20-second poke); here it follows the number of runs the manager already tracks. The watchdog alarm
// still wakes the worker after a suspension and finds the interrupted run: this makes the suspension rarer, it does not replace the recovery.
export const BEAT_MS = 20_000;

/** Starts the beat; returns what stops it. `busy` says whether a run is in progress, `poke` is the cheap call. */
export function startHeartbeat(busy: () => boolean, poke: () => void, every = BEAT_MS, timers: { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void } = { set: (fn, ms) => setInterval(fn, ms), clear: id => clearInterval(id as ReturnType<typeof setInterval>) }): () => void {
  const id = timers.set(() => {
    if (!busy()) return;
    try {
      poke();
    } catch {
      /* the beat is a convenience: a failed poke is not a failed run */
    }
  }, every);
  return () => timers.clear(id);
}
