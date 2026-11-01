import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contactPhoneSchema } from './profile.js';

test('profile contact number requires a bounded E.164 value', () => {
  assert.equal(contactPhoneSchema.safeParse('+14125550123').success, true);
  for (const value of ['', '4125550123', '+0123456789', '+1 412 555 0123', '+123', '+1234567890123456']) {
    assert.equal(contactPhoneSchema.safeParse(value).success, false);
  }
});
