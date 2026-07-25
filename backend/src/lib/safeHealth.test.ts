import test from 'node:test';
import assert from 'node:assert/strict';
import { publicHealthPayload } from './safeHealth.js';

test('public health exposes no credential, provider-route, or callback diagnostics', () => {
  const payload = JSON.stringify(publicHealthPayload(new Date(0))).toLowerCase();
  for (const forbidden of ['key', 'secret', 'token', 'callback', 'redirect', 'modelroute', 'configured']) assert.equal(payload.includes(forbidden), false);
});
