import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptResponseV2, boundedData, safeLinkV2, displayTitleV2 } from './document';
import { calculateV2, formulaV2, type CalculatorNode } from './calculations';
import { responseV2Access } from './access';
import { readFileSync } from 'node:fs';
import { specimensV2 } from './specimens';
import { enhanceAiResponse } from '@/lib/xrogaResponseDocument';
import { responseTextV2 } from './exportText';
import { resourceIdentityV2 } from './entityRegistry';
import { richShareSnapshot, readRichShareSnapshot } from './shareSnapshot';

test('captured cd5541 component roles retain all content, identities and Share data without inventing omitted sections', () => {
  // Genuine synthetic-account output from the failed production acceptance.
  // Replay is regression evidence, never a new generation or quality acceptance.
  const message = JSON.parse(readFileSync(new URL('./testdata/generated-saas-cd5541.json', import.meta.url), 'utf8'));
  const result = adaptResponseV2(message);
  assert.ok(result.supported);
  const roles = result.document.nodes.find(node => node.kind === 'cards');
  assert.ok(roles?.kind === 'cards');
  assert.equal(roles.items.length, 6);
  assert.deepEqual(roles.items.map(item => resourceIdentityV2(item.title, item.url, item.entityId)?.url), [
    'https://nextjs.org', 'https://supabase.com', 'https://supabase.com', 'https://supabase.com', 'https://stripe.com', 'https://stripe.com',
  ]);
  assert.equal(result.document.nodes.some(node => node.kind === 'table'), false, 'Rendering cannot invent the missing schema');
  const text = responseTextV2(message)!;
  for (const item of roles.items) {
    assert.ok(text.includes(item.title));
    assert.ok(text.includes(item.description!));
  }
  assert.deepEqual(adaptResponseV2(JSON.parse(JSON.stringify(message))), result);
  const snapshot = richShareSnapshot(message, text);
  assert.ok(snapshot);
  assert.deepEqual(readRichShareSnapshot(snapshot), JSON.parse(JSON.stringify({ text, document: result.document })));
  assert.equal(result.document.originalText, message.featureOutput.sourceText);
});

test('structured entity identity survives adapter and Share, while invalid identity metadata fails safely', () => {
  const featureOutput = { schemaVersion: 1, id: 'identity-output', status: 'completed', blocks: [{ schemaVersion: 1, id: 'roles', type: 'card-grid', cards: [{ id: 'payments', title: 'Stripe billing', entityId: 'Stripe', description: 'Authored role, not a verified action.' }] }] };
  const message = { id: 'identity-message', content: '', featureOutput };
  const adapted = adaptResponseV2(message);
  assert.ok(adapted.supported);
  const roles = adapted.document.nodes[0];
  assert.ok(roles.kind === 'cards');
  assert.equal(roles.items[0].entityId, 'Stripe');
  assert.deepEqual(readRichShareSnapshot(richShareSnapshot(message, responseTextV2(message)!)!).document, JSON.parse(JSON.stringify(adapted.document)));
  assert.equal(adaptResponseV2({ ...message, featureOutput: { ...featureOutput, blocks: [{ ...featureOutput.blocks[0], cards: [{ ...featureOutput.blocks[0].cards[0], entityId: 5 }] }] } }).supported, false);
});

test('real generated SaaS database block preserves the full ordered answer and export', () => {
  // Captured from the authorized synthetic new-chat run, not a quality-approved answer.
  const message = JSON.parse(readFileSync(new URL('./testdata/generated-saas-database.json', import.meta.url), 'utf8'));
  const result = adaptResponseV2(message);
  assert.ok(result.supported, result.supported ? '' : result.reason);
  assert.deepEqual(result.document.nodes.map(node => node.kind), ['prose', 'graph', 'prose', 'table', 'prose', 'timeline', 'prose']);
  assert.deepEqual(adaptResponseV2(JSON.parse(JSON.stringify(message))), result);
  assert.equal(result.document.originalText, message.featureOutput.sourceText);
  const table = result.document.nodes[3];
  assert.ok(table.kind === 'table');
  assert.deepEqual(table.rows, message.featureOutput.blocks[3].rows);
  assert.deepEqual(table.columns, message.featureOutput.blocks[3].columns);
  const exported = responseTextV2(message)!;
  assert.ok(exported);
  for (const node of result.document.nodes) {
    if (node.kind === 'prose') assert.ok(exported.includes(node.text));
    if (node.kind === 'graph') for (const vertex of node.nodes) assert.ok(exported.includes(vertex.label));
    if (node.kind === 'table') for (const row of node.rows) for (const value of Object.values(row)) assert.ok(exported.includes(String(value)));
  }
});

