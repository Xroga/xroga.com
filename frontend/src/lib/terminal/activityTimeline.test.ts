import test from 'node:test';
import assert from 'node:assert/strict';
import type { XrogaActivityKind, XrogaActivityPresentation, XrogaActivityStatus } from './activityPresentation';
import { buildActivityTimeline, familyOf, formatElapsed, liveLabel, pendingWorkLabel, summariseSettled } from './activityTimeline';
import type { TerminalEvent } from './terminalEvent';

let counter = 0;
const row = (kind: XrogaActivityKind, label: string, status: XrogaActivityStatus = 'complete', extra: Partial<XrogaActivityPresentation> = {}): XrogaActivityPresentation =>
  ({ id: `r${++counter}`, kind, label, status, startedAt: 1000 + counter, updatedAt: 1000 + counter, ...extra });

test('consecutive finished rows of one family become one summary, in event order', () => {
  const items = summariseSettled([
    row('command', 'Listed files'), row('command', 'Checked git status'), row('test', 'Ran unit tests'), row('command', 'Ran the build'),
  ]);
  assert.deepEqual(items.map(item => item.label), ['Ran 2 commands', 'Ran unit tests', 'Ran the build']);
  assert.deepEqual(items.map(item => item.count), [2, 1, 1]);
});

test('a failure stays visible in its group label and tone, and a standalone error is never merged away', () => {
  const group = summariseSettled([row('command', 'a'), row('command', 'b', 'error'), row('command', 'c'), row('command', 'd')]);
  assert.equal(group.length, 1);
  assert.equal(group[0].label, 'Ran 4 commands (1 failed)');
  assert.equal(group[0].tone, 'failed');
  assert.equal(group[0].failed, 1);
  const alone = summariseSettled([row('command', 'a'), row('error', 'Could not complete this step', 'error'), row('command', 'b')]);
  assert.deepEqual(alone.map(item => item.tone), ['done', 'failed', 'done']);
});

test('read, search and edit rows are summarised by what they really were', () => {
  const items = summariseSettled([
    row('read-file', 'x'), row('read-file', 'y'), row('read-file', 'z'),
    row('search', 'q1'), row('search', 'q2'),
    row('write-file', 'f1'), row('write-file', 'f2'),
  ]);
  assert.deepEqual(items.map(item => item.label), ['Read 3 files', 'Searched the web 2 times', 'Edited 2 files']);
});

test('exactly one row is live and finished rows never become the headline', () => {
  const rows = [row('read-file', 'Read the project'), row('code', 'Updating components', 'active'), row('test', 'Ran tests')];
  const model = buildActivityTimeline(rows, { runActive: true });
  assert.equal(model.state, 'working');
  assert.equal(model.active?.label, 'Updating components');
  assert.equal(model.settled.length, 2);
  assert.equal(model.otherActive, 0);
});

test('parallel live steps do not flicker, but a step that already finished is never held on screen', () => {
  const a = row('read-file', 'Reading the router', 'active', { id: 'a' });
  const b = row('search', 'Searching the web', 'active', { id: 'b' });
  const held = buildActivityTimeline([a, b], { runActive: true, displayedActiveId: 'a', displayedSince: 1000, now: 1300 });
  assert.equal(held.active?.id, 'a');
  assert.equal(held.otherActive, 1);
  assert.equal(liveLabel(held.active!, held.otherActive), 'Reading the router +1 more');
  const released = buildActivityTimeline([a, b], { runActive: true, displayedActiveId: 'a', displayedSince: 1000, now: 2000 });
  assert.equal(released.active?.id, 'b');
  const finished = buildActivityTimeline([{ ...a, status: 'complete' }, b], { runActive: true, displayedActiveId: 'a', displayedSince: 1000, now: 1100 });
  assert.equal(finished.active?.id, 'b', 'a completed step cannot be shown as live');
});

test('state reflects only real outcomes: waiting for approval, failed, stopped, done, and idle with no rows', () => {
  assert.equal(buildActivityTimeline([row('approval', 'Waiting for your approval', 'waiting')]).state, 'waiting');
  assert.equal(buildActivityTimeline([row('command', 'x'), row('error', 'Could not complete', 'error')], { outcome: 'failure' }).state, 'failed');
  assert.equal(buildActivityTimeline([row('command', 'x', 'interrupted')], { outcome: 'interrupted' }).state, 'stopped');
  assert.equal(buildActivityTimeline([row('command', 'x')], { outcome: 'success' }).state, 'done');
  assert.equal(buildActivityTimeline([]).state, 'idle');
  assert.equal(buildActivityTimeline([]).settled.length, 0);
  assert.equal(buildActivityTimeline([], { runActive: true }).state, 'working');
});

test('elapsed time is plain and omitted below one second', () => {
  assert.equal(formatElapsed(400), '');
  assert.equal(formatElapsed(12_000), '12s');
  assert.equal(formatElapsed(77_000), '1m 17s');
  assert.equal(formatElapsed(3_900_000), '1h 05m');
  assert.equal(formatElapsed(Number.NaN), '');
});

test('waiting for approval takes priority over a parallel running command', () => {
  const approval = row('approval', 'Approval required', 'waiting');
  const command = row('command', 'Running tests', 'active');
  const model = buildActivityTimeline([approval, command], { runActive: true, displayedActiveId: command.id });
  assert.equal(model.state, 'waiting');
  assert.equal(model.active?.id, approval.id);
});

test('a reopened turn or completed run never presents an unconfirmed step as live or successful', () => {
  const rows = [row('command', 'Running a command', 'active'), row('search', 'Searched the web')];
  for (const options of [{ runActive: false }, { outcome: 'success' as const }]) {
    const model = buildActivityTimeline(rows, options);
    assert.equal(model.active, null);
    assert.equal(model.settled[0]?.tone, 'warning');
    assert.match(model.settled[0]?.label ?? '', /No completion update/);
  }
});

test('only a real answer delta changes the pending label to writing', () => {
  const open: TerminalEvent = { seq: 1, kind: 'session', rawEvent: 'start', level: 'info', at: 1, source: null, body: null, text: 'Started' };
  const delta: TerminalEvent = { ...open, seq: 2, kind: 'output', rawEvent: 'delta', text: 'Partial answer' };
  assert.equal(pendingWorkLabel([], false), 'Starting request');
  assert.equal(pendingWorkLabel([open], false), 'Waiting for the next update');
  assert.equal(pendingWorkLabel([open, delta], false), 'Writing response');
  assert.equal(pendingWorkLabel([open, delta, { ...open, kind: 'status', seq: 3 }], true), 'Waiting for the next update');
});

test('every activity kind maps to a family, so a new kind cannot silently fall outside the timeline', () => {
  const kinds: XrogaActivityKind[] = ['respond', 'understand', 'search', 'open-source', 'read-source', 'compare', 'summarize', 'read-file', 'write-file', 'code', 'command', 'test', 'browser', 'database', 'connected-app-read', 'connected-app-write', 'automation', 'upload', 'download', 'deploy', 'verify', 'approval', 'connection', 'waiting', 'complete', 'warning', 'error'];
  for (const kind of kinds) assert.ok(familyOf(kind), kind);
});
