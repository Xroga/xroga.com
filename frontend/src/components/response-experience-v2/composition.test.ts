import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptResponseV2 } from './document';
import { composeResponseV2, flattenCompositionV2, layoutUnitV2 } from './composition';
import { specimensV2 } from './specimens';

function compose(content: string) {
  const result = adaptResponseV2({ id: 'message', content });
  assert.ok(result.supported);
  return composeResponseV2(result.document);
}

test('real generated paragraph-shaped component roles use the shared resource composition', () => {
  const content = '## Core Components and Their Roles\n\n**Next.js** serves as both the frontend framework and the application server.\n\n**Supabase** provides the PostgreSQL database, authentication, and row-level security (RLS).\n\n**Stripe** handles payment processing, subscription management, and billing events.\n\nAn ordinary explanation remains plain.\n\n**Stripe.evil.test** is a lookalike, not a resource.';
  const units = flattenCompositionV2(compose(content).parts);
  assert.equal(units.filter(unit => unit.role === 'resource').length, 3);
  assert.equal(units.map(unit => unit.node.kind === 'prose' ? unit.node.text : '').join(''), content);
  assert.equal(units.at(-1)?.role, 'narrative');
});

test('semantic hierarchy preserves exact source including whitespace and fenced heading lookalikes', () => {
  const content = '  Intro.\n\n# Title\n\nWords **unchanged**.\n\n## Part\n\n```md\n# not a heading\n```\n\n### Detail\n\n42.50 USD\n\n## Next\n\nنص عربي\n';
  const result = compose(content);
  const units = flattenCompositionV2(result.parts);
  assert.equal(units.map(unit => unit.node.kind === 'prose' ? unit.node.text : '').join(''), content);
  assert.equal(result.parts.length, 2);
  const title = result.parts[1]; assert.equal(title.type, 'section');
  if (title.type === 'section') {
    assert.equal(title.level, 1);
    assert.equal(title.children.filter(part => part.type === 'section').length, 2);
  }
  assert.equal(units.filter(unit => unit.role === 'code').length, 1);
  for (const unit of units) assert.equal(unit.node.kind === 'prose' && unit.node.text, content.slice(unit.range!.start, unit.range!.end));
});

test('reference definitions and footnotes retain document context without duplicate IDs', () => {
  for (const text of ['## A\n\n[Read][doc]\n\n## B\n\n[doc]: https://example.org/page', 'A[^1]\n\n## B\n\n[^1]: Full essential note.']) {
    const units = flattenCompositionV2(compose(text).parts);
    assert.equal(units.length, 1);
    assert.equal(units[0].node.kind === 'prose' && units[0].node.text, text);
  }
});

test('twelve distinct real adapter shapes retain node content and survive persisted reopening', () => {
  const names = ['greeting','travel','saas','essay','multilingual','code','math','sources','table','chart','calculator','diagram'];
  for (const name of names) {
    const message = specimensV2[name];
    const result = adaptResponseV2(message); assert.ok(result.supported, name);
    const reopened = adaptResponseV2(JSON.parse(JSON.stringify(message))); assert.ok(reopened.supported);
    const composition = composeResponseV2(result.document);
    assert.deepEqual(composition, composeResponseV2(reopened.document), name);
    const units = flattenCompositionV2(composition.parts);
    const text = units.filter(unit => unit.range).map(unit => unit.node.kind === 'prose' ? unit.node.text : '').join('');
    assert.equal(text, result.document.nodes.filter(node => node.kind === 'prose').map(node => node.text).join(''), name);
    for (const node of result.document.nodes.filter(node => node.kind !== 'prose')) assert.deepEqual(units.find(unit => unit.id === node.id)?.node, node, name);
  }
});

test('every streamed prefix preserves original text without claiming missing information', () => {
  const text = specimensV2.essay.content;
  for (let end = 1; end <= text.length; end += 11) {
    const prefix = text.slice(0, end);
    assert.equal(flattenCompositionV2(compose(prefix).parts).map(unit => unit.node.kind === 'prose' ? unit.node.text : '').join(''), prefix);
  }
});

test('sources are associated with actual claims and do not get a repeated footer', () => {
  const result = adaptResponseV2({ id:'claims', content:'Claim [1] [2].\n\n## Other\n\nDifferent claim [1].\n\n```text\n[3]\n```', webSources: [
    {title:'Page A',url:'https://example.com/a',snippet:''},
    {title:'Page A anchor',url:'https://example.com/a#claim',snippet:''},
    {title:'Page B',url:'https://example.com/b',snippet:''},
  ] }); assert.ok(result.supported);
  const resultPlan = composeResponseV2(result.document);
  assert.deepEqual(resultPlan.unplacedSourceKeys, ['https://example.com/b']);
  assert.equal(flattenCompositionV2(resultPlan.parts).filter(unit => unit.sourceKeys.includes('https://example.com/a')).length, 2);
});

