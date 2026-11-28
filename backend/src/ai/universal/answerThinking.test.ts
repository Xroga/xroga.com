import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerReasoningMode } from './semanticRequestPlanner.js';

test('ordinary answers write at once, with or without visuals; hard, unrated and action work keeps thinking', () => {
  for (const contextComplexity of ['low', 'medium']) {
    for (const semanticIntent of ['ANSWER', 'INVESTIGATE']) assert.equal(answerReasoningMode(true, { semanticIntent, contextComplexity }), 'none');
    assert.equal(answerReasoningMode(true, { semanticIntent: 'MODIFY', contextComplexity }), 'default');
  }
  assert.equal(answerReasoningMode(true, { semanticIntent: 'ANSWER', contextComplexity: 'high' }), 'default');
  assert.equal(answerReasoningMode(true, { semanticIntent: 'ANSWER', contextComplexity: 'unknown' }), 'default');
  // A planned outline (a chart, table or calculator) no longer delays the first words of ordinary work.
  const outlined = { semanticIntent: 'ANSWER', contextComplexity: 'medium', presentation: [{ kind: 'chart' }] };
  assert.equal(answerReasoningMode(true, outlined), 'none');
  assert.equal(answerReasoningMode(true, { ...outlined, contextComplexity: 'high' }), 'default');
  assert.equal(answerReasoningMode(true), 'default');
  assert.equal(answerReasoningMode(false, { semanticIntent: 'ANSWER', contextComplexity: 'high' }), 'none');
});
