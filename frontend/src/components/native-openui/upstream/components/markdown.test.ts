import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { publicAnswerText } from '@/lib/publicAnswerText';
import { createParser, type LibraryJSONSchema } from '@openuidev/lang-core';
import catalog from '../../../../../../backend/src/ai/nativeOpenUiCatalog.json';
import { bindNativeAnswerText, supplementNativeProse } from '../../../../../../backend/src/ai/nativeOpenUi';
import { initialNativeValueReader } from '../../../../../../backend/src/ai/nativeOpenUiValues';
import { inline, MathExpression, MarkdownBlocks, nativeMarkdownMatches, placeTitledNativeSections, preservedMarkdownTableKeys, proseOutsideNativeDocuments, tableContentKey } from './markdown';

test('a titled native section follows the matching Markdown passage before the next heading', () => {
  const text = '## Criteria\n\nRead this first.\n\n## Review flow\n\nFollow the two branches.\n\n## Examples\n\nPreserve the full example.';
  const code = 'root = Col([Markdown(_xroga_answer), flow])\nflow = Section("Review flow", [Text("Draw the flow here.")])';
  const saved = bindNativeAnswerText(code, text);
  const layout = createParser(catalog.schema as LibraryJSONSchema, 'Col').parse(saved).root;
  assert.ok(layout);
  const placements = placeTitledNativeSections(layout.props.children as unknown[]);
  assert.ok(placements);
  assert.equal(placements.markdownIndex, 0);
  assert.equal(placements.placements.size, 1);
  assert.equal(placements.placements.values().next().value?.props.title, 'Review flow');
  const inlineSections = {
    nodes: new Map([...placements.placements.keys()].map(i => [i, createElement('span', null, 'The native diagram')])),
    replacedBlocks: placements.replacedBlocks,
  };
  const view = renderToStaticMarkup(createElement(MarkdownBlocks, {text,inlineSections}));
  assert.match(view, /Follow the two branches.*The native diagram.*Examples.*Preserve the full example/);
  assert.equal(view.match(/The native diagram/g)?.length, 1);
  assert.match(text, /## Examples/);
  assert.equal(proseOutsideNativeDocuments(text, nativeMarkdownMatches(layout)), '');
});

test('ambiguous, fenced, unanchored and earlier native sections keep their model-authored order', () => {
  const doc = (text: string, hasDynamicProps = false) => ({type: 'element',typeName: 'Markdown',props: {text},hasDynamicProps});
  const section = {type: 'element',typeName: 'Section',props: {title: 'Review flow'}};
  for (const nodes of [
    [doc('## Review flow\n\nRead first.\n\n## Review flow'), section],
    [doc('```md\n## Review flow\n```'), section],
    [doc('## Examples'), section],
    [doc('## Review flow', true), section],
    [doc('## Review flow'), section, section],
    [doc('## Review flow'), doc('## Examples'), section],
    [section, doc('## Review flow')],
  ]) assert.equal(placeTitledNativeSections(nodes), undefined);
});

test('a visible checklist replaces its exact same-section Markdown list only', () => {
  const code = [
    'root = Col([Markdown(_xroga_answer), checks])',
    'checks = Section("Closing checklist", [Controls([Checkbox($tools, "Turn off the tools."), Checkbox($handoff, "Record the handoff.")], "Close the shop")])',
    '$tools = false',
    '$handoff = false',
  ].join('\n');
  const parser = createParser(catalog.schema as LibraryJSONSchema, 'Col');
  const bullets = '- Turn off the tools.\n- Record the handoff.';
  function render(sectionBody: string, source = code) {
    const text = '## Closing checklist\n\n' + sectionBody + '\n\n## Notes\n\nKeep the owner’s instructions.';
    const saved = bindNativeAnswerText(source, text);
    const root = parser.parse(saved).root;
    const matches = nativeMarkdownMatches(root, initialNativeValueReader(saved));
    const nodes = new Map([...matches.inlineReplacements.values()].map(i => [i, createElement('span', null, 'The interactive checklist')]));
    const rich = renderToStaticMarkup(createElement(MarkdownBlocks, {
      text, inlineSections: { nodes, replacedBlocks: new Set(nodes.keys()) }, renderCitation: () => 'Verified source',
    }));
    const fallback = renderToStaticMarkup(createElement(MarkdownBlocks, { text, renderCitation: () => 'Verified source' }));
    return { rich, fallback };
  }
  const { rich, fallback } = render(bullets);
  assert.match(rich, /Closing checklist.*The interactive checklist.*Notes.*Keep the owner/);
  assert.doesNotMatch(rich, /Turn off the tools|Record the handoff/);
  assert.match(fallback, /Turn off the tools.*Record the handoff/);
  assert.match(render(bullets + '\n\nConfirm the handoff in writing.').rich, /The interactive checklist.*Confirm the handoff in writing.*Notes/);
  assert.doesNotMatch(render(bullets.replaceAll('- ', '- [ ] ')).rich, /Turn off the tools/);
  for (const [different, source] of [
    [bullets, code.replace('"Closing checklist"', '"Another checklist"')],
    [bullets, code.replace('$handoff = false', '$handoff = true')],
    [bullets.split('\n').reverse().join('\n'), code],
    [bullets.replace('tools.', 'tools. [1]'), code],
    [bullets + '\n- Lock the door.', code],
    ['1. Turn off the tools.\n2. Record the handoff.', code],
    ['- [ ] Turn off the tools.\n- Record the handoff.', code],
    ['- Preserve this precondition.\n\nBefore closing.\n\n' + bullets, code],
  ]) assert.match(render(different, source).rich, /Turn off the tools.*Record the handoff|Record the handoff.*Turn off the tools/);
});

test('a titled native introduction replaces a single equivalent Markdown paragraph and preserves distinct links', () => {
  const program = 'root = Col([Markdown(_xroga_answer), Section("Handoff", [Caption("Keep this detail.")], "Pass the notes to the coordinator.")])';
  for (const [paragraph, expected] of [
    ['**Pass the notes to the coordinator.**', 1],
    ['Pass the notes to the coordinator. [1]', 0],
    ['Pass the notes to the coordinator.\n\nConfirm receipt.', 0],
  ] as const) {
    const code = bindNativeAnswerText(program, '## Handoff\n\n' + paragraph);
    const root = createParser(catalog.schema as LibraryJSONSchema, 'Col').parse(code).root;
    assert.equal(nativeMarkdownMatches(root, initialNativeValueReader(code)).inlineReplacements.size, expected);
  }
});

const render = (source: string) => renderToStaticMarkup(createElement(Fragment, null, inline(source)));

test('an unexpected typesetter exception preserves escaped formula text and the remaining answer', () => {
  const tex='{'.repeat(3500)+'x'+'}'.repeat(3500)+'<img src=x onerror=alert(1)>';
  const html=renderToStaticMarkup(createElement(MathExpression,{tex}));
  assert.match(html,/&lt;img/);
  assert.doesNotMatch(html,/<img|<script/);
  const answer=renderToStaticMarkup(createElement(MarkdownBlocks,{text:'$$'+tex+'$$\n\nKeep the complete explanation.'}));
  assert.match(answer,/Keep the complete explanation/);
  assert.doesNotMatch(answer,/<img|<script/);
});

test('Markdown formulas use the existing safe math renderer without changing currency or code', () => {
  const block = (text: string) => renderToStaticMarkup(createElement(MarkdownBlocks, {text}));
  for (const text of ['$$A = P\\left(1 + \\frac{r}{n}\\right)^{nt}$$', '$$\nx^2 + y^2\n$$', '\\[\nx^2\n\\]']) {
    const html = block(text);
    assert.match(html, /class="katex"/);
    assert.match(html, /<math/);
    assert.match(html, /tabindex="0"/);
    assert.doesNotMatch(html, /\$\$/);
  }
  assert.match(render('Use \\(x^2\\) here.'), /class="katex"/);
  const prices = 'Basic costs $10 and Pro costs $25 per month.';
  assert.equal(block(prices), '<p>' + prices + '</p>');
  assert.doesNotMatch(render('`\\(x^2\\)`'), /class="katex"/);
  assert.doesNotMatch(block('```latex\n$$x^2$$\n```'), /class="katex"/);
  assert.match(block('$$unfinished\n\nKeep the complete explanation.'), /Keep the complete explanation/);
  const unsafe = block('$$\\href{javascript:alert(1)}{click} + \\includegraphics{https://example.com/track}$$');
  assert.doesNotMatch(unsafe, /href="javascript:|<img|<script|onerror=/);
});

test('a calculated table with a dynamic header replaces its initial fallback table', () => {
  const program='root = Col([Table(["Compounding", "Balance after " + @Plural($years,"year")], [["Monthly", @Format(18193.96734,"currency",2,"USD")]])])\n$years = 10';
  const text=supplementNativeProse('Initial calculation.',program,true);
  const root=createParser(catalog.schema as LibraryJSONSchema,'Col').parse(program).root;
  const matches=nativeMarkdownMatches(root,initialNativeValueReader(program));
  const visible=renderToStaticMarkup(createElement(MarkdownBlocks,{text,matches}));
  assert.doesNotMatch(visible,/<table/);
  assert.match(visible,/Initial calculation/);
  const fallback=renderToStaticMarkup(createElement(MarkdownBlocks,{text}));
  assert.equal((fallback.match(/<table/g)??[]).length,1);
  assert.match(fallback,/Balance after 10 years/);
});

test('an opening Markdown title does not repeat its native display heading', () => {
  const matches = nativeMarkdownMatches({type:'element',typeName:'Title',props:{text:'Sortable table: time by color'}});
  const render = (text: string, withNativeTitle = true) => renderToStaticMarkup(createElement(MarkdownBlocks, {
    text, nativeHeadingTitles: withNativeTitle ? matches.headingTitles : undefined,
  }));
  const text = '**Sortable table — time by color**\n\nThree recorded times remain available.';
  assert.equal(render(text), '<p>Three recorded times remain available.</p>');
  assert.match(render(text, false), /Sortable table/);
  assert.match(render(text.replace('color**', 'color [1]**')), /Sortable table.*\[1\]/);
  assert.match(render(text.replace('color**', 'different color**')), /different color/);
  assert.match(render('An introduction.\n\n' + text), /Sortable table/);
  assert.equal(render(text.replace(/^\*\*(.*?)\*\*/, '## $1')), '<p>Three recorded times remain available.</p>');
  const code = nativeMarkdownMatches({type:'element',typeName:'Title',props:{text:'Use `a:b`'}});
  assert.match(renderToStaticMarkup(createElement(MarkdownBlocks, {
    text:'**Use `a — b`**',nativeHeadingTitles:code.headingTitles,
  })), /a — b/);
});

test('one complete native Markdown document replaces only its exact readable copy', () => {
  const text = '## Terms\n\n1. Read [1].\n2. Compare.\n\n| Plan | Price |\n|---|---|\n| Basic | $10 |';
  const matches = nativeMarkdownMatches({type: 'element', typeName: 'Markdown', props: {text}});
  assert.equal(proseOutsideNativeDocuments(text, matches), '');
  assert.equal(proseOutsideNativeDocuments(text + '\n\nUnique native detail.', matches), 'Unique native detail.');
  assert.equal(proseOutsideNativeDocuments('Calculated results were corrected.\n\n'+text+'\n\nUnique native detail.',matches),
    'Calculated results were corrected.\n\nUnique native detail.');
  assert.equal(proseOutsideNativeDocuments('A different sentence containing '+text,matches),'A different sentence containing '+text);
  assert.equal(proseOutsideNativeDocuments(text.replace('$10', '$11'), matches), text.replace('$10', '$11'));
  assert.equal(proseOutsideNativeDocuments(text, undefined), text);
  const hidden = nativeMarkdownMatches({type: 'element', typeName: 'Flashcard', props: {back: {type: 'element', typeName: 'Markdown', props: {text}}}});
  assert.equal(proseOutsideNativeDocuments(text, hidden), text);
});

test('upstream parser resolves the canonical answer and rich table without duplicating either', () => {
  const text = 'Basic includes one seat.\n\n1. Read the terms.\n2. Compare.\n\n| Plan | Seats |\n|---|---|\n| Basic | 1 |';
  const program = bindNativeAnswerText('root = Col([Markdown(_xroga_answer), Table(["Plan", "Seats"], [["Basic", 1]])])', text);
  const root = createParser(catalog.schema as LibraryJSONSchema, 'Col').parse(program).root;
  const matches = nativeMarkdownMatches(root, initialNativeValueReader(program));
  assert.ok(matches.documents.has(text));
  assert.equal(proseOutsideNativeDocuments(text, matches), '');
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, {text, nativeTables: matches.tables}));
  assert.match(html, /Basic includes one seat/);
  assert.match(html, /<ol/);
  assert.doesNotMatch(html, /<table/);
  const fallback = renderToStaticMarkup(createElement(MarkdownBlocks, {text}));
  assert.match(fallback, /<table/);
  assert.match(fallback, /Read the terms/);
});

