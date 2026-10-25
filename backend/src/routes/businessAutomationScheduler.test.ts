import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyBusinessAutomationSchedulerToken } from './businessAutomationScheduler.js';

const config = {
  audience: 'https://xroga-api.example.run.app',
  serviceAccountEmail: 'xroga-scheduler@example.iam.gserviceaccount.com',
};
const validClaims = {
  email: config.serviceAccountEmail,
  email_verified: true,
  iss: 'https://accounts.google.com',
};

test('scheduler token check fails closed without configuration or bearer token', async () => {
  let called = false;
  const verify = async () => { called = true; return validClaims; };
  assert.equal(await verifyBusinessAutomationSchedulerToken('Bearer token', { ...config, audience: '' }, verify), false);
  assert.equal(await verifyBusinessAutomationSchedulerToken(undefined, config, verify), false);
  assert.equal(await verifyBusinessAutomationSchedulerToken('Basic token', config, verify), false);
  assert.equal(called, false);
});

test('scheduler token check requires verified exact service identity and issuer', async () => {
  const bearer = 'Bearer signed.token';
  assert.equal(await verifyBusinessAutomationSchedulerToken(bearer, config, async (_token, audience) => {
    assert.equal(audience, config.audience);
    return validClaims;
  }), true);
  for (const payload of [
    { ...validClaims, email: 'other@example.iam.gserviceaccount.com' },
    { ...validClaims, email_verified: false },
    { ...validClaims, iss: 'https://attacker.example' },
  ]) {
    assert.equal(await verifyBusinessAutomationSchedulerToken(bearer, config, async () => payload), false);
  }
  assert.equal(await verifyBusinessAutomationSchedulerToken(bearer, config, async () => { throw new Error('bad signature'); }), false);
});
