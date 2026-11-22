import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentTeamResponse } from './teamMembershipSelection';

test('a team roster is shown only for the currently authorized selection and revision', () => {
  const data = { members: ['Synthetic member'], activity: [] };
  const response = { teamId: 'alpha', revision: 3, data };
  assert.equal(currentTeamResponse(response, 'alpha', 3), data);
  assert.equal(currentTeamResponse(response, 'beta', 3), null);
  assert.equal(currentTeamResponse(response, undefined, 3), null);
  assert.equal(currentTeamResponse(response, 'alpha', 4), null);
  assert.equal(currentTeamResponse(null, 'alpha', 3), null);
});