test('native paragraphs match emphasis-only prose and unordered items without hiding distinct content', () => {
  const matches = nativeMarkdownMatches({ type: 'element', typeName: 'Col', props: { children: [
    { type: 'element', typeName: 'Text', props: { text: 'Basic costs $10/month.' } },
    { type: 'element', typeName: 'Text', props: { text: 'One person: Basic includes one seat.' } },
  ] } });
  const text = '**Basic** costs $10/month.\n\n- **One person:** Basic includes one seat.\n- Keep the unique limitation.\n- One person: Basic includes one seat. [1]\n\n1. One person: Basic includes one seat.\n\nBasic costs $11/month.';
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, { text, matches, renderCitation: () => 'Verified source' }));
  assert.doesNotMatch(html, /costs \$10/);
  assert.equal((html.match(/Basic includes one seat/g) ?? []).length, 2);
  assert.match(html, /Keep the unique limitation/);
  assert.match(html, /Verified source/);
  assert.match(html, /<ol/);
  assert.match(html, /costs \$11/);
});

test('empty comparison corners are cells and scrolling tables do not duplicate landmarks', () => {
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, {
    text: '| | Server | Client |\n|---|---|---|\n| Runs | Server | Browser |',
  }));
  assert.match(html, /<thead><tr><td><\/td><th scope="col">Server/);
  assert.match(html, /role="group" aria-label="Answer table" tabindex="0"/);
  assert.doesNotMatch(html, /<th[^>]*><\/th>/);
});

