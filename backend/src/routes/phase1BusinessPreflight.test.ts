import assert from 'node:assert/strict';
import { test } from 'node:test';

import { connectionStatusTarget, explicitConfirmationIntent } from './phase1BusinessPreflight.js';

test('connection-status questions bypass tool discovery without treating connection requests as status checks', () => {
  assert.equal(connectionStatusTarget('check gmail app is connected with xroga'), 'gmail');
  assert.equal(connectionStatusTarget('Is my Google Calendar connected?'), 'Google Calendar');
  assert.equal(connectionStatusTarget('Which apps are connected?'), '*');
  assert.equal(connectionStatusTarget('Connect my Gmail account'), null);
  assert.equal(connectionStatusTarget('Send an email from Gmail'), null);
  assert.equal(connectionStatusTarget('Check Gmail is connected and send an email to Jane'), null);
  assert.equal(connectionStatusTarget('Which apps are connected, then create a calendar event'), null);
});

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
