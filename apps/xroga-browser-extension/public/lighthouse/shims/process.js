// A browser stand-in for Node's `process`, enough for the Lighthouse bundle: a high-resolution clock, an empty environment and a microtask queue.
const start = performance.now();
const proc = {
  browser: true,
  env: {},
  platform: 'browser',
  version: 'v22.0.0',
  versions: { node: '22.0.0' },
  argv: [],
  pid: 1,
  cwd: () => '/',
  hrtime: Object.assign(
    previous => {
      const ms = performance.now() - start;
      let seconds = Math.floor(ms / 1000);
      let nanos = Math.floor((ms % 1000) * 1e6);
      if (previous) {
        seconds -= previous[0];
        nanos -= previous[1];
        if (nanos < 0) {
          seconds--;
          nanos += 1e9;
        }
      }
      return [seconds, nanos];
    },
    { bigint: () => BigInt(Math.floor((performance.now() - start) * 1e6)) },
  ),
  nextTick: (fn, ...args) => queueMicrotask(() => fn(...args)),
  emitWarning: () => undefined,
  on: () => proc,
  once: () => proc,
  off: () => proc,
  emit: () => false,
  listeners: () => [],
  stdout: { write: () => true, isTTY: false },
  stderr: { write: () => true, isTTY: false },
  memoryUsage: () => ({ rss: 0, heapTotal: 0, heapUsed: 0, external: 0 }),
  uptime: () => (performance.now() - start) / 1000,
};
if (!globalThis.process) globalThis.process = proc;
// Node code also reaches for `global`.
if (!globalThis.global) globalThis.global = globalThis;
export default proc;
export const env = proc.env;
export const hrtime = proc.hrtime;
export const nextTick = proc.nextTick;
