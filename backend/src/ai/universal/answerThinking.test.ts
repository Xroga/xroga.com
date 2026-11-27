import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerReasoningMode } from './semanticRequestPlanner.js';

test('ordinary chat writes at once; hard, unrated and action work keeps thinking', () => {
  for (const contextComplexity of ['low', 'medium']) {
    for (const semanticIntent of ['ANSWER', 'INVESTIGATE']) assert.equal(answerReasoningMode(true, { semanticIntent, contextComplexity }), 'none');
    assert.equal(answerReasoningMode(true, { semanticIntent: 'MODIFY', contextComplexity }), 'default');
  }
  assert.equal(answerReasoningMode(true, { semanticIntent: 'ANSWER', contextComplexity: 'high' }), 'default');
  assert.equal(answerReasoningMode(true, { semanticIntent: 'ANSWER', contextComplexity: 'unknown' }), 'default');
  const ordinary = { semanticIntent: 'ANSWER', contextComplexity: 'medium' };
  assert.equal(answerReasoningMode(true, { ...ordinary, presentation: [] }), 'none');
  assert.equal(answerReasoningMode(true, { ...ordinary, presentation: [{ kind: 'prose' }] }), 'default');
  assert.equal(answerReasoningMode(true), 'default');
  assert.equal(answerReasoningMode(false, { semanticIntent: 'ANSWER', contextComplexity: 'high' }), 'none');
});