test('database presentation still rejects malformed cells and missing columns', () => {
  const message = JSON.parse(readFileSync(new URL('./testdata/generated-saas-database.json', import.meta.url), 'utf8'));
  for (const invalid of [{ columns: [] }, { rows: [{ value: { unsafe: true } }] }]) {
    const changed = structuredClone(message);
    Object.assign(changed.featureOutput.blocks[3], invalid);
    assert.equal(adaptResponseV2(changed).supported, false);
  }
});

test('generated prose, table and graph retain their positions across persistence and V2 adaptation', () => {
  const source = ['## Components', '| Component | Role |', '| --- | --- |', '| Next.js | UI |', '| Supabase | Storage |',
    '## Architecture', '```xroga-ui', JSON.stringify({ type: 'graph', nodes: [{ id: 'ui', label: 'Next.js' }, { id: 'db', label: 'Supabase' }], edges: [{ source: 'ui', target: 'db' }] }), '```',
    '## Conclusion', 'Original conclusion.'].join('\n');
  const enhanced = enhanceAiResponse(source, 'generated-test');
  const saved = JSON.parse(JSON.stringify({ id: 'generated-test', content: enhanced.content, featureOutput: enhanced.output }));
  const result = adaptResponseV2(saved);
  assert.ok(result.supported);
  assert.deepEqual(result.document.nodes.map(n => n.kind), ['prose', 'table', 'prose', 'graph', 'prose']);
  assert.equal(saved.featureOutput.sourceText, source);
  assert.equal(result.document.originalText, source);
  assert.equal(result.document.nodes.filter(n => n.kind === 'prose').map(n => n.text).join('\n\n'), enhanced.content);
  assert.deepEqual(adaptResponseV2(saved), adaptResponseV2({ ...saved, featureOutput: enhanced.output }));
});

test('invalid generated graph preserves the ordered answer and an explicit notice after reopening', () => {
  for (const graph of [
    { nodes: [], edges: [] },
    { nodes: [{ id: 'a', label: 'A' }], edges: [{ source: 'a', target: 'missing' }] },
    { nodes: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }], edges: [] },
    { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ source: 'a', target: 'b' }, { source: 'a', target: 'b' }] },
  ]) {
    const source = '## Architecture\nExplanation before.\n```xroga-ui\n' + JSON.stringify({ type: 'graph', ...graph }) + '\n```\nExplanation after.';
    const enhanced = enhanceAiResponse(source, 'invalid-graph');
    assert.equal(enhanced.output?.status, 'partial');
    const saved = JSON.parse(JSON.stringify({ id: 'invalid-graph', content: enhanced.content, featureOutput: enhanced.output }));
    const result = adaptResponseV2(saved);
    assert.ok(result.supported);
    assert.equal(result.document.originalText, source);
    assert.deepEqual(result.document.nodes.map(node => node.kind), ['prose', 'notice', 'prose']);
  }
});

test('incomplete generated visual is explicit, preserved and never executed', () => {
  const source = 'Explanation\n```xroga-ui\n{"type":"graph"';
  const enhanced = enhanceAiResponse(source, 'incomplete');
  assert.equal(enhanced.output?.sourceText, source);
  assert.equal(enhanced.output?.status, 'partial');
  const result = adaptResponseV2({ id: 'incomplete', content: enhanced.content, featureOutput: enhanced.output });
  assert.ok(result.supported);
  assert.deepEqual(result.document.nodes.map(n => n.kind), ['prose', 'notice']);
});
const output = (blocks: unknown[]) => ({ schemaVersion: 1, id: 'out', status: 'completed', blocks });
const block = { schemaVersion: 1, id: 'b' };
const input = (featureOutput?: unknown) => ({ id: 'm', content: '', featureOutput });
test('model-authored role cards and comparisons remain in V2 across save and reopen', () => {
  const source = ['Overview.', '```xroga-ui', JSON.stringify({type:'card-grid', cards:[{id:'app',title:'Next.js',url:'https://nextjs.org',description:'Application routes'},{id:'data',title:'Supabase',url:'https://supabase.com',description:'Private records'}]}), '```', 'Isolation assumptions.', '```xroga-ui', JSON.stringify({type:'comparison',options:[{id:'a',label:'Tenant A',metrics:{project:'A-only',shared:false}},{id:'b',label:'Tenant B',metrics:{project:'B-only',shared:false}}]}), '```', 'Complete conclusion.'].join('\n');
  const enhanced = enhanceAiResponse(source, 'roles');
  const result = adaptResponseV2(JSON.parse(JSON.stringify({id:'roles',content:enhanced.content,featureOutput:enhanced.output})));
  assert.ok(result.supported);
  assert.deepEqual(result.document.nodes.map(node=>node.kind),['prose','cards','prose','cards','prose']);
  const comparison = result.document.nodes[3];
  assert.ok(comparison.kind === 'cards');
  assert.equal(comparison.items[0].metrics?.shared,false);
  assert.equal(enhanced.output?.sourceText,source);
});

