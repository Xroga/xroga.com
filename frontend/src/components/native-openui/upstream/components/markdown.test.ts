import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { inline, MarkdownBlocks, preservedMarkdownTableKeys, tableContentKey } from './markdown';

const render = (source: string) => renderToStaticMarkup(createElement(Fragment, null, inline(source)));

test('inline Markdown preserves underscores inside identifiers', () => {
  const prose = 'Every tenant-owned table carries tenant_id, membership lives in tenant_members, and métrique__totale is a column.';
  assert.equal(render(prose), prose);
  assert.equal(render('_membership_ and __role__ with `tenant_id`'),
    '<em>membership</em> and <strong>role</strong> with <code class="iui-code">tenant_id</code>');
});

test('partial answer collapse preserves the cited table and distinct data', () => {
  const cited = '| Method | Return type | Contents |\n| --- | --- | --- |\n| Path.read_text() | str | The decoded text [4][9] |\n| Path.read_bytes() | bytes | The raw binary content [4][9] |';
  const projected = '| Method | Return type | Contents |\n|---|---|---|\n| Path.read_text() | str | Decoded text |\n| Path.read_bytes() | bytes | Raw binary content |';
  const content = [cited, projected, projected.replace('bytes | Raw', 'int | Raw')].join('\n\n');
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, { text: content, deduplicateTables: true, renderCitation: number => 'Citation ' + number }));
  assert.equal((html.match(/<table/g) ?? []).length, 2);
  assert.match(html, /Citation 4Citation 9/);
  assert.match(html, />int<\/td>/);

  const keys = preservedMarkdownTableKeys(content);
  const headings = ['Method', 'Return type', 'Contents'];
  const rows = [['Path.read_text()', 'str', 'Decoded text'], ['Path.read_bytes()', 'bytes', 'Raw binary content']];
  assert.ok(keys.has(tableContentKey(headings, rows)!));
  assert.ok(!keys.has(tableContentKey(headings, [...rows].reverse())!));
  assert.equal(tableContentKey(headings, [[...rows[0].slice(0, 2), { type: 'element' }]]), undefined);
});