test('computed table snapshots collapse only exact resolved initial values', () => {
  const value = { k: 'Ref', n: 'amount' };
  const root = { type: 'element', typeName: 'Table', props: { columns: ['Payment'], rows: [[value]] } };
  const matches = nativeMarkdownMatches(root, initialNativeValueReader('amount = 405.53'));
  const duplicate = '| Payment |\n| --- |\n| 405.53 |';
  const distinct = '| Payment |\n| --- |\n| 333.33 |';
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, { text: duplicate + '\n\n' + distinct, matches }));
  assert.equal((html.match(/<table/g) ?? []).length, 1);
  assert.match(html, /333.33/);
  const failed = nativeMarkdownMatches(root, initialNativeValueReader('other = 1'));
  assert.match(renderToStaticMarkup(createElement(MarkdownBlocks, { text: duplicate, matches: failed })), /405.53/);
  assert.match(renderToStaticMarkup(createElement(MarkdownBlocks, { text: duplicate.replace('405.53 |', '405.53 [1] |'), matches })), /<table/);
});

test('interactive metrics suppress stale initial snapshots while fallback preserves them', () => {
  const root = { type: 'element', typeName: 'Metric', props: { label: 'Monthly payment', value: { k: 'Ref', n: 'amount' }, note: '60 equal payments' } };
  const text = 'Monthly payment: $405.53\n\n60 equal payments\n\nFees are excluded.';
  const matches = nativeMarkdownMatches(root, initialNativeValueReader('amount = "$405.53"'));
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, { text, matches }));
  assert.doesNotMatch(html, /405.53|60 equal payments/);
  assert.match(html, /Fees are excluded/);
  assert.match(renderToStaticMarkup(createElement(MarkdownBlocks, { text })), /405.53/);
});

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
  assert.match(html, /<code class="language-python">print\(25 \* 40\)<\/code>/);
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

