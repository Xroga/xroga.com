import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { publicAnswerText } from '@/lib/publicAnswerText';
import { inline, MarkdownBlocks, nativeMarkdownMatches, preservedMarkdownTableKeys, tableContentKey } from './markdown';

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

test('inline answer keeps additional prose and requested code but strips presentation fences', () => {
  const element = (typeName: string, props: Record<string, unknown>) => ({ type: 'element', typeName, props });
  const matches = nativeMarkdownMatches(element('Col', {
    children: [element('Text', { text: 'An exact summary.' }), element('Text', { text: ['A cited fact. ', element('Source', { id: 'source-1' })] }), element('Code', { code: 'return 25 * 40;' })],
  }));
  const fence = String.fromCharCode(96).repeat(3);
  const text = ['An exact summary.', 'Fees are excluded.', 'A cited fact [1].', 'Another cited fact [1].',
    fence + 'openui\nroot = Col([Text("INTERNAL")])\n' + fence,
    fence + 'js\nreturn 25 * 40;\n' + fence,
    '~~~python\nprint(25 * 40)\n~~~', 'The complete estimate follows.'].join('\n\n');
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, { text, matches }));
  assert.match(html, /Fees are excluded/);
  assert.match(html, /<code>print\(25 \* 40\)<\/code>/);
  assert.match(html, /The complete estimate follows/);
  assert.match(html, /Another cited fact/);
  assert.doesNotMatch(html, /An exact summary|>A cited fact|INTERNAL|return 25 \* 40|root = Col/);
});

test('public answer text keeps ordinary code and withholds private streamed syntax', () => {
  const fence = String.fromCharCode(96).repeat(3);
  const code = fence + 'python\nroot = Node()\n' + fence;
  assert.equal(publicAnswerText(code), code);
  assert.equal(publicAnswerText(code + '\n<<<XROGA_OPENUI_V1>>>\nroot = Col([])'), code);
  assert.equal(publicAnswerText('Answer ready.\n<<<XROGA_OPENUI', true), 'Answer ready.');
  assert.equal(publicAnswerText('Answer ready.\nroot = Row([Text("private")])'), 'Answer ready.');
  assert.equal(publicAnswerText(JSON.stringify({ format: 'xroga-openui-v1', text: 'Readable result.', program: 'root = Col([])' })), 'Readable result.');
});

test('a hidden study-card face never suppresses the main answer', () => {
  const text = 'A study card explains this later.';
  const matches = nativeMarkdownMatches({
    type: 'element', typeName: 'Flashcard',
    props: { back: [{ type: 'element', typeName: 'Text', props: { text } }] },
  });
  assert.match(renderToStaticMarkup(createElement(MarkdownBlocks, { text, matches })), /A study card explains this later/);
});

test('Markdown tables preserve literal pipes and all columns', () => {
  const text = '| Expression | Expected |\n| --- | --- |\n| `number | null` | Use A \\| B |';
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, { text }));
  assert.equal((html.match(/<td>/g) ?? []).length, 2);
  assert.match(html, /<code class="iui-code">number \| null<\/code>/);
  assert.match(html, /<td>Use A \| B<\/td>/);
});
