import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundedSemanticHistory,
  SEMANTIC_HISTORY_MAX_ITEM_CHARS,
  SEMANTIC_HISTORY_MAX_ITEMS,
  SEMANTIC_HISTORY_MAX_TOTAL_CHARS,
} from './semanticHistory.js';

test('semantic planner history is recent, ordered, and bounded across long mixed-capability turns', () => {
  const history = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `turn-${index}-` + 'x'.repeat(12_000),
  }));
  const bounded = boundedSemanticHistory(history);
  assert.ok(bounded.length <= SEMANTIC_HISTORY_MAX_ITEMS);
  assert.ok(bounded.every((entry) => entry.length <= SEMANTIC_HISTORY_MAX_ITEM_CHARS + 'assistant: '.length));
  assert.ok(bounded.reduce((sum, entry) => sum + entry.length, 0) <= SEMANTIC_HISTORY_MAX_TOTAL_CHARS);
  assert.match(bounded.at(-1) ?? '', /^assistant: turn-19-/);
  assert.doesNotMatch(bounded.join('\n'), /turn-0-/);
});

test('semantic planner history safely handles absent and malformed input', () => {
  assert.deepEqual(boundedSemanticHistory(undefined), []);
  assert.deepEqual(boundedSemanticHistory([{ role: 'assistant', content: null }]), ['assistant: ']);
});
