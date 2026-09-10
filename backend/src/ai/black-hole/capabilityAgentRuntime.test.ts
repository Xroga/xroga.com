import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runCapabilityAgent, type CapabilityTool } from './agentRuntime.js';

const budget = () => ({ maxSteps: 5, maxToolCalls: 3, deadlineAt: Date.now() + 10_000, maxEstimatedCostUsd: 1 });
const tool: CapabilityTool = {
  id: 'synthetic.echo', requiredAuthorities: ['synthetic:run'], estimateMicroUsd: () => 100,
  validateInput: (v) => typeof v === 'string', execute: async (v) => ({ value: v }),
  validateOutput: (v) => Boolean(v && typeof v === 'object'),
};

test('capability agent executes several model-directed rounds through the bounded runtime', async () => {
  const settlements: number[] = [];
  const result = await runCapabilityAgent({ budget: budget(), tools: [tool], authorities: new Set(['synthetic:run']),
    reserveCost: async () => ({ settle: async (v) => { settlements.push(v); }, release: async () => undefined }),
    turn: async ({ index, observations }) => index === 0
      ? { summary: 'inspect', toolCalls: [{ id: 'one', capabilityId: 'synthetic.echo', input: 'value' }] }
      : { summary: 'complete', final: { observations: observations.length } },
    validateFinal: (v) => Boolean(v && typeof v === 'object'),
  });
  assert.equal(result.status, 'completed');
  assert.equal(result.observations.length, 1);
  assert.deepEqual(settlements, [100]);
});

test('capability agent rejects guessed tools and missing independent authority', async () => {
  const common = { budget: budget(), tools: [tool], reserveCost: async () => ({ settle: async () => undefined, release: async () => undefined }), validateFinal: () => true };
  const guessed = await runCapabilityAgent({ ...common, authorities: new Set(['synthetic:run']), turn: async () => ({ summary: 'guess', toolCalls: [{ id: 'x', capabilityId: 'synthetic.guessed', input: 'x' }] }) });
  assert.equal(guessed.status, 'failed');
  assert.match(guessed.explanation, /not exposed/);
  const unauthorized = await runCapabilityAgent({ ...common, authorities: new Set(), turn: async () => ({ summary: 'try', toolCalls: [{ id: 'x', capabilityId: tool.id, input: 'x' }] }) });
  assert.equal(unauthorized.status, 'failed');
  assert.match(unauthorized.explanation, /requires authority/);
});

test('invalid final output is never reported as completed', async () => {
  const result = await runCapabilityAgent({ budget: budget(), tools: [], authorities: new Set(), reserveCost: async () => ({ settle: async () => undefined, release: async () => undefined }), turn: async () => ({ summary: 'done', final: 'unchecked' }), validateFinal: () => false });
  assert.equal(result.status, 'failed');
  assert.equal(result.final, null);
});

test('a model cannot batch past tool-call or cost limits', async () => {
  const reserveCost = async () => ({ settle: async () => undefined, release: async () => undefined });
  const tooMany = await runCapabilityAgent({ budget: { ...budget(), maxToolCalls: 1 }, tools: [tool], authorities: new Set(['synthetic:run']), reserveCost, turn: async () => ({ summary: 'batch', toolCalls: [{ id: '1', capabilityId: tool.id, input: 'a' }, { id: '2', capabilityId: tool.id, input: 'b' }] }), validateFinal: () => true });
  assert.equal(tooMany.status, 'failed');
  assert.match(tooMany.explanation, /Tool call budget/);
  const expensive = { ...tool, estimateMicroUsd: () => 2_000_000 };
  const tooCostly = await runCapabilityAgent({ budget: budget(), tools: [expensive], authorities: new Set(['synthetic:run']), reserveCost, turn: async () => ({ summary: 'cost', toolCalls: [{ id: '1', capabilityId: tool.id, input: 'a' }] }), validateFinal: () => true });
  assert.equal(tooCostly.status, 'failed');
  assert.match(tooCostly.explanation, /cost would exceed/);
});
