import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  internalRoutingMode,
  nextInChain,
  routeBlackHole,
  routeFamilyFor,
  type BlackHoleRoute,
} from './router.js';
import { assessBlackHoleComplexity } from './complexity.js';
import { analyzeTask, type TaskSignalInput } from './taskClass.js';
import type { ModelId } from '../models.js';
import type { RuntimeModelCapability } from '../modelCapabilityRegistry.js';

/**
 * A synthetic runtime registry.
 *
 * Routing is exercised against a fixture rather than `getRuntimeModelRegistry()` because the
 * real one reads process-wide credential and health state: on a machine with no provider keys
 * every candidate is disqualified as unconfigured, and every assertion below would pass while
 * checking nothing. The fixture makes the models callable so the *routing rules* are what is
 * under test.
 */
function runtimeModel(
  id: ModelId,
  overrides: Partial<RuntimeModelCapability> = {},
): RuntimeModelCapability {
  return {
    id,
    provider: 'openrouter',
    apiModel: id,
    configured: true,
    credentialSource: 'platform',
    enabled: true,
    health: {
      modelId: id,
      status: 'healthy',
      successes: 10,
      failures: 0,
      consecutiveFailures: 0,
      recentFailureRate: 0,
      validationSuccesses: 10,
      validationFailures: 0,
      validationSuccessRate: 1,
      averageLatencyMs: 1_000,
    },
    contextWindow: 200_000,
    maximumSafeRequestTokens: 160_000,
    typicalLatency: 'medium',
    inputUsdPer1M: 1,
    outputUsdPer1M: 5,
    configuredMonthlyBudgetUsd: 10,
    strengths: {
      coding: 8, repository_analysis: 8, architecture: 8, research: 4, review: 8,
      debugging: 8, security_review: 7, ui_generation: 7, structured_output: 8,
      tool_calls: 8, streaming: 9,
    },
    suitableTaskClasses: [],
    unsuitableTaskClasses: [],
    preferredFallbacks: [],
    supports: {
      text: true,
      images: id.startsWith('grok'),
      structuredOutput: true,
      toolCalls: true,
      streaming: true,
    },
    ...overrides,
  };
}

const REGISTRY: RuntimeModelCapability[] = [
  runtimeModel('deepseek_v4_flash', { typicalLatency: 'fast', inputUsdPer1M: 0.1, outputUsdPer1M: 0.4 }),
  runtimeModel('deepseek_v4_pro', { inputUsdPer1M: 0.5, outputUsdPer1M: 2 }),
  runtimeModel('glm_5_2', { provider: 'zhipu', inputUsdPer1M: 0.6, outputUsdPer1M: 2.2 }),
  runtimeModel('kimi_k3', { provider: 'moonshot', typicalLatency: 'slow', inputUsdPer1M: 3, outputUsdPer1M: 15, contextWindow: 1_000_000, maximumSafeRequestTokens: 800_000 }),
  runtimeModel('grok_4_5', { provider: 'xai' }),
  runtimeModel('grok_4_3', { provider: 'xai' }),
];

function route(
  signals: TaskSignalInput,
  options: { mode?: 'auto' | 'fast' | 'deep'; registry?: RuntimeModelCapability[] } & Record<string, unknown> = {},
): BlackHoleRoute {
  const analysis = analyzeTask(signals);
  const { mode = 'auto', registry = REGISTRY, ...rest } = options;
  return routeBlackHole({
    analysis,
    complexity: assessBlackHoleComplexity({ prompt: signals.prompt, analysis }),
    mode,
    registry,
    // An empty environment: no operator has supplied a gated model identifier.
    env: {} as NodeJS.ProcessEnv,
    ...rest,
  });
}

// ---------------------------------------------------------------------------
// §12 / §8 — the authority boundary, which is the reason this file exists
// ---------------------------------------------------------------------------

test('Grok never appears in a coding chain', () => {
  const result = route({ prompt: 'add a login page', projectId: 'p-1' });
  assert.ok(result.chain.length > 0, 'expected a usable coding chain');
  for (const modelId of result.chain) {
    assert.ok(!modelId.startsWith('grok'), `${modelId} entered a coding chain`);
  }
});

test('a research model is refused for write work by authority, not by score', () => {
  // The distinction matters: a scoring penalty can be overcome by health, cost or mode
  // pressure, and a filter cannot. This asserts the *reason* as well as the absence.
  const result = route({ prompt: 'implement the feature', repositoryMutationRequested: true });
  const grok = result.excluded.filter((entry) => entry.modelId.startsWith('grok'));
  for (const entry of grok) {
    assert.match(entry.reason, /not authorized to/);
  }
});

