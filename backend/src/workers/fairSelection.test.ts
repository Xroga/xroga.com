import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectFairly } from './fairSelection.js';

const row = (id: string, user: string | null, second: number) => ({ id, user_id: user, created_at: new Date(Date.UTC(2026, 9, 29, 0, 0, second)).toISOString() });

test('positive control: a single tenant keeps its own oldest-first order and the limit', () => {
  const rows = [row('a3', 'A', 3), row('a1', 'A', 1), row('a2', 'A', 2)];
  assert.deepEqual(selectFairly(rows, 2).map((r) => r.id), ['a1', 'a2']);
});

test('a later tenant is offered immediately instead of waiting behind another tenant\'s whole backlog', () => {
  const heavy = Array.from({ length: 20 }, (_, i) => row(`h${i}`, 'HEAVY', i));
  const light = row('l0', 'LIGHT', 25);
  const picked = selectFairly([...heavy, light], 10).map((r) => r.id);
  assert.ok(picked.includes('l0'), 'the light tenant is in the first offered batch');
  assert.equal(picked.indexOf('l0'), 1, 'and goes second, right after the oldest request');
});

test('tenants take turns, each tenant\'s own order is preserved, and the tenant with the oldest request starts', () => {
  const rows = [row('b1', 'B', 1), row('a1', 'A', 2), row('a2', 'A', 3), row('b2', 'B', 4), row('c1', 'C', 5), row('a3', 'A', 6)];
  assert.deepEqual(selectFairly(rows, 6).map((r) => r.id), ['b1', 'a1', 'c1', 'b2', 'a2', 'a3']);
});

test('the limit is respected, nothing is invented, and an empty or zero request returns nothing', () => {
  const rows = [row('a1', 'A', 1), row('b1', 'B', 2)];
  assert.deepEqual(selectFairly(rows, 1).map((r) => r.id), ['a1']);
  assert.deepEqual(selectFairly(rows, 0), []);
  assert.deepEqual(selectFairly([], 5), []);
  assert.equal(selectFairly(rows, 99).length, 2);
});

test('rows without an owner are treated as one group rather than dropped', () => {
  const rows = [row('x1', null, 1), row('x2', null, 2), row('a1', 'A', 3)];
  assert.deepEqual(selectFairly(rows, 3).map((r) => r.id), ['x1', 'a1', 'x2']);
});
