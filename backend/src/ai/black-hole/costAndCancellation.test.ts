import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BlackHoleCancelledError,
  generateWith,
  type BlackHoleRequest,
  type GatewayDependencies,
  type ProviderComplete,
} from './gateway.js';
import { routeBlackHole } from './router.js';
import { analyzeTask } from './taskClass.js';
import { assessBlackHoleComplexity } from './complexity.js';
import type { ModelId } from '../models.js';
import type { RuntimeModelCapability } from '../modelCapabilityRegistry.js';

function runtimeModel(id: ModelId, over: Partial<RuntimeModelCapability> = {}): RuntimeModelCapability {
  return {
    id, provider: 'openrouter', apiModel: id, configured: true, credentialSource: 'platform',
    enabled: true,
    health: {
      modelId: id, status: 'healthy', successes: 10, failures: 0, consecutiveFailures: 0,
      recentFailureRate: 0, validationSuccesses: 10, validationFailures: 0,
      validationSuccessRate: 1, averageLatencyMs: 1_000,
    },
    contextWindow: 200_000, maximumSafeRequestTokens: 160_000, typicalLatency: 'medium',
    inputUsdPer1M: 1, outputUsdPer1M: 5, configuredMonthlyBudgetUsd: 10,
    strengths: {
      coding: 8, repository_analysis: 8, architecture: 8, research: 4, review: 8, debugging: 8,
      security_review: 7, ui_generation: 7, structured_output: 8, tool_calls: 8, streaming: 9,
    },
    suitableTaskClasses: [], unsuitableTaskClasses: [], preferredFallbacks: [],
    supports: { text: true, images: id.startsWith('grok'), structuredOutput: true, toolCalls: true, streaming: true },
    ...over,
  };
}

const REGISTRY: RuntimeModelCapability[] = [
  runtimeModel('deepseek_v4_flash', { typicalLatency: 'fast', inputUsdPer1M: 0.1, outputUsdPer1M: 0.4 }),
  runtimeModel('deepseek_v4_pro', { inputUsdPer1M: 0.5, outputUsdPer1M: 2 }),
  runtimeModel('glm_5_2', { provider: 'zhipu', inputUsdPer1M: 0.6, outputUsdPer1M: 2.2 }),
  runtimeModel('kimi_k3', { provider: 'moonshot', typicalLatency: 'slow', inputUsdPer1M: 3, outputUsdPer1M: 15 }),
  runtimeModel('grok_4_5', { provider: 'xai' }),
];

const route = (prompt: string, extra: Record<string, unknown> = {}) => {
  const analysis = analyzeTask({ prompt, ...(extra as object) });
  return routeBlackHole({
    analysis,
    complexity: assessBlackHoleComplexity({ prompt, analysis }),
    mode: 'auto',
    registry: REGISTRY,
    env: {} as NodeJS.ProcessEnv,
    ...(extra as object),
  });
};

// ---------------------------------------------------------------------------
// Item 12 — cost reorders, never overrides
// ---------------------------------------------------------------------------

test('a cost ceiling excludes an over-priced model rather than ranking it down', () => {
  const result = route('say that again but shorter', { maxCostUsdPer1MOutput: 1 });
  assert.deepEqual(result.chain, ['deepseek_v4_flash']);
});

test('cost never overrides an authority requirement', () => {
  // Grok is the cheapest configured model in some fixtures; it must still never appear in a
  // chain that needs write authority, at any price ceiling.
  const result = route('implement the checkout flow', {
    repositoryMutationRequested: true,
    maxCostUsdPer1MOutput: 1_000,
  });
  assert.equal(result.chain.some((id) => id.startsWith('grok')), false);
});

test('cost never overrides a capability requirement', () => {
  // An image request must not be answered by a cheaper model that cannot read images.
  const result = route('what is in this screenshot', {
    attachments: [{ mediaType: 'image/png' }],
    maxCostUsdPer1MOutput: 1_000,
  });
  for (const id of result.chain) {
    const runtime = REGISTRY.find((entry) => entry.id === id)!;
    assert.equal(runtime.supports.images, true, `${id} cannot read an image`);
  }
});

test('an impossible budget yields no route rather than a cheap wrong one', () => {
  const result = route('summarize this repository', {
    estimatedContextTokens: 120_000,
    maximumTaskTokens: 8_000,
  });
  assert.deepEqual(result.chain, []);
});

test('FAST reorders by cost among compatible models only', () => {
  const analysis = analyzeTask({ prompt: 'reason about the trade-offs here' });
  const complexity = assessBlackHoleComplexity({ prompt: 'reason about the trade-offs here', analysis });
  const fast = routeBlackHole({ analysis, complexity, mode: 'fast', registry: REGISTRY, env: {} as NodeJS.ProcessEnv });
  const auto = routeBlackHole({ analysis, complexity, mode: 'auto', registry: REGISTRY, env: {} as NodeJS.ProcessEnv });
  assert.deepEqual([...fast.chain].sort(), [...auto.chain].sort(), 'eligibility must not change');
});

// ---------------------------------------------------------------------------
// Item 11 — cancellation stops spending
// ---------------------------------------------------------------------------

function deps(complete: ProviderComplete): GatewayDependencies {
  return { complete, registry: REGISTRY, env: {} as NodeJS.ProcessEnv };
}

const request = (over: Partial<BlackHoleRequest> = {}): BlackHoleRequest => ({
  userId: 'user-1',
  messages: [{ role: 'user', content: 'say that again but shorter' }],
  ...over,
});

test('a request cancelled before it starts makes no provider call at all', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const complete: ProviderComplete = async () => {
    calls += 1;
    throw new Error('should not be reached');
  };
  await assert.rejects(
    generateWith(deps(complete), request({ signal: controller.signal })),
    BlackHoleCancelledError,
  );
  assert.equal(calls, 0, 'a cancelled request must not spend anything');
});

test('cancellation mid-chain stops further model spending', async () => {
  // The failure mode this prevents: a user presses Stop, the current model errors, and the
  // gateway helpfully tries two more models on their behalf.
  const controller = new AbortController();
  const attempted: string[] = [];
  const complete: ProviderComplete = async ({ modelId }) => {
    attempted.push(modelId);
    controller.abort();
    throw new Error('provider error after cancel');
  };
  await assert.rejects(generateWith(deps(complete), request({ signal: controller.signal })));
  assert.equal(attempted.length, 1, `walked the chain after cancellation: ${attempted.join(', ')}`);
});

test('the abort signal reaches the provider adapter', async () => {
  // Propagation matters as much as the checks: without it an in-flight HTTP request keeps
  // running and keeps being billed after the user has stopped caring about the answer.
  const controller = new AbortController();
  const seen: (AbortSignal | undefined)[] = [];
  const complete: ProviderComplete = async ({ signal, modelId }) => {
    seen.push(signal);
    return {
      text: 'ok', finishReason: 'stop', modelId, apiModel: modelId, provider: 'test',
      inputTokens: 1, outputTokens: 1, totalTokens: 2,
    };
  };
  await generateWith(deps(complete), request({ signal: controller.signal }));
  assert.equal(seen[0], controller.signal, 'the caller signal must be forwarded, not replaced');
});

test('an uncancelled request completes normally', async () => {
  const complete: ProviderComplete = async ({ modelId }) => ({
    text: 'done', finishReason: 'stop', modelId, apiModel: modelId, provider: 'test',
    inputTokens: 1, outputTokens: 1, totalTokens: 2,
  });
  const response = await generateWith(deps(complete), request());
  assert.equal(response.text, 'done');
});