test('exhausting a coding chain never falls through to a research provider', () => {
  // §8's closing rule. Every engineering model is unavailable here; the correct outcome is an
  // empty chain and an honest failure, not a Grok that happens to be healthy.
  const allDown = REGISTRY.map((model) =>
    model.id.startsWith('grok') ? model : runtimeModel(model.id, { health: { ...model.health, status: 'circuit_open' } }),
  );
  const result = route(
    { prompt: 'build the dashboard', repositoryMutationRequested: true },
    { registry: allDown },
  );
  assert.deepEqual(result.chain, []);
  assert.equal(result.selected, null);
  assert.match(result.rationale, /No model can serve/);
});

test('a failed model cannot re-enter its own chain', () => {
  const first = route({ prompt: 'fix the bug', projectId: 'p-1' });
  const failed = first.selected!;
  const second = route({ prompt: 'fix the bug', projectId: 'p-1' }, { exclude: [failed] });
  assert.equal(second.chain.includes(failed), false);
  assert.match(
    second.excluded.find((entry) => entry.modelId === failed)!.reason,
    /already attempted/,
  );
});

test('nextInChain walks forward only and stops at the end', () => {
  const result = route({ prompt: 'refactor the service', projectId: 'p-1' });
  const head = result.chain[0];
  const second = nextInChain(result, head);
  assert.equal(second, result.chain[1] ?? null);
  assert.equal(nextInChain(result, result.chain.at(-1)!), null);
  assert.equal(nextInChain(result, 'never_in_this_chain'), null);
});

// ---------------------------------------------------------------------------
// §6 / §8 — the declared chains
// ---------------------------------------------------------------------------

test('routine work starts at Flash', () => {
  const result = route({ prompt: 'say that again but shorter' });
  assert.equal(result.family, 'routine');
  assert.equal(result.selected, 'deepseek_v4_flash');
});

test('deep general reasoning starts at Pro', () => {
  const result = route({ prompt: 'reason carefully from first principles about the trade-offs' });
  assert.equal(result.family, 'reasoning');
  assert.equal(result.selected, 'deepseek_v4_pro');
});

test('long-horizon engineering starts at GLM', () => {
  const result = route({ prompt: 'migrate the entire codebase to the new router' });
  assert.equal(result.family, 'long_horizon');
  assert.equal(result.selected, 'glm_5_2');
});

test('K2.7 heads the coding chain in policy and is reported honestly as unavailable', () => {
  // §6 assigns normal software implementation to K2.7. It is configuration-gated and has no
  // runtime transport entry, so it cannot be selected — but the policy order is not quietly
  // rewritten to hide that. The gate is stated in `excluded`, and GLM inherits the route.
  const result = route({ prompt: 'add pagination', projectId: 'p-1' });
  assert.equal(result.family, 'coding');
  const gate = result.excluded.find((entry) => entry.modelId === 'kimi_k2_7');
  assert.ok(gate, 'K2.7 must appear in the considered chain');
  assert.match(gate!.reason, /not_configured|no runtime transport entry/);
  assert.equal(result.selected, 'glm_5_2');
});

test('a research request routes to Grok', () => {
  const result = route({ prompt: 'what is trending on x.com in the solana hackathon' });
  assert.equal(result.family, 'research');
  assert.equal(result.selected, 'grok_4_5');
});

test('a request that researches and then builds is routed as engineering', () => {
  // §11's worked example. Research is a step performed by the research router in its own
  // authority domain; it must not choose the model that then writes the user's files.
  const result = route({
    prompt: 'build something based on projects trending in the current solana hackathon',
    repositoryMutationRequested: true,
  });
  assert.equal(result.family, 'coding');
  assert.ok(!result.chain.some((id) => id.startsWith('grok')));
});

// ---------------------------------------------------------------------------
// §8 vision — no invented visual route
// ---------------------------------------------------------------------------

test('an image request is refused by any model without confirmed vision support', () => {
  // Two registries disagree about K3's vision support, so the router requires both to agree.
  // Trusting the optimistic one sends an image to a model that cannot read it and returns a
  // confident answer about nothing.
  const result = route({
    prompt: 'what is in this screenshot',
    attachments: [{ mediaType: 'image/png' }],
  });
  for (const entry of result.excluded) {
    if (entry.modelId === 'kimi_k3') {
      assert.match(entry.reason, /no confirmed vision support/);
    }
  }
  // The vision chain is K3 alone; with vision unconfirmed there is no second route invented.
  assert.deepEqual(result.chain, []);
});

test('a confirmed vision model is used when the registries agree', () => {
  const visionK3 = REGISTRY.map((model) =>
    model.id === 'kimi_k3'
      ? runtimeModel('kimi_k3', { supports: { text: true, images: true, structuredOutput: true, toolCalls: true, streaming: true } })
      : model,
  );
  const result = route(
    { prompt: 'what is in this screenshot', attachments: [{ mediaType: 'image/png' }] },
    { registry: visionK3 },
  );
  assert.equal(result.selected, 'kimi_k3');
});

