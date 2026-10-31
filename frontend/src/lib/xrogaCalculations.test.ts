import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateValues, calculatorInputValue } from './xrogaCalculations';

test('calculator input validates blanks, finite values and declared bounds', () => {
  for (const value of ['', ' ', 'Infinity', 'NaN', 'alert(1)', '-1', '121']) assert.ok(Number.isNaN(calculatorInputValue(value, 0, 120)));
  assert.equal(calculatorInputValue('0', 0, 120), 0);
  assert.equal(calculatorInputValue('120', 0, 120), 120);
  assert.equal(calculatorInputValue('2.5', 0, 120), 2.5);
  assert.ok(Number.isNaN(calculateValues('product', [calculatorInputValue(''), 25])));
});

test('allowlisted calculator operations return deterministic values', () => {
  assert.equal(calculateValues('sum', [10, 5, 2]), 17);
  assert.equal(calculateValues('difference', [10, 5, 2]), 3);
  assert.equal(calculateValues('product', [10, 5, 2]), 100);
  assert.equal(calculateValues('quotient', [100, 5, 2]), 10);
  assert.equal(calculateValues('average', [10, 20, 30]), 20);
  assert.equal(calculateValues('percentage', [25, 200]), 12.5);
  assert.equal(calculateValues('percentage-change', [100, 125]), 25);
  assert.equal(calculateValues('minimum', [10, 5, 20]), 5);
  assert.equal(calculateValues('maximum', [10, 5, 20]), 20);
});

test('invalid arithmetic returns a non-finite result instead of executing code', () => {
  assert.equal(Number.isNaN(calculateValues('quotient', [10, 0])), true);
  assert.equal(Number.isNaN(calculateValues('percentage', [10, 0])), true);
  assert.equal(Number.isNaN(calculateValues('sum', [])), true);
});
