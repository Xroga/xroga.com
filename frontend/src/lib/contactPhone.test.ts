import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeContactPhone } from './contactPhone';

test('contact phone accepts an international number and strips display punctuation', () => {
  assert.equal(normalizeContactPhone('+1 (412) 555-0123'), '+14125550123');
});

test('contact phone rejects missing country code and malformed numbers', () => {
  for (const value of ['', '555-0123', '+0123456789', '+123', '+1 412 ext 4']) {
    assert.equal(normalizeContactPhone(value), null);
  }
});
