import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerReasoningMode } from './semanticRequestPlanner.js';

test('answers write at once; only work rated hard keeps private reasoning', () => {
  for (const contextComplexity of ['low', 'medium', 'unknown']) {
    for (const semanticIntent of ['ANSWER', 'INVESTIGATE', 'PROPOSE', 'MODIFY']) assert.equal(answerReasoningMode(true, { semanticIntent, contextComplexity }), 'none');
  }
  assert.equal(answerReasoningMode(true, { semanticIntent: 'ANSWER', contextComplexity: 'high' }), 'default');
  assert.equal(answerReasoningMode(true), 'none');
  assert.equal(answerReasoningMode(false, { semanticIntent: 'ANSWER', contextComplexity: 'high' }), 'none');
});
