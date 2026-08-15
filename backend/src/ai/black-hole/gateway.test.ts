import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BlackHoleExhaustedError,
  BlackHoleRoutingError,
  generateWith,
  type BlackHoleRequest,
  type BlackHoleTrace,
  type GatewayDependencies,
  type ProviderComplete,
} from './gateway.js';
import type { ModelId } from '../models.js';
import type { RuntimeModelCapability } from '../modelCapabilityRegistry.js';

/**
 * The same synthetic registry the router tests use, for the same reason: the real one reads
 * process-wide credential state, and on a machine with no provider keys every candidate is
 * disqualified as unconfigured — every assertion below would pass while checking nothing.
 */
function runtimeModel(id: ModelId, overrides: Partial<RuntimeModelCapability> = {}): RuntimeModelCapability {
  return {
    id,
    provider: 'openrouter',
    apiModel: id,
    configured: true,
    credentialSource: 'platform',
    enabled: true,
    health: {
      modelId: id, status: 'healthy', successes: 10, failures: 0, consecutiveFailures: 0,
      recentFailureRate: 0, validationSuccesses: 10, validationFailures: 0,
      validationSuccessRate: 1, averageLatencyMs: 1_000,
    },
    contextWindow: 200_000,
    maximumSafeRequestTokens: 160_000,
    typicalLatency: 'medium',
    inputUsdPer1M: 1,
    outputUsdPer1M: 5,
    configuredMonthlyBudgetUsd: 10,
    strengths: {
      coding: 8, repository_analysis: 8, architecture: 8, research: 4, review: 8, debugging: 8,
      security_review: 7, ui_generation: 7, structured_output: 8, tool_calls: 8, streaming: 9,
    },
    suitableTaskClasses: [],
    unsuitableTaskClasses: [],
    preferredFallbacks: [],
    supports: { text: true, images: id.startsWith('grok'), structuredOutput: true, toolCalls: true, streaming: true },
    ...overrides,
  };
}

const REGISTRY: RuntimeModelCapability[] = [
  runtimeModel('deepseek_v4_flash', { typicalLatency: 'fast', inputUsdPer1M: 0.1, outputUsdPer1M: 0.4 }),
  runtimeModel('deepseek_v4_pro'),
  runtimeModel('glm_5_2', { provider: 'zhipu' }),
  runtimeModel('kimi_k3', { provider: 'moonshot', typicalLatency: 'slow', inputUsdPer1M: 3, outputUsdPer1M: 15 }),
  runtimeModel('grok_4_5', { provider: 'xai' }),
  runtimeModel('grok_4_3', { provider: 'xai' }),
];

/** Records what the gateway asked of the provider, and answers successfully. */
function recordingProvider(): { complete: ProviderComplete; calls: ModelId[] } {
  const calls: ModelId[] = [];
  const complete: ProviderComplete = async (modelId, messages) => {
    calls.push(modelId);
    return {
      text: 'the answer',
      finishReason: 'stop',
      modelId,
      apiModel: modelId,
      provider: 'test',
      inputTokens: messages.length * 10,
      outputTokens: 20,
      totalTokens: messages.length * 10 + 20,
    };
  };
  return { complete, calls };
}

function deps(complete: ProviderComplete): GatewayDependencies {
  return { complete, registry: REGISTRY, env: {} as NodeJS.ProcessEnv };
}

const baseRequest = (over: Partial<BlackHoleRequest> = {}): BlackHoleRequest => ({
  userId: 'user-1',
  messages: [{ role: 'user', content: 'say that again but shorter' }],
  ...over,
});

// ---------------------------------------------------------------------------
// §30/§31 — the response has nowhere to put a provider identity
// ---------------------------------------------------------------------------

