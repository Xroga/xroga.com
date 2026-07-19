import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { verifyExpoToken } from './userOwnedPublish.js';

describe('userOwnedPublish', () => {
  it('rejects short expo tokens without calling network', async () => {
    const res = await verifyExpoToken('short');
    assert.equal(res.ok, false);
    assert.match(res.error || '', /short/i);
  });
});
