import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeEventBatches, normalizeCursor, replayRunEvents } from './eventReplay.js';

const events = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ sequence: from + i, type: 'progress' }));

test('positive control: a reconnect after sequence 3 receives exactly 4..10 in order', () => {
  const r = replayRunEvents({ events: events(1, 10), lastSequence: 10 }, 3);
  assert.deepEqual(r.events.map((e) => e.sequence), [4, 5, 6, 7, 8, 9, 10]);
  assert.equal(r.truncated, false); assert.equal(r.lastSequence, 10); assert.equal(r.firstRetainedSequence, 1);
});

test('a client already caught up receives nothing new and loses nothing (idempotent reconnect)', () => {
  const r = replayRunEvents({ events: events(1, 10), lastSequence: 10 }, 10);
  assert.deepEqual(r.events, []); assert.equal(r.truncated, false);
  assert.deepEqual(replayRunEvents({ events: events(1, 10), lastSequence: 10 }, 999).events, [], 'a cursor from the future yields nothing, not an error');
});

test('Golden G/T: a cursor older than the retained window is reported as a gap, not as an unbroken history', () => {
  // the run kept only 901..1000 of 1000 events
  const r = replayRunEvents({ events: events(901, 1000), lastSequence: 1000 }, 5);
  assert.equal(r.truncated, true);
  assert.equal(r.firstRetainedSequence, 901);
  assert.equal(r.events.length, 100, 'the retained events are still delivered');
  assert.equal(r.events[0]!.sequence, 901);
  // a cursor exactly at the edge of the window has lost nothing
  assert.equal(replayRunEvents({ events: events(901, 1000), lastSequence: 1000 }, 900).truncated, false);
  assert.equal(replayRunEvents({ events: events(901, 1000), lastSequence: 1000 }, 899).truncated, true);
});

test('out-of-order and duplicated stored events are returned ascending with one copy per sequence', () => {
  const messy = [{ sequence: 4 }, { sequence: 2 }, { sequence: 3 }, { sequence: 2 }, { sequence: 1 }, { sequence: 4 }];
  const r = replayRunEvents({ events: messy, lastSequence: 4 }, 0);
  assert.deepEqual(r.events.map((e) => e.sequence), [1, 2, 3, 4]);
});

test('a hostile or malformed cursor is normalized to zero rather than skipping or crashing', () => {
  for (const bad of ['abc', -5, NaN, Infinity, null, undefined, {}, '1; DROP TABLE']) assert.equal(normalizeCursor(bad), 0);
  assert.equal(normalizeCursor('7'), 7); assert.equal(normalizeCursor(7.9), 7);
});

test('an empty run replays nothing and is not reported as truncated', () => {
  const r = replayRunEvents({ events: [], lastSequence: 0 }, 0);
  assert.deepEqual(r.events, []); assert.equal(r.truncated, false); assert.equal(r.firstRetainedSequence, null);
});

test('client merge: overlapping, duplicated and out-of-order batches converge to one ascending history without fabricating events', () => {
  const live = [{ sequence: 6 }, { sequence: 5 }, { sequence: 7 }];
  const replay = [{ sequence: 4 }, { sequence: 5 }, { sequence: 6 }];
  const merged = mergeEventBatches(replay, live);
  assert.deepEqual(merged.map((e) => e.sequence), [4, 5, 6, 7]);
  // delivering the same transport batch twice changes nothing
  assert.deepEqual(mergeEventBatches(merged, live), merged);
  // a gap stays a gap: event 8 arriving before 7 is held in order, never filled in
  assert.deepEqual(mergeEventBatches([{ sequence: 4 }], [{ sequence: 9 }, { sequence: 6 }]).map((e) => e.sequence), [4, 6, 9]);
});

test('merge keeps the first stored copy of a sequence, so a later conflicting copy cannot rewrite history', () => {
  const a = [{ sequence: 1, message: 'original' }];
  const b = [{ sequence: 1, message: 'rewritten' }];
  assert.equal(mergeEventBatches(a, b)[0]!.message, 'original');
});
