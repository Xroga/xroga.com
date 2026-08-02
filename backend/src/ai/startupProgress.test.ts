import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STARTUP_STEPS, startupProgress, type StartupStep } from './startupProgress.js';

/**
 * Cover for the blank-terminal report.
 *
 * A user sent "build a portfolio site with a dark theme" and the terminal below their
 * own prompt stayed completely empty. Production run `46d07c5d` shows why: the run row
 * was written at 15:20:20 and the first progress event arrived at 15:20:42 — a
 * twenty-two second gap during which the backend was busy and said nothing.
 *
 * These tests pin the properties that make the new lines safe to show: they are plain
 * statements of what is happening, and none of them can be read as a claim about
 * progress, timing, or a result that has not happened yet.
 */

test('every startup step has a line', () => {
  for (const step of STARTUP_STEPS) {
    const line = startupProgress(step);
    assert.ok(line.message.trim().length > 0, step);
    assert.ok(line.agent.trim().length > 0, step);
    assert.ok(line.status.trim().length > 0, step);
  }
});

test('the pipeline emits them in the order the work happens', () => {
  // The order is the contract: `hydrated` reports a finished read, so it can never
  // precede `repository`, and `route` is chosen only once the files are known.
  assert.deepEqual(
    [...STARTUP_STEPS],
    ['accepted', 'quota', 'history', 'repository', 'hydrated', 'route'],
  );
});

test('no line invents a percentage, an ETA, or a step count', () => {
  // The pipeline does not know how long a GitHub read takes. A fabricated number is
  // what made the previous UI untrustworthy — it kept moving while nothing happened.
  for (const step of STARTUP_STEPS) {
    const line = startupProgress(step);
    assert.doesNotMatch(line.message, /%|\bETA\b|\bstep \d+\b|\d+\s*of\s*\d+/i, step);
  }
});

test('no line claims a result that has not happened', () => {
  for (const step of STARTUP_STEPS) {
    const line = startupProgress(step);
    assert.doesNotMatch(line.message, /deployed|pushed|shipped|live at|success/i, step);
  }
});

test('the accepted line is the first thing a user can see', () => {
  const line = startupProgress('accepted');
  assert.equal(STARTUP_STEPS[0], 'accepted');
  // It has to answer "did my message arrive?" on its own, with no other row present.
  assert.match(line.message, /received/i);
  assert.match(line.swarmActivity, /received/i);
});

test('swarmActivity is a readable line, because that is what the terminal renders', () => {
  // `adaptTerminalEvent` prefers `swarmActivity` over `message`, so a terse internal
  // label like "Account check" would be the whole line a user sees. Each one has to
  // stand alone.
  for (const step of STARTUP_STEPS) {
    const line = startupProgress(step);
    assert.ok(line.swarmActivity.trim().split(/\s+/).length >= 2, `${step}: too terse`);
    assert.doesNotMatch(line.swarmActivity, /%|\bETA\b/i, step);
  }
});

test('a first build says it has no files rather than reporting zero', () => {
  const line = startupProgress('hydrated', { fileCount: 0 });
  assert.match(line.message, /No existing project files/);
  assert.doesNotMatch(line.message, /\b0 files?\b/);
});

test('a hydrated repository reports the real file count', () => {
  assert.match(startupProgress('hydrated', { fileCount: 42 }).message, /42 files/);
});

test('one file is singular', () => {
  const line = startupProgress('hydrated', { fileCount: 1 });
  assert.match(line.message, /1 file\b/);
  assert.doesNotMatch(line.message, /1 files/);
});

test('a missing file count is treated as a new project, not as a read of nothing', () => {
  assert.equal(startupProgress('hydrated').message, startupProgress('hydrated', { fileCount: 0 }).message);
});

test('lines are copies, so a caller spreading extra fields cannot mutate the table', () => {
  const first = startupProgress('accepted') as StartupProgressLineMutable;
  first.message = 'tampered';
  assert.notEqual(startupProgress('accepted').message, 'tampered');
});

type StartupProgressLineMutable = { message: string };

test('no line asks the user to do engineering work', () => {
  // The same rule the compile blocker message follows: Xroga does the work.
  for (const step of STARTUP_STEPS as StartupStep[]) {
    assert.doesNotMatch(startupProgress(step).message, /npm|install|TypeScript|terminal|run\s+the/i, step);
  }
});
