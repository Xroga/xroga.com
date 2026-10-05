import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCapacityPercent } from './capacityPercent';

test('capacity percentages are bounded to the public 0-100 contract', () => {
  assert.equal(normalizeCapacityPercent(815.2), 100);
  assert.equal(normalizeCapacityPercent(600), 100);
  assert.equal(normalizeCapacityPercent(100.04), 100);
  assert.equal(normalizeCapacityPercent(42.26), 42.3);
  assert.equal(normalizeCapacityPercent(-7), 0);
  assert.equal(normalizeCapacityPercent(Number.NaN), null);
  assert.equal(normalizeCapacityPercent(null), null);
});
