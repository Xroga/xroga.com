import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calculateValues } from './xrogaCalculations';

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

test('loan-payment matches standard amortization and compound-growth matches yearly compounding', () => {
  // $344,000 at 6.8% over 30 years: the published amortization payment is about $2,242.76 a month.
  assert.ok(Math.abs(calculateValues('loan-payment', [344000, 6.8, 30]) - 2242.76) < 0.5);
  assert.ok(Math.abs(calculateValues('loan-payment', [288000, 6.8, 30]) - 1877.6) < 0.5);
  assert.equal(calculateValues('loan-payment', [1200, 0, 1]), 100);
  assert.ok(Number.isNaN(calculateValues('loan-payment', [1000, 5, 0])));
  assert.ok(Number.isNaN(calculateValues('loan-payment', [1000, 5])));
  assert.ok(Math.abs(calculateValues('compound-growth', [1000, 7, 20]) - 3869.68) < 0.01);
  assert.ok(Number.isNaN(calculateValues('compound-growth', [1000, 7])));
});

test('mortgage-payment takes price, down payment percent, rate and years', () => {
  // $430,000 with 20% down is a $344,000 loan: about $2,242.76 a month at 6.8% over 30 years.
  assert.ok(Math.abs(calculateValues('mortgage-payment', [430000, 20, 6.8, 30]) - 2242.76) < 0.5);
  assert.ok(Math.abs(calculateValues('mortgage-payment', [360000, 20, 6.8, 30]) - 1877.6) < 0.5);
  assert.ok(Math.abs(calculateValues('mortgage-payment', [430000, 100, 6.8, 30])) < 1e-9, 'a fully paid price leaves no payment');
  assert.ok(Number.isNaN(calculateValues('mortgage-payment', [430000, 20, 6.8])));
});
