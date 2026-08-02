import assert from 'node:assert/strict';
import { test } from 'node:test';
import { elapsedLabel, heartbeatMessage, withProgressHeartbeat } from './progressHeartbeat.js';

/**
 * Cover for the silent stretches inside a run.
 *
 * Production run `46d07c5d`: `builder/building` at 15:21:38, then nothing at all until
 * `model_fallback` at 15:22:39 — sixty-one seconds, once per model in the fallback
 * order. The build was alive the whole time, waiting on a provider that never sent a
 * first token, but the terminal could not say so because progress is only emitted
 * between steps.
 *
 * The dangerous version of this fix is one that hides a timeout. These tests pin that
 * it cannot: the wrapped promise is returned untouched, rejections propagate, and the
 * beats stop the instant it settles.
 */

/** A controllable interval, so the tests do not depend on real time. */
function fakeTimers() {
  let nextId = 1;
  const active = new Map<number, { fn: () => void; ms: number }>();
  let clock = 0;
  return {
    now: () => clock,
    active,
    setTimer: ((fn: () => void, ms: number) => {
      const id = nextId++;
      active.set(id, { fn, ms });
      return id as unknown as NodeJS.Timeout;
    }) as unknown as typeof setInterval,
    clearTimer: ((id: NodeJS.Timeout) => {
      active.delete(id as unknown as number);
    }) as unknown as typeof clearInterval,
    /** Advances by one interval and fires whatever is still registered. */
    tick(ms: number) {
      clock += ms;
      for (const entry of [...active.values()]) entry.fn();
    },
  };
}

test('the resolved value passes through unchanged', async () => {
  const timers = fakeTimers();
  const value = await withProgressHeartbeat(
    { everyMs: 1000, emit: () => {}, setTimer: timers.setTimer, clearTimer: timers.clearTimer },
    async () => ({ files: 3 }),
  );
  assert.deepEqual(value, { files: 3 });
});

test('a rejection propagates — a heartbeat must not swallow a failure', async () => {
  const timers = fakeTimers();
  await assert.rejects(
    withProgressHeartbeat(
      { everyMs: 1000, emit: () => {}, setTimer: timers.setTimer, clearTimer: timers.clearTimer },
      async () => {
        throw new Error('first_token_timeout');
      },
    ),
    /first_token_timeout/,
  );
});

test('beats stop as soon as the work settles, on success and on failure', async () => {
  for (const outcome of ['resolve', 'reject'] as const) {
    const timers = fakeTimers();
    const run = withProgressHeartbeat(
      { everyMs: 1000, emit: () => {}, setTimer: timers.setTimer, clearTimer: timers.clearTimer },
      async () => {
        if (outcome === 'reject') throw new Error('nope');
        return 'ok';
      },
    );
    await run.catch(() => {});
    assert.equal(timers.active.size, 0, outcome);
  }
});

test('a beat reports the real elapsed time, measured from the start of the wait', async () => {
  const timers = fakeTimers();
  const seen: number[] = [];
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const run = withProgressHeartbeat(
    {
      everyMs: 1000,
      emit: (elapsedMs) => seen.push(elapsedMs),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      now: timers.now,
    },
    () => gate,
  );

  timers.tick(1000);
  timers.tick(1000);
  release!();
  await run;

  assert.deepEqual(seen, [1000, 2000]);
});

test('the first beat lands one interval in, not immediately', async () => {
  // A beat at zero would duplicate the step line that was just emitted.
  const timers = fakeTimers();
  const seen: number[] = [];
  await withProgressHeartbeat(
    {
      everyMs: 1000,
      emit: (ms) => seen.push(ms),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      now: timers.now,
    },
    async () => 'done',
  );
  assert.deepEqual(seen, []);
});

test('a throwing emitter cannot fail the build', async () => {
  const timers = fakeTimers();
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const run = withProgressHeartbeat(
    {
      everyMs: 1000,
      emit: () => {
        throw new Error('SSE socket closed');
      },
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      now: timers.now,
    },
    () => gate,
  );
  timers.tick(1000);
  release!();
  await run;
});

test('the message states waiting, never progress or an outcome', () => {
  const message = heartbeatMessage('Kimi K3 to return code', 61_000);
  assert.match(message, /Still waiting/);
  assert.match(message, /no output received yet/);
  // Must stay true if the very next thing that happens is a timeout.
  assert.doesNotMatch(message, /almost|nearly|soon|shortly|%|complete|success/i);
});

test('the message names what is being waited on, so two silences are distinguishable', () => {
  assert.notEqual(
    heartbeatMessage('live research sources', 12_000),
    heartbeatMessage('your repository files', 12_000),
  );
});

test('elapsed time reads as a human duration', () => {
  assert.equal(elapsedLabel(0), '0s');
  assert.equal(elapsedLabel(12_000), '12s');
  assert.equal(elapsedLabel(59_400), '59s');
  assert.equal(elapsedLabel(60_000), '1m');
  assert.equal(elapsedLabel(61_000), '1m 1s');
  assert.equal(elapsedLabel(125_000), '2m 5s');
});

test('a negative clock reading never prints a negative duration', () => {
  assert.equal(elapsedLabel(-5000), '0s');
});
