import assert from 'node:assert/strict';
import { test } from 'node:test';

import { explicitConfirmationIntent } from './phase1BusinessPreflight.js';

test('only explicit pending-action follow-ups bypass semantic planning', () => {
  assert.equal(explicitConfirmationIntent('Confirm it'), 'confirm');
  assert.equal(explicitConfirmationIntent('No, cancel that action'), 'cancel');
});

test('new software and connected-app requests remain semantic-planner inputs', () => {
  const requests = [
    'Make a patient scheduling interface with validation and a runnable Preview.',
    'Create an inventory forecasting service and test its API.',
    'Send the approved status update to the project channel.',
    'Schedule a meeting with the design team tomorrow.',
  ];

  for (const request of requests) {
    assert.equal(explicitConfirmationIntent(request), null);
  }
});
