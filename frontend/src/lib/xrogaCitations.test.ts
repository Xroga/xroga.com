import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormattedAiMarkdown } from './formatAiMarkdown';
import { remarkSourceCitations, safeSourceUrl } from './xrogaCitations';
import { renderBlock } from '@/components/terminal/XrogaBlockView';

const sources = [
  { title: 'Official report', url: 'https://example.com/report', snippet: 'Evidence.' },
  { title: 'Second report', url: 'https://example.org/two', snippet: 'More evidence.' },
];

test('numbered citations become source links without touching code or existing links', () => {
  const tree = { type: 'root', children: [
    { type: 'paragraph', children: [
      { type: 'text', value: 'Claim [1], another [2], missing [3].' },
      { type: 'link', url: 'https://elsewhere.test', children: [{ type: 'text', value: '[1]' }] },
      { type: 'inlineCode', value: '[1]' },
    ] },
  ] };
  remarkSourceCitations(sources)()(tree);
  const children = tree.children[0]!.children;
  assert.deepEqual(children.filter((node) => node.type === 'link').map((node) => node.url), [
    'https://example.com/report', 'https://example.org/two', 'https://elsewhere.test',
  ]);
  assert.equal(children.find((node) => node.type === 'inlineCode')?.value, '[1]');
  assert.equal(children.find((node) => node.type === 'text' && node.value?.includes('[3]'))?.value, ', missing [3].');
});

test('unsafe source URLs cannot become citations', () => {
  assert.equal(safeSourceUrl('javascript:alert(1)'), null);
  assert.equal(safeSourceUrl('httpjavascript:alert(1)'), null);
  assert.equal(safeSourceUrl('data:text/html,bad'), null);
  const tree = { type: 'root', children: [{ type: 'text', value: 'Claim [1].' }] };
  remarkSourceCitations([{ title: 'Unsafe', url: 'javascript:alert(1)', snippet: '' }])()(tree);
  assert.deepEqual(tree.children, [{ type: 'text', value: 'Claim [1].' }]);
});

test('the answer renderer shows an accessible source preview and exact source link', () => {
  const html = renderToStaticMarkup(createElement(FormattedAiMarkdown, {
    content: 'The finding is sourced [1].',
    sources,
  }));
  assert.match(html, /Open source 1: Official report/);
  assert.match(html, /xv-citation-chip/);
  assert.match(html, /https:\/\/example\.com\/report/);
  assert.doesNotMatch(html, /More evidence/, 'unrelated source snippets must not flood the answer');
});

test('structured-output narrative retains the same inline citations as plain answers', () => {
  const html = renderToStaticMarkup(renderBlock({ schemaVersion: 1, id: 'answer', type: 'narrative', text: 'A verified claim [2].' }, undefined, sources));
  assert.match(html, /Open source 2: Second report/);
  assert.match(html, /href="https:\/\/example\.org\/two"/);
});
