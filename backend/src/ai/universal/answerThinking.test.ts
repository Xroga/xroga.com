import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerReasoningMode } from './semanticRequestPlanner.js';

test('text and table answers write at once; hard work and answers that build a visual keep private reasoning', () => {
  for (const contextComplexity of ['low', 'medium', 'unknown']) {
    assert.equal(answerReasoningMode(true, { contextComplexity }), 'none');
    for (const kind of ['prose', 'table', 'steps']) assert.equal(answerReasoningMode(true, { contextComplexity, presentation: [{ kind }] }), 'none');
    for (const kind of ['calculator', 'chart', 'graph', 'metrics', 'cards', 'tabs']) {
      assert.equal(answerReasoningMode(true, { contextComplexity, presentation: [{ kind: 'prose' }, { kind }] }), 'default');
    }
  }
  assert.equal(answerReasoningMode(true, { contextComplexity: 'high' }), 'default');
  assert.equal(answerReasoningMode(true), 'none');
  assert.equal(answerReasoningMode(false, { contextComplexity: 'high', presentation: [{ kind: 'chart' }] }), 'none');
});
