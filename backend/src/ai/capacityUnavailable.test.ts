import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capacityUnavailableError } from './capacityUnavailable.js';

/**
 * Cover for the pacing-cap error message.
 *
 * Production evidence: account `423e4261…` hit "Currently unlocked AI capacity is
 * unavailable" mid-build. The account's own Plan & Usage panel showed 83.8% of the
 * whole entitlement remaining and a next unlock time — none of which the error message
 * mentioned. The account owner asked to keep the next-unlock timing and drop any
 * dollar amount, since the product frames this as capacity, not a balance.
 */

test('a genuine cap carries the unlock time and no dollar figure', () => {
  const error = capacityUnavailableError(true, '2026-08-03T15:42:46.809Z');
  assert.equal(error.code, 'PAID_PROVIDER_CAPACITY_UNAVAILABLE');
  assert.equal(error.nextUnlockAt, '2026-08-03T15:42:46.809Z');
  assert.doesNotMatch(error.message, /\$|USD|micro/i);
});

test('a genuine cap with no scheduled unlock omits the time rather than guessing', () => {
  const error = capacityUnavailableError(true, null);
  assert.equal(error.nextUnlockAt, null);
});

test('a failure that is not the cap never claims one, and drops the unlock time', () => {
  // Naming a time that would not have changed the outcome is noise dressed as a lead.
  const error = capacityUnavailableError(false, '2026-08-03T15:42:46.809Z');
  assert.equal(error.nextUnlockAt, null);
  assert.doesNotMatch(error.message, /fully in use|unlocked AI capacity/i);
  assert.match(error.message, /try again/i);
});

test('both messages are plain sentences, never a raw error blob', () => {
  for (const genuine of [true, false]) {
    const error = capacityUnavailableError(genuine, null);
    assert.doesNotMatch(error.message, /\{|\}|"code"|invalidToken/);
  }
});
