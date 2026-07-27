import assert from 'node:assert/strict';
import test from 'node:test';
import { activationSatisfied, deterministicVariant, experimentResult, normalizedMessageState, recommendationDecision, redactGrowthPayload, validateEventName } from './growthEngine.js';

test('canonical events are versioned and unknown or malformed events are rejected', () => {
  assert.equal(validateEventName('activation.completed.v1'), true);
  assert.equal(validateEventName('activation.completed'), false);
  assert.equal(validateEventName('fake.success.v1'), false);
});

test('secret-like fields and values are redacted recursively', () => {
  assert.deepEqual(redactGrowthPayload({ ok: 'value', nested: { apiKey: 'private', note: 'Bearer abc.def' } }), { ok: 'value', nested: { apiKey: '[REDACTED]', note: '[REDACTED]' } });
});

test('activation requires meaningful events and verified deployment', () => {
  const required = ['product.generated.v1', 'product.deployment_verified.v1'];
  assert.equal(activationSatisfied(required, required, false), false);
  assert.equal(activationSatisfied(required, ['product.generated.v1'], true), false);
  assert.equal(activationSatisfied(required, required, true), true);
});

test('experiment assignment is deterministic and insufficient data has no winner', () => {
  const input = { experimentId: 'e1', subjectKey: 'u1', seed: 'safe', variants: [{ key: 'a', weight: 1 }, { key: 'b', weight: 1 }] };
  assert.equal(deterministicVariant(input), deterministicVariant(input));
  assert.deepEqual(experimentResult({ assignmentCount: 4, minimumSampleSize: 10, outcomeCounts: { a: 4, b: 0 } }), { status: 'insufficient_data', winner: null });
});

test('operational blockers override growth and provider acceptance is not delivery', () => {
  assert.deepEqual(recommendationDecision({ criticalIncident: true, deploymentVerified: true, activated: true, consent: true, suppressed: false }), { type: 'prepare_operational_repair', status: 'blocked', priority: 100, blocker: 'critical_incident' });
  assert.equal(normalizedMessageState('accepted'), 'provider_accepted');
  assert.notEqual(normalizedMessageState('accepted'), 'delivered');
});
