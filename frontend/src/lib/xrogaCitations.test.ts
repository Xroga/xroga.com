import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { remarkSourceCitations, safeSourceUrl, sourceClickUrl } from './xrogaCitations';

const nodeRequire = createRequire(__filename);
nodeRequire.extensions['.css'] = (module) => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) }; };
const { FormattedAiMarkdown } = nodeRequire('./formatAiMarkdown.tsx') as typeof import('./formatAiMarkdown');
const { renderBlock } = nodeRequire('../components/terminal/XrogaBlockView.tsx') as typeof import('@/components/terminal/XrogaBlockView');
const { ProseV2 } = nodeRequire('../components/response-experience-v2/ProseV2.tsx') as typeof import('@/components/response-experience-v2/ProseV2');
const { MarkdownBlocks } = nodeRequire('../components/native-openui/upstream/components/markdown.tsx') as typeof import('@/components/native-openui/upstream/components/markdown');
const { evidenceCitation } = nodeRequire('../components/native-openui/evidence.tsx') as typeof import('@/components/native-openui/evidence');
const { NativeSurface } = nodeRequire('../components/native-openui/NativeSurface.tsx') as typeof import('@/components/native-openui/NativeSurface');

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
  assert.match(html, /data-source-citation/);
  assert.match(html, /https:\/\/example\.com\/report\?utm_source=xroga\.com/);
  assert.doesNotMatch(html, /More evidence/, 'unrelated source snippets must not flood the answer');
});

test('structured-output narrative retains the same inline citations as plain answers', () => {
  const html = renderToStaticMarkup(renderBlock({ schemaVersion: 1, id: 'answer', type: 'narrative', text: 'A verified claim [2].' }, undefined, sources));
  assert.match(html, /Open source 2: Second report/);
  assert.match(html, /href="https:\/\/example\.org\/two\?utm_source=xroga\.com"/);
});

test('saved numbered Markdown links use a publisher chip only for matching evidence', () => {
  const source = { title: 'Connection settings', url: 'https://git.postgresql.org/docs.pdf?id=123', snippet: '' };
  const matching = `Default port ([1](${source.url})).`;
  const different = 'See [1](https://example.org/unknown).';
  const evidence = new Map([['source-1', { ...source, id: 'source-1' }]]);
  for (const render of [
    (text: string) => createElement(FormattedAiMarkdown, { content: text, sources: [source] }),
    (text: string) => createElement(ProseV2, { text, sources: [source] }),
    (text: string) => createElement(MarkdownBlocks, { text, renderCitation: (number, href) => evidenceCitation(evidence, number, href) }),
  ]) {
    const html = renderToStaticMarkup(render(matching));
    assert.match(html, /Open source 1: Connection settings/);
    assert.match(html, />PostgreSQL</);
    assert.match(html, /docs\.pdf\?id=123/);
    assert.doesNotMatch(renderToStaticMarkup(render(different)), /Connection settings|href="https:\/\/example\.org\/unknown/);
  }
  const native = renderToStaticMarkup(createElement(MarkdownBlocks, {
    text: 'See [1](https://git.postgresql.org/docs.pdf?id=456).',
    renderCitation: (number, href) => evidenceCitation(evidence, number, href),
  }));
  assert.doesNotMatch(native, /<a /);
});

test('research fallbacks keep only fully bound numeric links and preserve prose links and code', () => {
  const text = 'Incorrect [1](https://wrong.test/) and [7](/workspace). [Ordinary link](https://trusted.test/docs) Code: `[1](https://wrong.test/)`.';
  for (const element of [
    createElement(FormattedAiMarkdown, { content: text, sources }),
    createElement(ProseV2, { text, sources }),
  ]) {
    const html = renderToStaticMarkup(element);
    assert.match(html, /Incorrect \[1\] and \[7\]/);
    assert.doesNotMatch(html, /href="(?:https:\/\/wrong\.test\/|\/workspace)/);
    assert.match(html, /href="https:\/\/trusted\.test\/docs/);
    assert.match(html, /<code[^>]*>\[1\]\(https:\/\/wrong\.test\/\)<\/code>/);
  }
  assert.match(renderToStaticMarkup(createElement(FormattedAiMarkdown, { content: '[7](https://trusted.test/list).' })), /href="https:\/\/trusted\.test\/list/);
});

test('native Markdown verifies angle-bracket citation destinations with literal parentheses', () => {
  const url = 'https://example.org/Feature_(product)?edition=2';
  const evidence = new Map([['source-1', { id: 'source-1', title: 'Feature documentation', url }]]);
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, {
    text: `The feature is documented [1](<${url}>). Unmatched [1](<${url}&old=true>).`,
    renderCitation: (number, href) => evidenceCitation(evidence, number, href),
  }));
  assert.match(html, /href="https:\/\/example\.org\/Feature_\(product\)\?edition=2"/);
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.doesNotMatch(html, /edition=2&amp;old|product\)&gt;/);
});

test('native headings, lists, and tables keep citations beside the supported text', t => {
  // The repository's tsx runner uses classic JSX, while Next transforms it automatically.
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, 'React', previousReact);
    else Reflect.deleteProperty(globalThis, 'React');
  });
  const source = { id: 'source-1', title: 'Verified setup guide', siteName: 'Example Press', url: 'https://example.org/guide' };
  const answer = {
    format: 'xroga-openui-v1',
    library: 'xroga-native-v1',
    text: '- Follow the supplied instructions [1].',
    program: [
      'root = Col([Title("Documented default [1]"), Section("Steps [1]", [instructions, values])])',
      'instructions = List(["Follow the supplied instructions [1].", ListItem("Install the package [1]", "Use the approved version [1].")])',
      'values = Table(["Documented value [1]"], [["Default: enabled [1]"], ["Missing: [9]"], ["Literal: `[1]`"], ["Unmatched: [1](https://elsewhere.test/guide)"]])',
    ].join('\n'),
  } as const;
  const html = renderToStaticMarkup(createElement(NativeSurface, { answer, sources: [source] }));
  assert.equal((html.match(/Follow the supplied instructions/g) ?? []).length, 1);
  assert.match(html, /Follow the supplied instructions <a [^>]*data-source-citation/);
  assert.match(html, /Default: enabled <a [^>]*data-source-citation/);
  assert.equal((html.match(/href="https:\/\/example\.org\/guide"/g) ?? []).length, 7);
  assert.equal((html.match(/aria-label="Open source 1: Verified setup guide"/g) ?? []).length, 7);
  assert.match(html, /<th[^>]*><button[^>]*>Documented value\s*<\/button><a [^>]*data-source-citation/);
  assert.match(html, /Missing: \[9\]/);
  assert.match(html, /Literal: <code class="iui-code">\[1\]<\/code>/);
  assert.doesNotMatch(html, /href="https:\/\/elsewhere\.test/);
});

