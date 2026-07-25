import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalModelQuality, loadRoutingOutcomes, resetRoutingOutcomeCache } from './routingOutcomes.js';

test('routing outcomes reload after restart and affect task-specific quality', async () => {
  resetRoutingOutcomeCache();
  await loadRoutingOutcomes(async () => Array.from({ length: 3 }, (_, index) => ({
    runId: `run-${index}`, userId: 'user', taskClass: 'code_generation' as const, modelId: 'deepseek_v4_pro' as const,
    mode: 'balanced' as const, inputTokens: 10, outputTokens: 10, patchApplied: true, typecheckOk: true,
    buildOk: true, reviewOk: true, repairLoops: 0, modelSwitches: 0, createdAt: new Date().toISOString(),
  })));
  assert.ok((historicalModelQuality({ modelId: 'deepseek_v4_pro', taskClass: 'code_generation' }) ?? 0) > 0.9);
  assert.equal(historicalModelQuality({ modelId: 'deepseek_v4_pro', taskClass: 'security_review' }), null);
});
