import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationProjection, type PresentationPlan } from './responsePresentation.js';

test('backend rejects data outside the existing Workspace field and protocol bounds', () => {
  const cases: Array<[PresentationPlan[number]['kind'], unknown]> = [
    ['cards', { cards: [{ title: 'Role', subtitle: 's'.repeat(501), description: 'Explanation' }] }],
    ['table', { columns: ['Field', 'Role'], rows: [['a'.repeat(10_001), 'Value']] }],
    ['graph', { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'edge', source: 'a', target: 'b', label: 'l'.repeat(501) }] }],
    ['graph', { nodes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }], edges: [{ id: 'one', source: 'a', target: 'a', label: 'Read' }] }],
    ['table', { columns: ['Field', 'Role'], rows: Array.from({ length: 6 }, () => ['a'.repeat(9_000), 'Value']) }],
  ];
  for (const [kind, data] of cases) {
    const raw = JSON.stringify({ s0: { markdown: 'Supplied explanation.', data } });
    const p = createPresentationProjection([{ kind, heading: 'Section', instruction: 'Keep the supplied data.' }]);
    assert.equal(p.append(raw), '');
    const result = p.finish(raw);
    assert.equal(result.ok, false, kind);
    assert.equal(result.original, raw, 'Rejected content is retained, never silently dropped');
  }
});