test('the response never carries a model, provider or fallback list', () => {
  // Asserted over the serialized response rather than field by field, so a field added later
  // is caught too. That is the whole reason the forbidden values have no home in the type.
  const provider = recordingProvider();
  return generateWith(deps(provider.complete), baseRequest()).then((response) => {
    const serialized = JSON.stringify(response).toLowerCase();
    for (const forbidden of [
      'kimi', 'moonshot', 'glm', 'zhipu', 'deepseek', 'openrouter', 'grok', 'xai',
      'apimodel', 'selectedmodel', 'fallbackmodels', 'reasoning_content', 'reasoning_details',
    ]) {
      assert.equal(serialized.includes(forbidden), false, `"${forbidden}" leaked into the response`);
    }
    assert.equal(response.text, 'the answer');
  });
});

test('model identity reaches the server-side trace instead', async () => {
  const provider = recordingProvider();
  // Collected into an array rather than a nullable binding: TypeScript narrows a `let` that
  // is only ever assigned inside a callback to `never`, which makes the assertions below
  // unwritable without casts that would weaken them.
  const traces: BlackHoleTrace[] = [];
  await generateWith(deps(provider.complete), baseRequest({ onTrace: (value) => traces.push(value) }));
  assert.equal(traces.length, 1, 'the telemetry sink must receive a trace');
  const [trace] = traces;
  assert.equal(trace.selectedModel, 'deepseek_v4_flash');
  assert.ok(trace.chain.length > 0);
  assert.ok(trace.usage.costUsd >= 0);
  assert.ok(trace.latencyMs >= 0);
});

// ---------------------------------------------------------------------------
// Normalization and authorization
// ---------------------------------------------------------------------------

test('an unattributed request is refused', async () => {
  // Authorization happens above the gateway; what the gateway enforces is that it happened.
  const provider = recordingProvider();
  await assert.rejects(
    generateWith(deps(provider.complete), baseRequest({ userId: '  ' })),
    (error: unknown) => {
      assert.ok(error instanceof BlackHoleRoutingError);
      assert.match(error.message, /authorized user/i);
      return true;
    },
  );
  assert.deepEqual(provider.calls, [], 'no provider call may be made for an unattributed request');
});

test('a request with no messages is refused', async () => {
  const provider = recordingProvider();
  await assert.rejects(
    generateWith(deps(provider.complete), baseRequest({ messages: [] })),
    BlackHoleRoutingError,
  );
});

test('the newest user turn is what gets classified', async () => {
  // Classifying the whole transcript would let an old, unrelated request decide today's route.
  const provider = recordingProvider();
  const traces: BlackHoleTrace[] = [];
  await generateWith(deps(provider.complete), baseRequest({
    messages: [
      { role: 'user', content: 'migrate the entire codebase to a new framework' },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: 'thanks' },
    ],
    onTrace: (value) => traces.push(value),
  }));
  assert.equal(traces[0].family, 'routine');
});

// ---------------------------------------------------------------------------
// §8 — failover walks the chain and stops at its end
// ---------------------------------------------------------------------------

test('a provider failure moves to the next model in the chain', async () => {
  const calls: ModelId[] = [];
  const complete: ProviderComplete = async (modelId, messages) => {
    calls.push(modelId);
    if (calls.length === 1) throw new Error('provider 500');
    return {
      text: 'recovered', finishReason: 'stop', modelId, apiModel: modelId, provider: 'test',
      inputTokens: 10, outputTokens: 5, totalTokens: 15,
    };
  };
  const response = await generateWith(deps(complete), baseRequest());
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0], calls[1]);
  assert.equal(response.text, 'recovered');
  assert.equal(response.intelligence.degraded, true, 'a served-by-fallback reply must say so');
});

test('an exhausted chain fails rather than widening authority', async () => {
  // §8's closing rule, at the point it would actually be violated.
  const attempted: ModelId[] = [];
  const complete: ProviderComplete = async (modelId) => {
    attempted.push(modelId);
    throw new Error('provider down');
  };
  await assert.rejects(
    generateWith(deps(complete), baseRequest({
      messages: [{ role: 'user', content: 'add pagination to the users list' }],
      projectId: 'p-1',
    })),
    (error: unknown) => {
      assert.ok(error instanceof BlackHoleExhaustedError);
      assert.match(error.message, /authority boundary/);
      return true;
    },
  );
  assert.ok(attempted.length > 0);
  assert.equal(attempted.some((id) => id.startsWith('grok')), false, 'failover reached a research model');
});

