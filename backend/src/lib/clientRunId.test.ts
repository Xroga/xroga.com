import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { isValidClientRunId } from './clientRunId.js';

/**
 * Cover for accepting a client-supplied run ID.
 *
 * The whole point is that the browser can know its runId before a single byte of the
 * SSE stream arrives, so a stalled or dropped connection still has something to poll
 * with. That only works if the server actually uses the ID the client sent — these
 * tests pin the boundary of what gets trusted as a row id versus discarded in favour of
 * a fresh server-generated one.
 */

test('a real UUID is accepted', () => {
  assert.equal(isValidClientRunId(randomUUID()), true);
});

test('uppercase hex is still a valid UUID', () => {
  assert.equal(isValidClientRunId(randomUUID().toUpperCase()), true);
});

test('a missing runId falls back cleanly — not a malformed string', () => {
  assert.equal(isValidClientRunId(undefined), false);
  assert.equal(isValidClientRunId(null), false);
});

test('a non-string value is never trusted, however it is shaped', () => {
  for (const value of [12345, {}, [], true, randomUUID().split('-')]) {
    assert.equal(isValidClientRunId(value), false);
  }
});

test('a malformed or attacker-shaped string is rejected rather than reaching the database', () => {
  for (const value of [
    'not-a-uuid',
    '',
    randomUUID().slice(0, -1),
    `${randomUUID()}; DROP TABLE swarm_runs;`,
    '00000000-0000-0000-0000-00000000000',
  ]) {
    assert.equal(isValidClientRunId(value), false, value);
  }
});