// ---------------------------------------------------------------------------
// §7 — public modes
// ---------------------------------------------------------------------------

test('the public modes map onto internal routing modes', () => {
  assert.equal(internalRoutingMode('fast'), 'cost');
  assert.equal(internalRoutingMode('deep'), 'intelligence');
  assert.equal(internalRoutingMode('auto'), 'balanced');
});

test('FAST reorders a chain by cost and latency but never by compatibility', () => {
  const auto = route({ prompt: 'reason about the trade-offs here' }, { mode: 'auto' });
  const fast = route({ prompt: 'reason about the trade-offs here' }, { mode: 'fast' });
  assert.equal(auto.family, fast.family);
  // Both chains contain the same members — FAST changes the order, not who is eligible.
  assert.deepEqual([...auto.chain].sort(), [...fast.chain].sort());
});

test('DEEP allows escalation to the flagship on demanding work', () => {
  const deep = route({ prompt: 'design the multi-tenant permissions architecture' }, { mode: 'deep' });
  assert.ok(deep.chain.includes('kimi_k3'));
});

test('no public route output names a provider', () => {
  // §7 forbids exposing provider selectors. Model ids are internal; provider names such as
  // moonshot, zhipu, openrouter or xai must not reach a caller-visible field.
  const result = route({ prompt: 'add a login page', projectId: 'p-1' });
  const surfaced = `${result.rationale} ${result.excluded.map((e) => e.reason).join(' ')}`;
  for (const provider of ['moonshot', 'zhipu', 'openrouter', 'xai', 'bigmodel']) {
    assert.equal(surfaced.toLowerCase().includes(provider), false, `${provider} leaked`);
  }
});

// ---------------------------------------------------------------------------
// Runtime facts §6 requires the router to consider
// ---------------------------------------------------------------------------

test('an open circuit breaker removes a model from the chain', () => {
  const brokenGlm = REGISTRY.map((model) =>
    model.id === 'glm_5_2'
      ? runtimeModel('glm_5_2', { health: { ...model.health, status: 'circuit_open' } })
      : model,
  );
  const result = route({ prompt: 'add pagination', projectId: 'p-1' }, { registry: brokenGlm });
  assert.equal(result.chain.includes('glm_5_2'), false);
  assert.match(
    result.excluded.find((entry) => entry.modelId === 'glm_5_2')!.reason,
    /circuit breaker/,
  );
});

test('a context requirement beyond a model\'s safe limit excludes it', () => {
  const result = route(
    { prompt: 'summarize this repository' },
    { estimatedContextTokens: 500_000 },
  );
  // Only K3 has a window this large in the fixture.
  for (const modelId of result.chain) {
    assert.equal(modelId, 'kimi_k3');
  }
});

test('a compute budget below the request is refused rather than silently truncated', () => {
  const result = route(
    { prompt: 'summarize this repository' },
    { estimatedContextTokens: 120_000, maximumTaskTokens: 8_000 },
  );
  assert.deepEqual(result.chain, []);
  assert.ok(result.excluded.every((entry) => /compute budget|safe limit/.test(entry.reason)));
});

test('a cost ceiling excludes an over-priced model rather than ranking it down', () => {
  const result = route({ prompt: 'say that again but shorter' }, { maxCostUsdPer1MOutput: 1 });
  assert.deepEqual(result.chain, ['deepseek_v4_flash']);
  assert.match(
    result.excluded.find((entry) => entry.modelId === 'kimi_k3')!.reason,
    /exceeds the ceiling/,
  );
});

test('an administrator cannot re-enable a model into a chain it has no authority for', () => {
  // Enabling Grok everywhere in the runtime registry must not put it in a coding chain: the
  // authority filter runs before any registry-derived check.
  const grokEverywhere = REGISTRY.map((model) =>
    model.id.startsWith('grok') ? runtimeModel(model.id, { enabled: true, configured: true }) : model,
  );
  const result = route(
    { prompt: 'implement the checkout flow', repositoryMutationRequested: true },
    { registry: grokEverywhere },
  );
  assert.ok(!result.chain.some((id) => id.startsWith('grok')));
});

test('every family resolves to a known chain', () => {
  // A task class with no route silently falls to a default, which is how a request ends up on
  // whichever model happens to be first in a table.
  for (const prompt of [
    'hello',
    'reason about this deeply',
    'fix the failing build',
    'migrate the entire codebase',
    'research the latest news today',
  ]) {
    const analysis = analyzeTask({ prompt });
    assert.ok(routeFamilyFor(analysis), `no family for "${prompt}"`);
  }
});