test('a cancelled request stops immediately rather than walking the chain', async () => {
  // Walking on after cancellation spends budget on work already known to be unwanted.
  const controller = new AbortController();
  const attempted: ModelId[] = [];
  const complete: ProviderComplete = async (modelId) => {
    attempted.push(modelId);
    controller.abort();
    throw new Error('aborted');
  };
  await assert.rejects(
    generateWith(deps(complete), baseRequest({ signal: controller.signal })),
  );
  assert.equal(attempted.length, 1, `walked the chain after abort: ${attempted.join(', ')}`);
});

test('no route at all is reported as a routing error, not an empty answer', async () => {
  const provider = recordingProvider();
  const allDown = REGISTRY.map((model) =>
    runtimeModel(model.id, { health: { ...model.health, status: 'circuit_open' } }),
  );
  await assert.rejects(
    generateWith({ complete: provider.complete, registry: allDown, env: {} as NodeJS.ProcessEnv }, baseRequest()),
    BlackHoleRoutingError,
  );
});

// ---------------------------------------------------------------------------
// §9 wiring — the planned context is what the provider actually receives
// ---------------------------------------------------------------------------

test('planned context reaches the provider, and dropped segments are reported', async () => {
  let received: string = '';
  const complete: ProviderComplete = async (modelId, messages) => {
    received = messages.map((message) => String(message.content)).join('\n');
    return {
      text: 'ok', finishReason: 'stop', modelId, apiModel: modelId, provider: 'test',
      inputTokens: 10, outputTokens: 5, totalTokens: 15,
    };
  };
  const response = await generateWith(deps(complete), baseRequest({
    messages: [{ role: 'user', content: 'explain the router' }],
    projectState: 'MARKER_PROJECT_STATE',
    files: [
      { path: 'small.ts', content: 'MARKER_SMALL', relevance: 0.9 },
      { path: 'huge.ts', content: 'z'.repeat(400_000), relevance: 0.4 },
    ],
    executionBudget: { maxInputTokens: 2_000 },
  }));
  assert.match(received, /MARKER_PROJECT_STATE/);
  assert.match(received, /MARKER_SMALL/);
  assert.equal(received.includes('zzzzzzzzzz'), false, 'the oversized file was sent anyway');
  assert.ok(response.context.droppedSegments > 0, 'the drop must be reported to the caller');
  assert.ok(response.context.usedTokens <= response.context.budgetTokens);
});

test('a system message from the caller is preserved', async () => {
  let roles: string[] = [];
  const complete: ProviderComplete = async (modelId, messages) => {
    roles = messages.map((message) => message.role);
    return {
      text: 'ok', finishReason: 'stop', modelId, apiModel: modelId, provider: 'test',
      inputTokens: 1, outputTokens: 1, totalTokens: 2,
    };
  };
  await generateWith(deps(complete), baseRequest({
    messages: [
      { role: 'system', content: 'you are terse' },
      { role: 'user', content: 'hello' },
    ],
  }));
  assert.equal(roles[0], 'system');
  assert.equal(roles.at(-1), 'user');
});

// ---------------------------------------------------------------------------
// §7 — modes
// ---------------------------------------------------------------------------

test('the mode is echoed and defaults to AUTO', async () => {
  const provider = recordingProvider();
  const auto = await generateWith(deps(provider.complete), baseRequest());
  assert.equal(auto.mode, 'auto');
  const deep = await generateWith(deps(provider.complete), baseRequest({ mode: 'deep' }));
  assert.equal(deep.mode, 'deep');
});

test('a request id is generated when the caller does not supply one', async () => {
  const provider = recordingProvider();
  const generated = await generateWith(deps(provider.complete), baseRequest());
  assert.match(generated.requestId, /^[0-9a-f-]{36}$/);
  const supplied = await generateWith(deps(provider.complete), baseRequest({ requestId: 'req-42' }));
  assert.equal(supplied.requestId, 'req-42');
});
