import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';

const requireStyle = createRequire(__filename);
requireStyle.extensions['.css'] = (module) => { module.exports = { __esModule: true, default: {} }; };
const { FormattedAiMarkdown, safeMarkdownUrl } = requireStyle('./formatAiMarkdown.tsx') as typeof import('./formatAiMarkdown');

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
      '| beta | 42 | The reference describes which conditions the operator should check before deciding whether the example applies. |',
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
  assert.match(html, /TypeScript/);
  assert.match(html, /tabindex="0" role="group" aria-label="Answer table"/);
  assert.match(html, /<th scope="col"[^>]*>name<\/th>/);
  assert.equal((html.match(/data-answer-table-long-text=""/g) ?? []).length, 1);
  assert.match(html, /data-answer-table-long-text=""[^>]*>The reference describes/);
  assert.match(html, /aria-label="Copy code"/);
  assert.match(html, /<td[^>]*><\/td>/, 'the empty GFM cell must remain in the table');
  assert.doesNotMatch(html, /onerror|src="x"/i);
  assert.match(html, /src="\/api\/site-icon\?d=example\.com"/);
});

test('long answers keep their authored opening and sections without adding a summary label', () => {
  const opening = 'The direct answer is to keep the existing connection and improve how its verified results are presented.';
  const html = renderToStaticMarkup(createElement(FormattedAiMarkdown, {
    content: `${opening}\n\n## Details\n\n${'Evidence belongs beside the claim, with clear limits and no invented prices. '.repeat(9)}\n\n## Takeaway\n\nKeep the verified result.`,
  }));
  assert.doesNotMatch(html, /xv-answer-lead|The short answer/);
  assert.match(html, /Details/);
  assert.match(html, /Takeaway/);
  assert.equal(html.split(opening).length - 1, 1, 'the lead must not be duplicated');
});

test('a complete single paragraph stays intact instead of becoming a synthetic summary and body', () => {
  const content = 'This first supported point explains the context. This second sentence explains the practical consequence for the reader. This third sentence gives another distinct consideration. '.repeat(4).trim();
  const html = renderToStaticMarkup(createElement(FormattedAiMarkdown, { content }));
  assert.equal((html.match(/<p[ >]/g) ?? []).length, 1);
  assert.ok(html.includes(content));
  assert.doesNotMatch(html, /xv-answer-lead|The short answer/);
});

test('authored paragraph boundaries and code remain separate and complete', () => {
  const first = 'The supplied prose keeps its own paragraph boundaries. '.repeat(12).trim();
  const second = 'A distinct paragraph remains distinct.';
  const code = 'const literal = "Sentence. Next sentence.";';
  const html = renderToStaticMarkup(createElement(FormattedAiMarkdown, { content: `${first}\n\n${second}\n\n\`\`\`ts\n${code}\n\`\`\`` }));
  assert.equal((html.match(/<p[ >]/g) ?? []).length, 2);
  assert.ok(html.includes(first));
  assert.ok(html.includes(second));
  assert.match(html, /language-ts/);
  assert.match(html, /const literal/);
});

test('ordinary external links also get the compact resource-preview affordance', () => {
  const html = renderToStaticMarkup(createElement(FormattedAiMarkdown, { content: 'Read the [original guide](https://example.com/guide).' }));
  assert.doesNotMatch(html, /data-source-citation/);
  assert.match(html, /Open link: original guide/);
  assert.match(html, /href="https:\/\/example\.com\/guide\?utm_source=xroga\.com"/);
});

test('saved Search renders its owner review without the obsolete progress copy', () => {
  const path = '/dashboard/actions/confirm/a3bb8c99-cf0b-4d38-a759-8e391b37f40d';
  const response = `Review the exact external research request: [Review action](${path}). No live evidence has been retrieved.`;
  const render = (content: string) => renderToStaticMarkup(createElement(FormattedAiMarkdown, { content }));
  assert.match(render(response), /Loading action/);
  assert.doesNotMatch(render(response), /No live evidence|Full approval payload|Prepared digest|micro-USD/);
  const foreign = render(`[External documentation](https://docs.example${path})`);
  assert.match(foreign, /href="https:\/\/docs\.example/);
  assert.doesNotMatch(foreign, /Loading action/);
});