test('a visible diagram suppresses its exact projected title and description while preserving distinct prose and the readable fallback', () => {
  const title = 'Lead intake';
  const description = 'Incomplete applications return to intake after the missing details arrive.';
  const text = [title, description, 'If the lead does not respond, archive the case.', description + ' [1]'].join('\n\n');
  const matches = nativeMarkdownMatches({ type: 'element', typeName: 'Diagram', props: {
    title, description,
    nodes: [{ id: 'intake', label: 'Intake' }, { id: 'missing', label: 'Missing details' }],
    links: [{ from: 'missing', to: 'intake' }],
  } });

  const rich = renderToStaticMarkup(createElement(MarkdownBlocks, { text, matches, renderCitation: number => 'Source ' + number }));
  assert.doesNotMatch(rich, /Lead intake|arrive\.<\/p>/);
  assert.match(rich, /archive the case/);
  assert.match(rich, /arrive\. Source 1/);

  const fallback = renderToStaticMarkup(createElement(MarkdownBlocks, { text }));
  assert.match(fallback, /Lead intake/);
  assert.match(fallback, /arrive\.<\/p>/);
});

test('a visible chart and checklist collapse only their exact readable duplicates', () => {
  const element = (typeName: string, props: Record<string, unknown>) => ({ type: 'element', typeName, props });
  const chart = element('Chart', {
    type: 'donut', data: [{ category: 'Fit', count: 50 }, { category: 'Other', count: 20 }], x: 'category', series: ['count'], currency: null,
  });
  const checks = element('Section', { title: 'Publishing', children: [
    element('Checkbox', { label: 'Test links', checked: false }), element('Checkbox', { label: 'Proofread', checked: true }),
  ] });
  const matches = nativeMarkdownMatches(element('Col', { children: [chart, checks] }));
  const duplicate = '| category | count |\n| --- | --- |\n| Fit | 50 |\n| Other | 20 |';
  const extended = '| category | count | Share |\n| --- | --- | --- |\n| Fit | 50 | 71% |\n| Other | 20 | 29% |';
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, {
    text: [duplicate, extended, '**Publishing**\n- [ ] Test links\n- [x] Proofread', '- Test links [1]\n- Proofread'].join('\n\n'),
    renderCitation: number => 'Source ' + number, matches,
  }));
  assert.equal((html.match(/<table/g) ?? []).length, 1);
  assert.equal((html.match(/<ul>/g) ?? []).length, 1);
  assert.match(html, /71%/);
  assert.match(html, /Source 1/);
  const visibleCards = nativeMarkdownMatches(element('Carousel', { children: [chart, checks] }));
  assert.doesNotMatch(renderToStaticMarkup(createElement(MarkdownBlocks, { text: duplicate, matches: visibleCards })), /<table\b/);
});

