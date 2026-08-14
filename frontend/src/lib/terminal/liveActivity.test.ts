import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  WAITING_LINE_AFTER_SECONDS,
  formatElapsed,
  shouldShowWaitingLine,
  waitingLine,
} from './liveActivityText';
import { terminalRunReducer } from './terminalRunReducer';
import { adaptTerminalEvent } from './terminalEventAdapter';
import { EMPTY_RUN_STATE, type TerminalEvent } from './terminalEvent';

/**
 * Cover for the blank-terminal report.
 *
 * A user sent "build a portfolio site with a dark theme" and screenshotted the result:
 * their prompt in a bubble, and below it an entirely empty terminal. The build had
 * started — it was visible in the database — but nothing on screen said so, so the
 * product read as broken and people sent the same prompt again.
 *
 * The UI half of the fix is this: the run knows when it started, and something honest
 * is on screen from that moment. These tests pin that the something is honest.
 */

function row(seq: number, over: Partial<TerminalEvent> = {}): TerminalEvent {
  return {
    seq,
    kind: 'status',
    level: 'info',
    source: null,
    text: `row ${seq}`,
    body: null,
    at: 0,
    rawEvent: 'progress',
    ...over,
  };
}

test('a started run records when it started', () => {
  const state = terminalRunReducer(EMPTY_RUN_STATE, { type: 'run-started', at: 1_000 });
  assert.equal(state.startedAt, 1_000);
  assert.equal(state.active, true);
});

test('an idle terminal has no start time, so nothing can render an elapsed counter', () => {
  assert.equal(EMPTY_RUN_STATE.startedAt, null);
});

test('the start time survives incoming events', () => {
  // Without this the counter would reset to zero on the first backend row — the
  // clearest possible way to make a working build look like it restarted.
  let state = terminalRunReducer(EMPTY_RUN_STATE, { type: 'run-started', at: 1_000 });
  state = terminalRunReducer(state, { type: 'events', events: [row(1), row(2)] });
  assert.equal(state.startedAt, 1_000);
});

test('a second run restarts the clock rather than continuing the first', () => {
  let state = terminalRunReducer(EMPTY_RUN_STATE, { type: 'run-started', at: 1_000 });
  state = terminalRunReducer(state, { type: 'events', events: [row(1)] });
  state = terminalRunReducer(state, { type: 'run-started', at: 9_000 });
  assert.equal(state.startedAt, 9_000);
  assert.deepEqual(state.events, []);
});

test('the connecting line claims only that we are connecting', () => {
  const line = waitingLine(3);
  assert.match(line, /Connecting to the build service/);
  // At this point the client knows nothing about the build itself. Saying otherwise is
  // the fabrication the old checklist made.
  assert.doesNotMatch(line, /building|generating|writing|analy[sz]ing|%/i);
});

test('the connecting line carries the real elapsed time', () => {
  assert.match(waitingLine(0), /\(0s\)/);
  assert.match(waitingLine(45), /\(45s\)/);
  assert.match(waitingLine(90), /\(1m 30s\)/);
});

test('no notice is shown for a gap nobody notices', () => {
  // A user asked not to be shown a waiting message: they want to watch the work, not
  // read that work is pending. The backend's first event now leaves within
  // milliseconds, so this line is a slow-network fallback, not the normal experience.
  assert.equal(shouldShowWaitingLine(0), false);
  assert.equal(shouldShowWaitingLine(1), false);
  assert.equal(shouldShowWaitingLine(WAITING_LINE_AFTER_SECONDS), true);
  assert.equal(shouldShowWaitingLine(30), true);
});

test('elapsed formatting reads as a duration a person recognises', () => {
  assert.equal(formatElapsed(0), '0s');
  assert.equal(formatElapsed(59), '59s');
  assert.equal(formatElapsed(60), '1m');
  assert.equal(formatElapsed(61), '1m 1s');
  assert.equal(formatElapsed(600), '10m');
});

test('the first backend event replaces the waiting line with a real one', () => {
  // The waiting line is only shown while there is genuinely nothing from the server.
  let state = terminalRunReducer(EMPTY_RUN_STATE, { type: 'run-started', at: 0 });
  assert.equal(state.events.length, 0);

  const rows = adaptTerminalEvent(
    'progress',
    { agent: 'session', status: 'accepted', swarmActivity: 'Request received' },
    { fromSeq: 0 },
  );
  state = terminalRunReducer(state, { type: 'events', events: rows });
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].text, 'Request received');
});

test('the new backend startup events survive the adapter', () => {
  // Each of these is emitted before a real await in `runBuildPipeline`. If the adapter
  // dropped one, the terminal would go blank again for that step.
  const startup: Array<[string, string]> = [
    ['accepted', 'Request received'],
    ['checking_quota', 'Checking your available actions'],
    ['loading_history', 'Loading project memory'],
    ['reading_repository', 'Reading your project files'],
    ['repository_ready', 'Loaded 12 project files'],
    ['planning_route', 'Planning the build route'],
  ];
  for (const [status, activity] of startup) {
    const rows = adaptTerminalEvent(
      'progress',
      { agent: 'session', status, swarmActivity: activity },
      { fromSeq: 0 },
    );
    assert.equal(rows.length, 1, status);
    assert.equal(rows[0].text, activity, status);
  }
});

test('a heartbeat reaches the terminal with its elapsed time intact', () => {
  // Heartbeats deliberately omit `swarmActivity`, because the adapter prefers it over
  // `message` and the elapsed time lives in the message. If that ever changes, a
  // minute-long silence goes back to reading as one static line.
  const rows = adaptTerminalEvent(
    'progress',
    {
      agent: 'builder',
      status: 'awaiting_model',
      message: 'Still waiting on Kimi K3 to return code — no output received yet (1m 1s).',
    },
    { fromSeq: 0 },
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0].text, /1m 1s/);
  assert.doesNotMatch(rows[0].text, /Kimi/i);
  assert.match(rows[0].text, /Black Hole ∞/);
});

test('keepalives still produce nothing — the fix must not resurrect fake activity', () => {
  const rows = adaptTerminalEvent('progress', { keepalive: true, message: 'Working…' }, { fromSeq: 0 });
  assert.deepEqual(rows, []);
});
