import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateProviderReservationMicroUsd } from './providerBudget.js';
import { DEFAULT_BUILDER_BUDGET } from './builderAttempt.js';
import { workspaceAnswerOutputChars, workspaceAnswerOutputTokens } from './workspaceAnswerBudget.js';

const modelId = 'deepseek_v4_1_flash_1017';
const budget = (prompt: string, options?: Partial<Parameters<typeof workspaceAnswerOutputTokens>[0]>) =>
  workspaceAnswerOutputTokens({
    modelId,
    prompt,
    messages: [{ role: 'user', content: prompt }],
    reasoning: 'default',
    ...options,
  });

test('brief answers keep the existing efficient allowance with provider reasoning enabled', () => {
  assert.equal(budget('What is the current temperature?', { brief: true }), 16_384);
  assert.equal(budget('2 + 2?', { brief: true, reasoning: 'none' }), 4_096);
});

test('an unseen request receives more room for a long document, many rows and substantial evidence', () => {
  const baseline = budget('Describe the history of musical tuning.');
  assert.ok(budget('Write a detailed editable report of 25,000 words about tuning methods.', {
    complexity: 'high', requestedDocument: true,
  }) > 50_000);
  assert.ok(budget('Return a complete table with 1,200 records.', { brief: true }) > baseline);
  assert.ok(budget('Compare the evidence before reaching a conclusion.', {
    evidenceText: 'A distinct supplied evidence paragraph. '.repeat(4_000),
  }) > baseline);
  assert.ok(budget('Compare these different hypotheses.', { complexity: 'high' }) > baseline);
});

test('the verified model output and estimated remaining context bound the reservation', () => {
  const prompt = 'Write 999,999 words.';
  assert.equal(budget(prompt), 384_000);
  const messages = [{ role: 'user' as const, content: 'a'.repeat(2_925_000) }, { role: 'user' as const, content: prompt }];
  const constrained = budget(prompt, { messages });
  assert.ok(constrained > 24_000 && constrained < 25_000);
  // Budget calculation never edits or shrinks the admitted current message.
  assert.equal(messages[0].content.length, 2_925_000);
  assert.equal(messages[1].content, prompt);
});

test('a signed spend ceiling is fitted using the same accounting inputs as dispatch', () => {
  const prompt = 'Compose a 20,000-word transcript.';
  const messages = [{ role: 'user' as const, content: prompt }];
  const maximumCostMicroUsd = 5_000;
  const limit = budget(prompt, { messages, maximumCostMicroUsd });
  const reserve = (maximumOutputTokens: number) => estimateProviderReservationMicroUsd({
    modelId,
    estimatedInputTokens: Buffer.byteLength(JSON.stringify({ messages, responseFormat: undefined }), 'utf8'),
    maximumOutputTokens,
  });
  assert.ok(limit > 20_480);
  assert.ok(reserve(limit) <= maximumCostMicroUsd);
  assert.ok(reserve(limit + 1) > maximumCostMicroUsd);
});

test('large admitted turns can expand the transport safety guard within the provider maximum', () => {
  assert.equal(workspaceAnswerOutputChars(modelId, 16_384), DEFAULT_BUILDER_BUDGET.maxOutputChars);
  assert.equal(workspaceAnswerOutputChars(modelId, 384_000), 3_072_000);
  assert.equal(workspaceAnswerOutputChars(modelId, 999_999), workspaceAnswerOutputChars(modelId, 384_000));
});