test('inline alternatives and native lists remove exact duplicates without dropping distinct or cited content', () => {
  const element = (typeName: string, props: Record<string, unknown>) => ({ type: 'element', typeName, props });
  const matches = nativeMarkdownMatches(element('Col', { children: [
    element('Tabs', { label: 'Choosing an approach', tabs: [
      { title: 'Server', content: [element('Text', { text: 'Authorize every query.' })] },
      { title: 'Client', content: [element('Text', { text: 'Keep tokens private.' })] },
    ] }),
    element('List', { items: [element('ListItem', { title: 'Server Actions', description: 'Validate inputs.' }), 'Review permissions.'] }),
  ] }));
  const text = ['Choosing an approach', '### Server', 'Authorize every query.', '### Client', 'Keep tokens private.',
    '- Server Actions: Validate inputs.\n- Review permissions.\n- Retain this distinct caveat.\n- Server Actions: Validate inputs. [1]',
    '1. Review permissions.\n2. Continue in this order.'].join('\n\n');
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, { text, matches, renderCitation: () => 'Verified source' }));
  assert.doesNotMatch(html, /Choosing an approach|Authorize every query|Keep tokens private/);
  assert.equal((html.match(/Server Actions/g) ?? []).length, 1);
  assert.match(html, /Retain this distinct caveat|Verified source/);
  assert.match(html, /<ol/);
  assert.match(html, /Continue in this order/);
});