test('native citation clusters keep publisher names, distinct sources and links for separate claims', t => {
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  Object.defineProperty(globalThis, 'React', { configurable: true, value: React });
  t.after(() => {
    if (previousReact) Object.defineProperty(globalThis, 'React', previousReact);
    else Reflect.deleteProperty(globalThis, 'React');
  });
  const report = 'https://example.org/report?revision=2#results';
  const methods = 'https://example.org/report?revision=2#methods';
  const evidence = [
    { id: 'source-1', title: 'Results', siteName: 'NASA Science', url: report },
    { id: 'source-2', title: 'Duplicate result', siteName: 'NASA Science', url: report },
    { id: 'source-3', title: 'Methodology', siteName: 'NASA Science', url: methods },
  ];
  const answer = {
    format: 'xroga-openui-v1',
    library: 'xroga-native-v1',
    text: `Supporting notes [1] [2](${report}) [3](${methods}). Independent check [2]. Code: \`[1]\`.`,
    program: 'root = Col([Text(["Measured result [1] ", Source("source-2"), " ", Source("source-3"), ". Separate claim ", Source("source-2"), "."])])',
  } as const;
  const html = renderToStaticMarkup(createElement(NativeSurface, { answer, sources: evidence }));
  assert.equal((html.match(/data-source-citation/g) ?? []).length, 6);
  const compact = [...html.matchAll(/<a [^>]*class="[^"]*\bcompact\b[^"]*"[^>]*>.*?<\/a>/g)];
  assert.equal(compact.length, 2);
  for (const [chip] of compact) {
    assert.match(chip, /aria-label="Open source 3: Methodology"/);
    assert.match(chip, /<span class="label">NASA Science<\/span>/);
  }
  assert.equal((html.match(/href="https:\/\/example\.org\/report\?revision=2#results"/g) ?? []).length, 4);
  assert.equal((html.match(/href="https:\/\/example\.org\/report\?revision=2#methods"/g) ?? []).length, 2);
  assert.match(html, /Measured result .*aria-label="Open source 1: Results"/);
  assert.match(html, /Separate claim .*aria-label="Open source: Duplicate result"/);
  assert.equal((html.match(/aria-label="Open source 3: Methodology"/g) ?? []).length, 2);
  assert.match(html, /Independent check <a [^>]*data-source-citation[^>]*aria-label="Open source 2: Duplicate result"/);
  assert.match(html, /Code: <code class="iui-code">\[1\]<\/code>/);
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
