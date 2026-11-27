import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Diagram, layoutDiagram } from './Diagram';
import { NativeSectionTitle } from './upstream/components/markdown';

function layout(rows: string[][], links: Array<[string, string]>, compact: boolean) {
  const result = layoutDiagram({
    title: 'Branch flow',
    description: 'An example of diagram routing.',
    nodes: rows.flatMap((row, level) => row.map(id => ({ id, label: id, level }))),
    links: links.map(([from, to]) => ({ from, to, label: from + ' to ' + to })),
  }, compact);
  assert.ok(result);
  return result;
}

test('bypasses use the clear outer side of both rows at desktop and compact sizes', () => {
  for (const compact of [false, true]) {
    const graph = layout([['start'], ['pass', 'review'], ['hold'], ['resolve'], ['finish']],
      [['start', 'pass'], ['start', 'review'], ['review', 'hold'], ['hold', 'resolve'], ['resolve', 'finish'], ['pass', 'finish']], compact);
    const direct = graph.edges.at(-1)!;
    assert.deepEqual([direct.source, direct.target, direct.sourceHandle, direct.targetHandle], ['pass', 'finish', 'left', 'left']);
    assert.equal(direct.pathOptions?.offset, 18);
    assert.ok(graph.outsideLanes);
    assert.equal(graph.edges.filter(edge => edge.pathOptions).length, 1);
  }
});

test('a bypass clears wider intermediate rows and keeps adjacent and same-row handles', () => {
  const graph = layout([['source-left', 'source-right'], ['wide-left', 'wide-middle', 'wide-right'], ['end-left', 'end-right']],
    [['source-right', 'end-right'], ['source-left', 'end-right'], ['source-left', 'wide-left'], ['wide-left', 'wide-middle']], false);
  assert.equal(graph.edges[0].sourceHandle, 'right');
  assert.equal(graph.edges[0].targetHandle, 'right');
  assert.ok(graph.edges[0].pathOptions!.offset > 18);
  assert.deepEqual(graph.edges.slice(1).map(edge => [edge.sourceHandle, edge.targetHandle, edge.pathOptions]), [
    [null, null, undefined],
    [null, null, undefined],
    ['right', 'left', undefined],
  ]);
});

test('a diagram with a visible section heading keeps its accessible name without repeating the caption title', () => {
  const title = 'Review handoff';
  const diagram = createElement(Diagram.component, { renderNode: () => null, props: {
    title, description: 'Review before handoff.',
    nodes: [{ id: 'draft', label: 'Draft', level: 0 }, { id: 'review', label: 'Review', level: 1 }],
    links: [{ from: 'draft', to: 'review' }],
  } });
  const inSection = renderToStaticMarkup(createElement(NativeSectionTitle.Provider, { value: title }, diagram));
  assert.match(inSection, /aria-label="Review handoff"/);
  assert.match(inSection, /Review before handoff\./);
  assert.doesNotMatch(inSection, /<strong[^>]*>Review handoff<\/strong>/);
  assert.match(renderToStaticMarkup(diagram), /<strong[^>]*>Review handoff<\/strong>/);
  const separate = renderToStaticMarkup(createElement(NativeSectionTitle.Provider, { value: 'Release steps' }, diagram));
  assert.match(separate, /<strong[^>]*>Review handoff<\/strong>/);
});

test('plain chains retain their handles and reciprocal bypasses take different open sides', () => {
  for (const compact of [false, true]) {
    const graph = layout([['start'], ['step'], ['finish']], [['start', 'step'], ['step', 'finish']], compact);
    assert.equal(graph.outsideLanes, false);
    assert.deepEqual(graph.edges.map(edge => [edge.sourceHandle, edge.targetHandle]), [[null, null], [null, null]]);
    const reciprocal = layout([['start'], ['step'], ['finish']], [['start', 'finish'], ['finish', 'start']], compact);
    assert.deepEqual(reciprocal.edges.map(edge => [edge.sourceHandle, edge.targetHandle]), [['left', 'left'], ['right', 'right']]);
  }
});