test('plain multilingual words, code, URLs and punctuation remain exact across streaming and saved reload', () => {
  const content = 'Hello — مرحبا اردو 👋\n\n```ts\nconst x = "<script>";\n```\nhttps://example.com/a?x=1';
  const live = adaptResponseV2({ id: 'm', content }, true);
  const saved = adaptResponseV2(JSON.parse(JSON.stringify({ id: 'm', content })), false);
  assert.ok(live.supported && saved.supported);
  assert.deepEqual(live.document.nodes, saved.document.nodes);
  assert.equal(saved.document.originalText, content);
  assert.equal(saved.document.nodes[0].kind, 'prose');
});
test('simple answers never infer charts or financial controls from keywords', () => {
  const result = adaptResponseV2({ id: 'm', content: 'Stocks, trading, weather and charts.' });
  assert.ok(result.supported); assert.equal(result.document.nodes.length, 1); assert.equal(result.document.nodes[0].kind, 'prose');
});
test('table numbers remain supplied values, no chart inference', () => {
  const result = adaptResponseV2(input(output([{ ...block, type: 'table', columns: [{ key: 'money', label: 'USD' }], rows: [{ money: 2 }, { money: null }] }])));
  assert.ok(result.supported); assert.equal(result.document.nodes[0].kind, 'table');
  assert.deepEqual((result.document.nodes[0] as { rows: unknown }).rows, [{ money: 2 }, { money: null }]);
});
test('unknown blocks, invalid payloads and approvals retain the original renderer', () => {
  for (const b of [{ ...block, type: 'new-widget' }, { ...block, type: 'approval', approval: { id: 'a', action: 'publish', title: 'Publish', status: 'requested' } }]) {
    assert.equal(adaptResponseV2(input(output([b]))).supported, false);
  }
  assert.equal(adaptResponseV2({ id: 'm', content: 'x'.repeat(200_001) }).supported, false);
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  assert.equal(boundedData(cycle), false);
  assert.equal(boundedData(JSON.parse('{"__proto__":{"admin":true}}')), false);
});
test('no duplicate stable IDs and no dangling graph edges', () => {
  const b = { ...block, type: 'narrative', text: 'same' };
  assert.equal(adaptResponseV2(input(output([b, b]))).supported, false);
  assert.equal(adaptResponseV2(input(output([{ ...block, type: 'graph', nodes: [{ id: 'one', label: 'One' }], edges: [{ source: 'one', target: 'missing' }] }]))).supported, false);
});
test('chart rejects string coercion, negative pie slices and ambiguous multiple scatter series', () => {
  const chart = { ...block, type: 'chart', chartType: 'line', xKey: 'x', series: [{ key: 'y', label: 'USD' }], data: [{ x: 'A', y: 12 }], summary: 'Supplied values' };
  const valid = adaptResponseV2(input(output([chart]))); assert.ok(valid.supported);
  assert.equal(adaptResponseV2(input(output([{ ...chart, data: [{ x: 'A', y: '12' }] }]))).supported, false);
  assert.equal(adaptResponseV2(input(output([{ ...chart, chartType: 'pie', data: [{ x: 'A', y: -12 }] }]))).supported, false);
});
test('unsafe links remain noninteractive', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,<script>', '//evil.com', 'https://u:pass@example.com', 'file:///a']) assert.equal(safeLinkV2(value), undefined);
  assert.equal(safeLinkV2('https://example.com/a?x=1'), 'https://example.com/a?x=1');
});
test('canonical internal review links remain usable without accepting alternate origins', () => {
  const review = '/dashboard/actions/confirm/11111111-1111-4111-8111-111111111111';
  assert.equal(safeLinkV2(review), review);
  for (const value of ['//evil.com', '/\\evil.com', '/%5cevil.com', '/%2fevil.com', '/\nevil.com']) assert.equal(safeLinkV2(value), undefined);
});
const calc: CalculatorNode = { kind: 'calculator', id: 'c', operation: 'percentage', inputs: [{ id: 'capital', label: 'Capital', value: 50000, min: 0, max: 100000 }, { id: 'risk', label: 'Risk percent', value: 1, min: 0, max: 5 }], resultLabel: 'Hypothetical risk', unit: 'USD', precision: 2 };
test('local calculator respects ranges, zero, missing and invalid values without eval', () => {
  assert.equal(calculateV2(calc, { capital: '50000', risk: '1' }), 500);
  assert.equal(calculateV2(calc, { capital: '50000', risk: '2' }), 1000);
  assert.equal(calculateV2(calc, { capital: '0', risk: '1' }), 0);
  for (const risk of ['', '6', 'Infinity', 'alert(1)']) assert.equal(calculateV2(calc, { capital: '50000', risk }), null);
  assert.equal(calculateV2({ ...calc, operation: 'quotient' }, { capital: '1', risk: '0' }), null);
});
test('visible calculation follows edited values and refuses invalid results', () => {
  const revenue: CalculatorNode = { ...calc, operation: 'product', inputs: [{id:'price',label:'Price',value:25,min:0,unit:'USD'},{id:'quantity',label:'Quantity',value:40,min:0}] };
  assert.equal(calculateV2(revenue, {price:'23',quantity:'4'}), 92);
  assert.equal(formulaV2(revenue, {price:'23',quantity:'4'}), '23 × 4');
  assert.equal(formulaV2(calc, {capital:'50000',risk:'1'}), '50000 × 1 ÷ 100');
  assert.equal(formulaV2(revenue, {price:'',quantity:'4'}), null);
  assert.equal(formulaV2({...revenue,operation:'quotient'}, {price:'23',quantity:'0'}), null);
});
test('server flag, opt-in, confirmed founder role and MFA all required', async () => {
  const deps = { getUser: async () => ({ id: 'owner', email: 'hello@xroga.com', email_confirmed_at: '2026-01-01' }), getRole: async () => 'owner', getAal: async () => 'aal2' };
  assert.equal(await responseV2Access(true, true, deps), true);
  assert.equal(await responseV2Access(false, true, deps), false);
  assert.equal(await responseV2Access(true, false, deps), false);
  assert.equal(await responseV2Access(true, true, { ...deps, getRole: async () => 'member' }), false);
  assert.equal(await responseV2Access(true, true, { ...deps, getAal: async () => 'aal1' }), false);
});
test('new canvas does not import legacy renderers and scoped tokens retain responsive and motion rules', () => {
  const css = readFileSync(new URL('./response-v2.module.css', import.meta.url), 'utf8');
  assert.match(css, /70ch/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /max-width:640px/);
  for (const file of ['ResponseCanvasV2.tsx', 'ProseV2.tsx', 'DataV2.tsx', 'InteractiveV2.tsx']) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /FormattedAiMarkdown|XrogaBlockView|fetch\(|apiFetch\(/);
  }
});
test('review specimens use real adapter paths and malformed samples fail closed', () => {
  for (const [name, message] of Object.entries(specimensV2)) assert.equal(adaptResponseV2(message).supported, name !== 'malformed', name);
});
test('progress is never clamped into a fabricated valid result', () => {
  assert.equal(adaptResponseV2(input(output([{ ...block, type: 'progress', progress: { id: 'p', label: 'Files', value: 101, max: 100 } }]))).supported, false);
});
test('aggregate text payload is bounded', () => {
  assert.equal(boundedData(Array(20).fill('x'.repeat(200_000))), false);
});

