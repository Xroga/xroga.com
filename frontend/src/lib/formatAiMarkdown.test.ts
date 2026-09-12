import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FormattedAiMarkdown, safeMarkdownUrl } from './formatAiMarkdown.js';

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
  assert.match(html, /href="https:\/\/example\.com\/source"/);
  assert.match(html, /language-ts/);
  assert.match(html, /const ready = true;/);
  assert.match(html, /<td[^>]*><\/td>/, 'the empty GFM cell must remain in the table');
  assert.doesNotMatch(html, /onerror|<img/);
});
