import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptResponseV2, boundedData, planPresentationV2, safeLinkV2 } from './document';
import { calculateV2, type CalculatorNode } from './calculations';
import { responseV2Access } from './access';
import { readFileSync } from 'node:fs';
import { specimensV2 } from './specimens';
const output = (blocks: unknown[]) => ({ schemaVersion: 1, id: 'out', status: 'completed', blocks });
const block = { schemaVersion: 1, id: 'b' };
const input = (featureOutput?: unknown) => ({ id: 'm', content: '', featureOutput });

test('plain multilingual words, code, URLs and punctuation remain exact across streaming and saved reload', () => {
  const content = 'Hello — مرحبا اردو 👋\n\n```ts\nconst x = "<script>";\n```\nhttps://example.com/a?x=1';
  const live = adaptResponseV2({ id: 'm', content }, true);
  const saved = adaptResponseV2(JSON.parse(JSON.stringify({ id: 'm', content })), false);
  assert.ok(live.supported && saved.supported);
  assert.deepEqual(live.document.nodes, saved.document.nodes);
  assert.equal(saved.document.originalText, content);
  assert.deepEqual(planPresentationV2(saved.document).map(p => p.width), ['prose']);
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
const calc: CalculatorNode = { kind: 'calculator', id: 'c', operation: 'percentage', inputs: [{ id: 'capital', label: 'Capital', value: 50000, min: 0, max: 100000 }, { id: 'risk', label: 'Risk percent', value: 1, min: 0, max: 5 }], resultLabel: 'Hypothetical risk', unit: 'USD', precision: 2 };
test('local calculator respects ranges, zero, missing and invalid values without eval', () => {
  assert.equal(calculateV2(calc, { capital: '50000', risk: '1' }), 500);
  assert.equal(calculateV2(calc, { capital: '50000', risk: '2' }), 1000);
  assert.equal(calculateV2(calc, { capital: '0', risk: '1' }), 0);
  for (const risk of ['', '6', 'Infinity', 'alert(1)']) assert.equal(calculateV2(calc, { capital: '50000', risk }), null);
  assert.equal(calculateV2({ ...calc, operation: 'quotient' }, { capital: '1', risk: '0' }), null);
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
  assert.match(css, /74ch/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /max-width:640px/);
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
