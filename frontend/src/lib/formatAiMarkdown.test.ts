import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormattedAiMarkdown, safeMarkdownUrl, structureLongProse } from './formatAiMarkdown.js';

test('markdown URL policy permits ordinary links and rejects executable protocols', () => {
  assert.equal(safeMarkdownUrl('https://standards.example/spec', 'href', {} as never), 'https://standards.example/spec');
  assert.equal(safeMarkdownUrl('/docs/runtime', 'href', {} as never), '/docs/runtime');
  assert.equal(safeMarkdownUrl('mailto:user@example.com', 'href', {} as never), 'mailto:user@example.com');
  assert.equal(safeMarkdownUrl('javascript:alert(1)', 'href', {} as never), '');
  assert.equal(safeMarkdownUrl('data:text/html,unsafe', 'href', {} as never), '');
  assert.equal(safeMarkdownUrl('http://example.com/image.png', 'src', {} as never), '');
});

test('CommonMark content renders links, emphasis, fenced code, and tables with empty cells safely', () => {
  const html = renderToStaticMarkup(createElement(FormattedAiMarkdown, {
    content: [
      '## Result',
      '',
      'Read **strong** and *emphasized* [evidence](https://example.com/source).',
      '',
      '```ts',
      'const ready = true;',
      '```',
      '',
      '| name | value | note |',
      '| --- | --- | --- |',
      '| alpha | | verified |',
      '',
      '<img src=x onerror=alert(1)>',
    ].join('\n'),
  }));

  assert.match(html, /<h3/);
  assert.match(html, /<strong[^>]*>strong<\/strong>/);
  assert.match(html, /<em[^>]*>emphasized<\/em>/);
  assert.match(html, /href="https:\/\/example\.com\/source\?utm_source=xroga\.com"/);
  assert.match(html, /language-ts/);
  assert.match(html, /const ready = true;/);
  assert.match(html, /<td[^>]*><\/td>/, 'the empty GFM cell must remain in the table');
  assert.doesNotMatch(html, /onerror|<img/);
});

test('long answers present the opening once as a brief lead while preserving sections', () => {
  const opening = 'The direct answer is to keep the existing connection and improve how its verified results are presented.';
  const html = renderToStaticMarkup(createElement(FormattedAiMarkdown, {
    content: `${opening}\n\n## Details\n\n${'Evidence belongs beside the claim, with clear limits and no invented prices. '.repeat(9)}\n\n## Takeaway\n\nKeep the verified result.`,
  }));
  assert.match(html, /The short answer/);
  assert.match(html, /Details/);
  assert.match(html, /Takeaway/);
  assert.equal(html.split(opening).length - 1, 1, 'the lead must not be duplicated');
});

test('dense legacy prose is divided into readable paragraphs without changing words or code', () => {
  const prose = 'This first supported point explains the context and includes an exact citation [1]. This second sentence explains the practical consequence for the reader. This third sentence gives another distinct consideration before the next section. '.repeat(3);
  const input = `${prose}\n\n\`\`\`text\n${prose}\n\`\`\``;
  const result = structureLongProse(input);
  assert.ok(result.split('\n\n').length > input.split('\n\n').length);
  assert.equal(result.replace(/\s+/g, ' ').trim(), input.replace(/\s+/g, ' ').trim());
  assert.match(result, /```text\n/);
});

test('ordinary external links also get the compact resource-preview affordance', () => {
  const html = renderToStaticMarkup(createElement(FormattedAiMarkdown, { content: 'Read the [original guide](https://example.com/guide).' }));
  assert.match(html, /xv-resource-link/);
  assert.match(html, /Open link: original guide/);
  assert.match(html, /href="https:\/\/example\.com\/guide\?utm_source=xroga\.com"/);
});
