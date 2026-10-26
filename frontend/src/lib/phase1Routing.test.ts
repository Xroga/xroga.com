import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRouteToPhase1 } from './phase1Routing';

test('an explicit connected-app logo task reaches the app planner', () => {
  assert.equal(shouldRouteToPhase1('Using my connected Canva account, create a private editable logo design.', []), true);
  assert.equal(shouldRouteToPhase1('With our connected design app, make a logo.', []), true);
});

test('generic image generation and software builds keep their existing routes', () => {
  assert.equal(shouldRouteToPhase1('Create a logo image for Xroga.', []), false);
  assert.equal(shouldRouteToPhase1('Build a working website for Xroga.', []), false);
});
