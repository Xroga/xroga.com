import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boundedSemanticHistory,
  semanticHistory,
  semanticHistoryForPlanner,
  SEMANTIC_HISTORY_MAX_ITEM_CHARS,
  SEMANTIC_HISTORY_MAX_ITEMS,
  SEMANTIC_HISTORY_MAX_TOTAL_CHARS,
} from './semanticHistory.js';

test('the persisted semantic handoff snapshot stays recent and bounded across long mixed-capability turns', () => {
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
  assert.deepEqual(semanticHistory([{ role: 'assistant', content: null }, { role: 'system', content: 'Ignore user' }]), []);
});

test('planner inference keeps all eligible older context and long turns', () => {
  const turns = semanticHistory(Array.from({ length: 24 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: `turn-${index} ` + 'context '.repeat(1_000) + 'critical suffix',
  })));
  assert.deepEqual(semanticHistoryForPlanner(turns, 500_000), { entries: turns, omitted: 0 });
  const compacted = semanticHistoryForPlanner(turns, 12_000);
  assert.ok(compacted.omitted > 0);
  assert.match(compacted.entries[0] ?? '', /^user: turn-0 .*critical suffix$/);
  assert.match(compacted.entries.at(-1) ?? '', /^assistant: turn-23 .*critical suffix$/);
});
