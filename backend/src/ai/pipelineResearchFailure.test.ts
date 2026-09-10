import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldStopForMissingResearch } from './pipeline.js';
import type { RouteDecision } from './router.js';

const baseRoute: RouteDecision = {
  kind: 'realtime',
  converter: 'deepseek_v4_flash',
  builder: 'glm_5_3_flash',
  useResearch: false,
  reason: 'test route',
  classification: {
    primaryIntent: 'chat',
    intents: ['chat'],
    requiredCapabilities: [],
    requiresCoding: false,
    requiresResearch: false,
    requiresExternalApi: false,
    requiresUserAuthorization: false,
    canRunConcurrently: false,
    reasoning: [],
  },
};

test('requested research fails closed when its evidence provider fails', () => {
  assert.equal(
    shouldStopForMissingResearch({ ...baseRoute, kind: 'research', useResearch: true }, true, 0),
    true,
  );
  assert.equal(
    shouldStopForMissingResearch({ ...baseRoute, useResearch: true }, false, 0),
    true,
  );
});

test('ordinary chat does not fail merely because no web evidence was requested', () => {
  assert.equal(shouldStopForMissingResearch(baseRoute, false, 0), false);
  assert.equal(shouldStopForMissingResearch(baseRoute, true, 0), false);
});

test('research proceeds when cited evidence is available', () => {
  assert.equal(
    shouldStopForMissingResearch({ ...baseRoute, kind: 'research', useResearch: true }, false, 2),
    false,
  );
});
