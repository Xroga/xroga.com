import test from 'node:test';
import assert from 'node:assert/strict';
import { publicHealthPayload } from './safeHealth.js';

test('public health exposes no credential, provider-route, or callback diagnostics', () => {
  const payload = JSON.stringify(publicHealthPayload(new Date(0))).toLowerCase();
  for (const forbidden of ['key', 'secret', 'token', 'callback', 'redirect', 'modelroute', 'configured']) assert.equal(payload.includes(forbidden), false);
});

test('public health exposes only a validated release identifier', () => {
  const previous = process.env.XROGA_RELEASE_SHA;
  process.env.XROGA_RELEASE_SHA = 'abc1234';
  assert.equal(publicHealthPayload(new Date(0)).release, 'abc1234');
  process.env.XROGA_RELEASE_SHA = 'unsafe value';
  assert.equal(publicHealthPayload(new Date(0)).release, 'unavailable');
  if (previous === undefined) delete process.env.XROGA_RELEASE_SHA;
  else process.env.XROGA_RELEASE_SHA = previous;
});
