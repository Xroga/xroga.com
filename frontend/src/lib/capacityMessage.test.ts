import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capacityUnavailableLine, formatUnlockTime } from './capacityMessage';

/**
 * Cover for the capacity error line shown in the terminal and the chat bubble.
 *
 * The account owner's exact request: keep the next-unlock timing visible, never show a
 * dollar amount. The Plan & Usage panel already renders "Next unlock: Aug 3, 3:42 PM"
 * from the same ISO timestamp using `Intl.DateTimeFormat(undefined, { dateStyle:
 * 'medium', timeStyle: 'short' })` — this reuses that exact formatting so the two
 * places never disagree about what time it is.
 */

test('a valid ISO timestamp is appended in the same format the Plan & Usage panel uses', () => {
  const line = capacityUnavailableLine('Base message.', '2026-08-03T15:42:46.809Z');
  const expected = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date('2026-08-03T15:42:46.809Z'),
  );
  assert.equal(line, `Base message. More capacity unlocks ${expected}.`);
});

test('no dollar amount ever appears', () => {
  const line = capacityUnavailableLine('Base message.', '2026-08-03T15:42:46.809Z');
  assert.doesNotMatch(line, /\$|USD|micro/i);
});

test('a missing timestamp returns the base message unchanged', () => {
  assert.equal(capacityUnavailableLine('Base message.', undefined), 'Base message.');
  assert.equal(capacityUnavailableLine('Base message.', null), 'Base message.');
});

test('a non-string value is treated as missing, not thrown on', () => {
  assert.equal(capacityUnavailableLine('Base message.', 12345), 'Base message.');
  assert.equal(capacityUnavailableLine('Base message.', { at: 'x' }), 'Base message.');
});

test('an unparseable string is treated as missing rather than printing "Invalid Date"', () => {
  assert.equal(capacityUnavailableLine('Base message.', 'not-a-date'), 'Base message.');
});

test('an empty string is treated as missing', () => {
  assert.equal(capacityUnavailableLine('Base message.', ''), 'Base message.');
});

/**
 * Cover for `formatUnlockTime`, shared by the Plan & Usage panel, the terminal
 * transcript, and the inline "Use full power now" card added for people who said they
 * do not want to wait for the daily unlock. All three must show the same time for the
 * same timestamp — this is the one place that formatting can happen.
 */

test('formatUnlockTime matches capacityUnavailableLine\'s own formatting', () => {
  const iso = '2026-08-03T15:42:46.809Z';
  const formatted = formatUnlockTime(iso);
  assert.equal(capacityUnavailableLine('Base.', iso), `Base. More capacity unlocks ${formatted}.`);
});

test('formatUnlockTime returns null rather than "Invalid Date" for bad input', () => {
  assert.equal(formatUnlockTime(undefined), null);
  assert.equal(formatUnlockTime(null), null);
  assert.equal(formatUnlockTime(''), null);
  assert.equal(formatUnlockTime('not-a-date'), null);
  assert.equal(formatUnlockTime(12345), null);
});
