import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PostCompletionAccountingError } from './postCompletionAccounting.js';
import { executeWithProviderFallback } from './providerRuntime.js';
import { executeHedgedPlannerFallback, resolveStructuredGoalContract } from './universal/semanticRequestPlanner.js';

test('provider fallback preserves post-completion accounting uncertainty without another attempt', async () => {
  const failure = new PostCompletionAccountingError(); let calls = 0;
  await assert.rejects(executeWithProviderFallback({ routes: ['kimi_k3', 'glm_5_3'], maximumAttemptsPerRoute: 3,
    recordHealth: false, execute: async () => { calls++; throw failure; } }), error => error === failure);
  assert.equal(calls, 1);
});

test('semantic planner does not repair or start a fallback for completed-provider accounting failure', async () => {
  const failure = new PostCompletionAccountingError(); let calls = 0;
  await assert.rejects(executeHedgedPlannerFallback({ routes: ['kimi_k3', 'glm_5_3'], signal: new AbortController().signal,
    routeTimeoutMs: 1000, hedgeDelayMs: 100,
    execute: () => resolveStructuredGoalContract(async () => { calls++; throw failure; }, 2),
  }), error => error === failure);
  assert.equal(calls, 1);
});

test('an already-started hedge is aborted when accounting becomes uncertain', async () => {
  const failure = new PostCompletionAccountingError(); let calls = 0, aborted = false;
  let release: (() => void) | undefined;
  const bothStarted = new Promise<void>(resolve => { release = resolve; });
  await assert.rejects(executeHedgedPlannerFallback({ routes: ['kimi_k3', 'glm_5_3'], signal: new AbortController().signal,
    routeTimeoutMs: 1000, hedgeDelayMs: 1,
    execute: async (model, signal) => {
      calls++;
      if (model === 'kimi_k3') { await bothStarted; throw failure; }
      release!();
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); }, { once: true }));
    },
  }), error => error === failure);
  assert.equal(calls, 2); assert.equal(aborted, true);
});