test('container layout uses data shape, never travel or finance keywords', () => {
  const result = adaptResponseV2(specimensV2.table); assert.ok(result.supported);
  const unit = flattenCompositionV2(composeResponseV2(result.document).parts).find(unit => unit.node.kind === 'table')!;
  assert.equal(layoutUnitV2(unit, 390), 'wide');
  if (unit.node.kind !== 'table') throw new Error('missing table');
  const comparison = { ...unit, node: { ...unit.node, rows:[{plan:'A',cost:'Not quoted'}] } };
  assert.equal(layoutUnitV2(comparison,390), 'stacked-comparison');
  assert.equal(layoutUnitV2(comparison,880), 'wide');
});

test('chart/table relationship requires identical supplied data, not proximity', () => {
  const result = adaptResponseV2(specimensV2.chart); assert.ok(result.supported);
  const chart = result.document.nodes.find(node => node.kind === 'chart'); assert.ok(chart?.kind === 'chart');
  result.document.nodes.push({id:'between',kind:'prose',text:'Keep this explanation.'}, {id:'table',kind:'table',columns:[{key:'Sample',label:'Sample'},{key:'minutes',label:'Minutes'}],rows:chart.rows});
  assert.equal(flattenCompositionV2(composeResponseV2(result.document).parts).find(unit => unit.id === chart.id)?.relatedData, 'table');
  result.document.nodes.at(-1)!.id = 'changed';
  const table = result.document.nodes.at(-1)!;
  if (table.kind === 'table') table.rows = [{Sample:'A',minutes:999}];
  assert.equal(flattenCompositionV2(composeResponseV2(result.document).parts).find(unit => unit.id === chart.id)?.relatedData, undefined);
});

test('rich blocks remain in their authored section across stream block boundaries', () => {
  const result = adaptResponseV2({id:'sections', content:'Intro'}); assert.ok(result.supported);
  result.document.nodes = [
    {id:'a',kind:'prose',text:'## Comparison\n\nOriginal explanation.'},
    {id:'data',kind:'table',columns:[{key:'x',label:'Value'}],rows:[{x:3}]},
    {id:'b',kind:'prose',text:'### Interpretation\n\nKeep this text.\n\n## Conclusion\n\nDone.'},
  ];
  const parts = composeResponseV2(result.document).parts;
  assert.equal(parts.length,2);
  assert.equal(parts[0].type,'section');
  if(parts[0].type === 'section') {
    assert.equal(parts[0].children[1].id,'data');
    assert.equal(parts[0].children[2].type,'section');
  }
  assert.deepEqual(flattenCompositionV2(parts).map(u=>u.id), ['a:0','a:15','data','b:0','b:20','b:37','b:52']);
});

test('resource roles require authored leading links rather than topic words', () => {
  assert.equal(flattenCompositionV2(compose('- [React](https://react.dev/learn): UI\n- [Next.js](https://nextjs.org/docs): pages').parts)[0].role,'resource');
  assert.equal(flattenCompositionV2(compose('- Travel and finance\n- Ordinary text').parts)[0].role,'steps');
});

test('visible authored notes and section content place sources without a duplicate footer', () => {
  const result = adaptResponseV2({id:'notes',content:'Introduction',webSources:[{title:'A',url:'https://example.com/a',snippet:''}]}); assert.ok(result.supported);
  result.document.nodes.push({id:'notice',kind:'notice',tone:'info',text:'Supplied claim [1].'});
  assert.deepEqual(composeResponseV2(result.document).unplacedSourceKeys,[]);
});

test('a matching section title is displayed once without deleting source title data', () => {
  const result = adaptResponseV2({id:'titles',content:'## Component roles'}); assert.ok(result.supported);
  result.document.nodes.push({id:'roles',kind:'table',title:'Component roles',columns:[{key:'name',label:'Name'}],rows:[{name:'Next.js'}]});
  const unit = flattenCompositionV2(composeResponseV2(result.document).parts).find(u=>u.id==='roles')!;
  assert.equal(unit.suppressRepeatedTitle,true);
  assert.equal(unit.node.title,'Component roles');
  result.document.nodes[1].title='Different information';
  assert.equal(flattenCompositionV2(composeResponseV2(result.document).parts).find(u=>u.id==='roles')!.suppressRepeatedTitle,false);
});