test('draft fallback retains separated addresses and checklist details without repeating visible controls', () => {
  const element = (typeName: string, props: Record<string, unknown>) => ({ type: 'element', typeName, props });
  const matches = nativeMarkdownMatches(element('Col', { children: [
    element('Row', { children: [element('Badge', { text: 'Venue unconfirmed' })] }),
    element('Section', { title: 'Before sending', children: [
      element('Col', { children: [
        element('Checkbox', { label: 'Confirm the date' }),
        element('Checkbox', { label: 'Confirm the location' }),
      ] }),
    ] }),
  ] }));
  const text = [
    '> Hello,\n>\n> **Venue:** [Venue name]\n> City: [City]\n>\n> Regards,\n> [Name]',
    'Venue unconfirmed', '- Confirm the date', '- Confirm the location',
    '- Confirm the date [1]', '- Preserve this unique action',
  ].join('\n\n');
  const projected = renderToStaticMarkup(createElement(MarkdownBlocks, { text, matches, renderCitation: () => 'Verified source' }));
  assert.match(projected, /<p>Hello,<\/p><p><strong>Venue:<\/strong> \[Venue name\]\nCity: \[City\]<\/p><p>Regards,\n\[Name\]<\/p>/);
  assert.doesNotMatch(projected, /Venue unconfirmed|Confirm the location/);
  assert.match(projected, /Confirm the date Verified source/);
  assert.match(projected, /Preserve this unique action/);
  const fallback = renderToStaticMarkup(createElement(MarkdownBlocks, { text }));
  assert.match(fallback, /Venue unconfirmed/);
  assert.match(fallback, /Confirm the location/);
});

test('opening numerical headings preserve the sign while ignoring typography', () => {
  const title = { type: 'element', typeName: 'Title', props: { text: 'Cash flows: -$800, $0 and +$500' } };
  const { headingTitles } = nativeMarkdownMatches(title);
  const render = (heading: string) => renderToStaticMarkup(createElement(MarkdownBlocks, {
    text: '## ' + heading + '\n\nThe first flow is an outlay.',
    nativeHeadingTitles: headingTitles,
  }));
  assert.doesNotMatch(render('Cash flows: −$800, $0, +$500'), /role="heading"/);
  assert.match(render('Cash flows: +$800, $0, +$500'), /role="heading"/);
  assert.match(render('Cash flows: −$800, $0, +$500 [1]'), /role="heading"/);
});

test('Markdown tables preserve literal pipes and all columns', () => {
  const text = '| Expression | Expected |\n| --- | --- |\n| `number | null` | Use A \\| B |';
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, { text }));
  assert.equal((html.match(/<td>/g) ?? []).length, 2);
  assert.match(html, /<code class="iui-code">number \| null<\/code>/);
  assert.match(html, /<td>Use A \| B<\/td>/);
});

test('Markdown block order preserves quotes, list continuations, fenced table literals and verified links', () => {
  const url = 'https://example.com/reference';
  const table = '| Document | Link |\n| --- | --- |\n| Existing | [1](' + url + ') |';
  const text = ['> Keep this quote.', '', '- Inspect the item.', '  Confirm the tag.', '', '~~~markdown', table, '~~~', '', '## Verified reference', table].join('\n');
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, {
    text, renderCitation: (number, href) => number === 1 && href === url ? createElement('a', { href }, 'Source') : null,
  }));
  assert.match(html, /<blockquote[^>]*><p>Keep this quote\.<\/p><\/blockquote>/);
  assert.match(html, /<ul><li>Inspect the item\. Confirm the tag\.<\/li><\/ul>/);
  assert.equal((html.match(/<table\b/g) ?? []).length, 1);
  assert.match(html, /<th scope="col">Document<\/th>/);
  assert.match(html, /href="https:\/\/example.com\/reference"[^>]*>Source<\/a>/);
});

test('native table sections replace empty repeated headings while unique content and cited tables remain', () => {
  const title = 'Manual versus automated';
  const table = '| Stage | Owner |\n| --- | --- |\n| Intake | Coordinator |';
  const nativeTable = { type: 'element', typeName: 'Table', props: { columns: ['Stage', 'Owner'], rows: [['Intake', 'Coordinator']] } };
  const markdown = { type: 'element', typeName: 'Markdown', props: { text: '## ' + title + '\n\n' + table } };
  const section = { type: 'element', typeName: 'Section', props: { title, children: [nativeTable] } };
  const matches = nativeMarkdownMatches([markdown, section]);
  const render = (text: string) => renderToStaticMarkup(createElement(MarkdownBlocks, {
    text, nativeTables: matches.tables, nativeSectionTables: matches.sectionTables,
  }));

  assert.doesNotMatch(render(markdown.props.text), /Manual versus automated|<table/);
  assert.equal(matches.markdownSectionHeadings.size, 0);
  assert.match(render(markdown.props.text + '\n\nManual approval remains required.'), /Manual versus automated.*Manual approval remains required/);
  assert.match(render(markdown.props.text.replace('Coordinator |', 'Coordinator [1] |')), /Manual versus automated.*<table/);
  assert.match(render(markdown.props.text.replace(title, 'Intake ownership')), /Intake ownership/);
});

