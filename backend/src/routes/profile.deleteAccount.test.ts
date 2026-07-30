import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { deleteAccountSchema } from './profile.js';

describe('account deletion confirmation contract', () => {
  it('requires the exact literal confirmation string', () => {
    assert.equal(deleteAccountSchema.safeParse({ confirm: 'DELETE' }).success, true);
  });

  it('rejects missing, blank, or near-miss confirmation values', () => {
    assert.equal(deleteAccountSchema.safeParse({}).success, false);
    assert.equal(deleteAccountSchema.safeParse({ confirm: '' }).success, false);
    assert.equal(deleteAccountSchema.safeParse({ confirm: 'delete' }).success, false);
    assert.equal(deleteAccountSchema.safeParse({ confirm: 'DELETE ' }).success, false);
  });

  it('rejects unknown fields alongside a valid confirmation', () => {
    assert.equal(deleteAccountSchema.safeParse({ confirm: 'DELETE', force: true }).success, false);
  });
});
