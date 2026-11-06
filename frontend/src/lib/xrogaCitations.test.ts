import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { FormattedAiMarkdown } from './formatAiMarkdown';
import { remarkSourceCitations, safeSourceUrl, sourceClickUrl } from './xrogaCitations';

const nodeRequire = createRequire(__filename);
nodeRequire.extensions['.css'] = (module) => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) }; };
const { renderBlock } = nodeRequire('../components/terminal/XrogaBlockView.tsx') as typeof import('@/components/terminal/XrogaBlockView');

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
  assert.match(html, /https:\/\/example\.com\/report\?utm_source=xroga\.com/);
  assert.doesNotMatch(html, /More evidence/, 'unrelated source snippets must not flood the answer');
});

test('structured-output narrative retains the same inline citations as plain answers', () => {
  const html = renderToStaticMarkup(renderBlock({ schemaVersion: 1, id: 'answer', type: 'narrative', text: 'A verified claim [2].' }, undefined, sources));
  assert.match(html, /Open source 2: Second report/);
  assert.match(html, /href="https:\/\/example\.org\/two\?utm_source=xroga\.com"/);
});

test('source clicks carry Xroga attribution without altering the underlying evidence URLs', () => {
  assert.equal(sourceClickUrl('https://example.com/report'), 'https://example.com/report?utm_source=xroga.com');
  assert.equal(sourceClickUrl('https://example.com/report?lang=en#chapter'), 'https://example.com/report?lang=en&utm_source=xroga.com#chapter');
  assert.equal(sourceClickUrl('https://example.com/report?utm_source=partner'), 'https://example.com/report?utm_source=partner');
  assert.equal(sourceClickUrl('https://example.com/download?X-Amz-Signature=xyz'), 'https://example.com/download?X-Amz-Signature=xyz');
  assert.equal(sourceClickUrl('https://xroga.com/blog/free-ai-app-builder'), 'https://xroga.com/blog/free-ai-app-builder');
  assert.equal(sourceClickUrl('https://docs.xroga.com/guide'), 'https://docs.xroga.com/guide');
  assert.equal(sourceClickUrl('javascript:alert(1)'), null);
  assert.equal(sourceClickUrl('https://user:pass@example.com/private'), null);
  assert.equal(sourceClickUrl(sourceClickUrl('https://example.org/two')!), 'https://example.org/two?utm_source=xroga.com');
  assert.equal(sources[0]!.url, 'https://example.com/report', 'stored evidence remains canonical');
});
