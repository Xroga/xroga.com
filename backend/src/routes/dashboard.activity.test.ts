import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ownedActivityProjectName } from './dashboard.js';

test('dashboard project labels require independently matching parent ownership', () => {
  assert.equal(ownedActivityProjectName({ user_id: 'owner', name: 'Own' }, 'owner'), 'Own');
  for (const row of [null, undefined, [], { name: 'Unknown owner' }, { user_id: 'foreign', name: 'Private' }, { user_id: 'owner', name: {} }]) {
    assert.equal(ownedActivityProjectName(row, 'owner'), undefined);
  }
});