test('different canonical chat text cannot be silently discarded', () => {
  const message = { id: 'different', content: 'Partial answer', featureOutput: { type: 'chat', content: 'Complete answer with additional facts' } };
  assert.equal(adaptResponseV2(message).supported, false);
});


test('only generated captions are suppressed, source titles are preserved', () => {
  for (const title of ['Data table 1', 'Chart 2', 'Widget 3', 'Untitled block']) assert.equal(displayTitleV2(title), undefined);
  assert.equal(displayTitleV2('Monthly operating costs'), 'Monthly operating costs');
});

test('customer message path never imports a synthetic review panel', () => {
  const source = readFileSync(new URL('../terminal/SwarmMessageLog.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source,/ResponseExperienceReview|ReviewPanelV2|specimensV2/);
  const gate = readFileSync(new URL('./ResponseExperienceGate.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(gate,/ReviewPanelV2|specimensV2/);
});


test('released read-only presentation supports authenticated users without privileged role grants', async () => {
  const { responseV2Audience } = await import('./access');
  assert.equal(responseV2Audience('authenticated', 'member'), true);
  assert.equal(responseV2Audience('authenticated', null), false);
  assert.equal(responseV2Audience('canary', 'member', ' other, member '), true);
  assert.equal(responseV2Audience('canary', 'member', 'other'), false);
  for (const mode of [undefined, 'off', 'true', 'founder']) assert.equal(responseV2Audience(mode, 'member', 'member'), false);
});

test('essential answer sections and tables are not hidden in disclosure controls', () => {
  const canvas = readFileSync(new URL('./ResponseCanvasV2.tsx', import.meta.url), 'utf8');
  const interactions = readFileSync(new URL('./InteractiveV2.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(canvas.slice(0, canvas.indexOf('references.length > 0')), /<details|View source data/);
  assert.match(canvas, /<ResponseSources sources=\{references\}/);
  // Tabs switch between alternative views, like any tab widget, and nothing else may be hidden. Every panel stays in the page
  // (so assistive technology, keyboard users, Copy and export all reach it) and `hidden` is allowed only on a tab panel.
  assert.doesNotMatch(interactions, /node\.items\[selected\]/);
  assert.match(interactions, /role="tablist"/);
  assert.match(interactions, /node\.items\.map/);
  const hiddenUses = interactions.match(/hidden=/g) ?? [];
  assert.equal(hiddenUses.length, 1);
  assert.match(interactions, /role="tabpanel"[^>]*hidden=\{index !== active\}/);
});

test('source-backed resources preserve supplied evidence without inventing price or availability', () => {
  const item = { id: 'resource', domain: 'business', kind: 'reference', title: 'Official reference', status: 'search-result', source: { title: 'Documentation', url: 'https://example.com/docs' }, summary: 'Supplied summary' };
  const result = adaptResponseV2(input(output([{ ...block, type: 'rich-results', items: [item] }])));
  assert.ok(result.supported);
  const node = result.document.nodes[0];
  assert.equal(node.kind, 'resources');
  if (node.kind === 'resources') {
    assert.deepEqual(node.items[0], item);
    assert.equal(node.items[0].price, undefined);
    assert.equal(node.items[0].availabilityEvidence, undefined);
  }
  assert.equal(adaptResponseV2(input(output([{ ...block, type: 'rich-results', items: [{ ...item, source: undefined }] }]))).supported, false);
});

test('image captions and source lists survive adaptation and persisted reload', () => {
  const message = input(output([{ ...block, type: 'image', image: { id: 'image', label: 'Supplied image', url: 'https://example.com/image.png', caption: 'Original caption' } }, { ...block, id: 'sources', type: 'source-list', sources: [{ id: 's', title: 'Source title', url: 'https://example.com/source', excerpt: 'Original excerpt', publishedAt: '2026-01-01' }] }]));
  const live = adaptResponseV2(message, true);
  const saved = adaptResponseV2(JSON.parse(JSON.stringify(message)));
  assert.ok(live.supported && saved.supported);
  assert.deepEqual(live.document.nodes, saved.document.nodes);
  assert.equal(saved.document.nodes[0].kind, 'images');
  assert.equal(saved.document.nodes[1].description, '2026-01-01');
});

test('metric tiles keep their meaning: a gain is positive, a loss is negative, anything else stays neutral', () => {
  const metrics = [
    { id: 'a', label: 'Max profit', value: '$350', trend: 'up' },
    { id: 'b', label: 'Max loss', value: '$9,650', trend: 'down' },
    { id: 'c', label: 'Ratio', value: '2.4 : 1', trend: 'flat' },
    { id: 'd', label: 'Shares', value: '20' },
  ];
  const fence = ['```xroga-ui', JSON.stringify({ id: 's1', type: 'metric-group', metrics }), '```'].join('\n');
  const enhanced = enhanceAiResponse(['Result', fence].join('\n'), 'metrics-tone');
  const result = adaptResponseV2({ id: 'metrics-tone', content: enhanced.content, featureOutput: enhanced.output });
  assert.ok(result.supported);
  const node = result.document.nodes.find(item => item.kind === 'metrics');
  assert.ok(node && node.kind === 'metrics');
  assert.deepEqual(node.items.map(item => [item.label, item.tone]), [['Max profit', 'positive'], ['Max loss', 'negative'], ['Ratio', undefined], ['Shares', undefined]]);
});