test('a bound Markdown heading remains the heading for a supplemental native section', () => {
  const text = [
    '## Opening title', '', 'Use the handoff procedure.',
    '', '## Closing checklist', '', 'Record who confirmed the handoff.',
    '', '## References [1]', '', 'Consult the current guide.',
  ].join('\n');
  const program = bindNativeAnswerText([
    'root = Col([Title("Opening title"), Markdown(_xroga_answer), checks, refs])',
    'checks = Section("Closing checklist", [Checkbox($filed, "File the handoff record")])',
    'refs = Section("References", [Text("Supporting notes")])',
    '$filed = false',
  ].join('\n'), text);
  const root = createParser(catalog.schema as LibraryJSONSchema, 'Col').parse(program).root;
  const matches = nativeMarkdownMatches(root, initialNativeValueReader(program));
  assert.deepEqual([...matches.markdownSectionHeadings], ['Closing checklist', 'References [1]']);
  const html = renderToStaticMarkup(createElement(MarkdownBlocks, {
    text, nativeHeadingTitles: matches.headingTitles, renderCitation: () => 'Verified source',
  }));
  assert.doesNotMatch(html, /Opening title/);
  assert.match(html, /Closing checklist<\/div><p>Record who confirmed the handoff\.<\/p>/);
  assert.match(html, /References Verified source/);
  assert.match(renderToStaticMarkup(createElement(MarkdownBlocks, { text })), /Opening title/);
});

test('bound Markdown retains the checklist heading and only hides an exact matching state and label sequence', () => {
  const heading = '## Closing checks\n\nBefore handing over, check the equipment and records.\n\n';
  const list = '- [ ] Turn off the tools.\n- [x] Record the handoff.';
  const program = bindNativeAnswerText([
    'root = Col([Markdown(_xroga_answer), checks])',
    'checks = Section("Closing checks", [Controls([Checkbox($tools, "Turn off the tools."), Checkbox($handoff, "Record the handoff.")], "Close the shop")])',
    '$tools = false',
    '$handoff = true',
  ].join('\n'), heading + list);
  const root = createParser(catalog.schema as LibraryJSONSchema, 'Col').parse(program).root;
  const matches = nativeMarkdownMatches(root, initialNativeValueReader(program));
  const render = (value: string, native = true, opening = heading) => renderToStaticMarkup(createElement(MarkdownBlocks, {
    text: opening + value,
    nativeChecklists: native ? matches.checklists : undefined,
    renderCitation: () => 'Verified source',
  }));

  const replaced = render(list);
  assert.match(replaced, /Closing checks<\/div>/);
  assert.match(replaced, /Before handing over, check the equipment and records/);
  assert.doesNotMatch(replaced, /<ul>|Turn off|Record the handoff/);
  assert.match(render(list, false), /Turn off the tools.*Record the handoff/);
  assert.match(render(list, true, '## Closing checks\n\n'), /Closing checks.*Turn off the tools.*Record the handoff/);
  assert.match(render(list.replace('[x]', '[ ]')), /Turn off the tools.*Record the handoff/);
  assert.match(render(list.split('\n').reverse().join('\n')), /Record the handoff.*Turn off the tools/);
  assert.match(render(list + '\n- [ ] Lock the door.'), /Turn off the tools.*Lock the door/);
  assert.match(render(list.replace('tools.', 'tools. [1]')), /Turn off the tools.*Verified source/);
  assert.match(render(list.replace('the handoff.', '[the handoff](https://example.com).')), /<ul>.*Turn off the tools.*Record the handoff/);
});

test('state-dependent Markdown cannot suppress a native heading', () => {
  const program = [
    'root = Col([Markdown($open ? "## Checklist" : "Hidden"), Section("Checklist", [Text("Review the items")])])',
    '$open = true',
  ].join('\n');
  const root = createParser(catalog.schema as LibraryJSONSchema, 'Col').parse(program).root;
  const matches = nativeMarkdownMatches(root, initialNativeValueReader(program));
  assert.ok(matches.documents.has('## Checklist'));
  assert.equal(matches.markdownSectionHeadings.size, 0);
});
