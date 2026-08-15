import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AgentBudgetError,
  assertAgentBudget,
  runAgent,
  type AgentBudget,
  type AgentStepResult,
} from './agentRuntime.js';

const budget = (over: Partial<AgentBudget> = {}): AgentBudget => ({
  maxSteps: 10,
  maxToolCalls: 20,
  deadlineAt: Date.now() + 60_000,
  maxEstimatedCostUsd: 1,
  ...over,
});

const step = (over: Partial<AgentStepResult> = {}): AgentStepResult => ({
  phase: 'act',
  summary: 'did a thing',
  ...over,
});

// ---------------------------------------------------------------------------
// §19 — every run has all five controls
// ---------------------------------------------------------------------------

test('a run without a valid budget is refused before it starts', () => {
  // A silently defaulted deadline is how a run ends up with no effective limit at all.
  for (const bad of [
    { maxSteps: 0 },
    { maxToolCalls: -1 },
    { deadlineAt: Date.now() - 1 },
    { maxEstimatedCostUsd: 0 },
  ]) {
    assert.throws(() => assertAgentBudget(budget(bad)), AgentBudgetError, JSON.stringify(bad));
  }
});

test('a valid budget passes', () => {
  assert.doesNotThrow(() => assertAgentBudget(budget()));
});

test('the loop stops at the step ceiling and does not call it success', () => {
  // §22: do not mark generation alone as success.
  return runAgent({
    budget: budget({ maxSteps: 3 }),
    step: async () => step(),
  }).then((outcome) => {
    assert.equal(outcome.status, 'max_steps');
    assert.equal(outcome.steps.length, 3);
    assert.match(outcome.explanation, /not a success/);
  });
});

test('the tool call budget ends the run', async () => {
  const outcome = await runAgent({
    budget: budget({ maxToolCalls: 5 }),
    step: async () => step({ toolCalls: 3 }),
  });
  assert.equal(outcome.status, 'max_tool_calls');
  assert.ok(outcome.toolCallsUsed >= 5);
});

test('the cost budget ends the run', async () => {
  const outcome = await runAgent({
    budget: budget({ maxEstimatedCostUsd: 0.1 }),
    step: async () => step({ estimatedCostUsd: 0.04 }),
  });
  assert.equal(outcome.status, 'max_cost');
  assert.match(outcome.explanation, /cost budget/);
});

test('the deadline ends the run', async () => {
  let now = 1_000;
  const outcome = await runAgent({
    budget: budget({ deadlineAt: 1_500 }),
    now: () => now,
    step: async () => { now += 200; return step(); },
  });
  assert.equal(outcome.status, 'deadline');
});

test('cancellation ends the run, whether observed or thrown', async () => {
  const observed = new AbortController();
  const byFlag = await runAgent({
    budget: budget(),
    signal: observed.signal,
    step: async () => { observed.abort(); return step(); },
  });
  assert.equal(byFlag.status, 'cancelled');

  // A cancellation surfacing as a thrown error is still a cancellation, not a failure.
  const thrown = new AbortController();
  const byThrow = await runAgent({
    budget: budget(),
    signal: thrown.signal,
    step: async () => { thrown.abort(); throw new Error('aborted'); },
  });
  assert.equal(byThrow.status, 'cancelled');
});

test('every limit is checked before any work is done', async () => {
  // An exhausted budget must cost nothing further.
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const outcome = await runAgent({
    budget: budget(),
    signal: controller.signal,
    step: async () => { calls += 1; return step(); },
  });
  assert.equal(calls, 0);
  assert.equal(outcome.status, 'cancelled');
});

// ---------------------------------------------------------------------------
// Termination that does not depend on the model cooperating
// ---------------------------------------------------------------------------

test('completion is reported when a step says it is done', async () => {
  const outcome = await runAgent({
    budget: budget(),
    step: async ({ index }) => step({ done: index === 1, phase: 'complete' }),
  });
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.steps.length, 2);
});

test('two consecutive steps with no progress end the run early', async () => {
  // The shape of a model looping on itself. Waiting for the step ceiling spends the whole
  // budget confirming it.
  const outcome = await runAgent({
    budget: budget({ maxSteps: 50 }),
    step: async () => step({ madeProgress: false }),
  });
  assert.equal(outcome.status, 'no_progress');
  assert.equal(outcome.steps.length, 2);
});

test('progress resets the no-progress counter', async () => {
  const pattern = [false, true, false, true, false];
  const outcome = await runAgent({
    budget: budget({ maxSteps: 5 }),
    step: async ({ index }) => step({ madeProgress: pattern[index] }),
  });
  assert.equal(outcome.status, 'max_steps');
  assert.equal(outcome.steps.length, 5);
});

test('an absurd maxSteps cannot create an unbounded loop', async () => {
  // The loop is bounded independently of the caller's number.
  let calls = 0;
  const outcome = await runAgent({
    budget: budget({ maxSteps: 10_000_000, maxToolCalls: 0, maxEstimatedCostUsd: 1_000_000 }),
    step: async () => { calls += 1; return step(); },
  });
  assert.equal(outcome.status, 'max_steps');
  assert.ok(calls <= 200, `ran ${calls} steps`);
});

test('a failing step is reported as failed rather than completed', async () => {
  const outcome = await runAgent({
    budget: budget(),
    step: async () => { throw new Error('tool exploded'); },
  });
  assert.equal(outcome.status, 'failed');
  assert.match(outcome.explanation, /tool exploded/);
});

test('a step sees what remains of every budget', async () => {
  const seen: number[] = [];
  await runAgent({
    budget: budget({ maxSteps: 3, maxToolCalls: 9 }),
    step: async ({ remaining }) => { seen.push(remaining.toolCalls); return step({ toolCalls: 3 }); },
  });
  assert.deepEqual(seen, [9, 6, 3]);
});
