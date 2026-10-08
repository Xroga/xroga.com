import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreDecisionOptions } from './xrogaDecisionMatrix';

const criteria = [{ id: 'cost', weight: 2 }, { id: 'quality', weight: 3 }];
const options = [
  { id: 'a', scores: { cost: 8, quality: 7 } },
  { id: 'b', scores: { cost: 6, quality: 9 } },
];

test('decision matrix ranks supplied weighted scores deterministically', () => {
  const ranked = scoreDecisionOptions(criteria, options);
  assert.equal(ranked?.[0]?.id, 'b');
  assert.equal(ranked?.[0]?.total, 7.8);
  assert.equal(ranked?.[1]?.total, 7.4);
  assert.equal(scoreDecisionOptions(criteria, options, { cost: 10, quality: 0 })?.[0]?.id, 'a');
});

test('decision matrix rejects missing data and zero-weight comparisons', () => {
  assert.equal(scoreDecisionOptions(criteria, [{ id: 'a', scores: { cost: 8 } }]), null);
  assert.equal(scoreDecisionOptions(criteria, options, { cost: 0, quality: 0 }), null);
  assert.equal(scoreDecisionOptions(criteria, [{ id: 'a', scores: { cost: 11, quality: 7 } }]), null);
});
