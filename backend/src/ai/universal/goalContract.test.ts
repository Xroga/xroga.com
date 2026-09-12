import assert from 'node:assert/strict';
import test from 'node:test';
import { goalContractSchema, normalizeGoalContractCandidate } from './goalContract.js';

const base = {
  version: '1.0',
  goal: 'Determine the newest supported protocol behavior from authoritative evidence.',
  desiredOutcome: 'A current evidence-backed answer.',
  semanticIntent: 'INVESTIGATE',
  requiredCapabilities: ['research.public-web', 'conversation.respond'],
  confidence: 0.91,
};

test('old persisted contracts receive safe freshness and release defaults', () => {
  const value = goalContractSchema.parse(base);
  assert.equal(value.freshnessRequirement, 'NONE');
  assert.equal(value.previewRequirement, 'NONE');
  assert.equal(value.deploymentRequirement, 'NONE');
  assert.deepEqual(value.sourcePolicy, { mode: 'any', scope: 'public_web', officialDomains: [] });
});

test('current evidence, Preview, and deployment are independent contract requirements', () => {
  const value = goalContractSchema.parse({
    ...base,
    freshnessRequirement: 'CURRENT_REQUIRED',
    sourcePolicy: { mode: 'official_only', scope: 'public_web', officialDomains: ['standards.example'] },
    previewRequirement: 'REQUIRED',
    deploymentRequirement: 'NONE',
  });
  assert.equal(value.freshnessRequirement, 'CURRENT_REQUIRED');
  assert.equal(value.previewRequirement, 'REQUIRED');
  assert.equal(value.deploymentRequirement, 'NONE');
});

test('normalization removes commentary but does not coerce invalid semantics', () => {
  const normalized = normalizeGoalContractCandidate({ ...base, commentary: 'ignore me', semanticIntent: 'LOOK_AROUND' });
  const parsed = goalContractSchema.safeParse(normalized);
  assert.equal(parsed.success, false);
  assert.equal('commentary' in (normalized as Record<string, unknown>), false);
});
