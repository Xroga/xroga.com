import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationProjection, type PresentationPlan } from '../../../backend/src/ai/responsePresentation';
import { enhanceAiResponse } from './xrogaResponseDocument';
import { parseXrogaOutput } from './xrogaBlocks';
import { adaptResponseV2 } from '../components/response-experience-v2/document';
import { calculateV2, formulaV2 } from '../components/response-experience-v2/calculations';
import { responseTextV2 } from '../components/response-experience-v2/exportText';
import { richShareSnapshot, readRichShareSnapshot } from '../components/response-experience-v2/shareSnapshot';

// Offline contract integration. These are supplied synthetic observations, not
// fresh model answers, retrieved sources, a production run or factual acceptance.
test('backend projection reaches actual Workspace blocks, interactions, reopening, Copy and Share in source order', () => {
  const kinds = ['prose', 'cards', 'graph', 'table', 'steps', 'calculator', 'chart'] as const;
  const plan: PresentationPlan = kinds.map(kind => ({ kind, heading: `Supplied ${kind}`, instruction: 'Preserve the supplied data.' }));
  const values = {
    s0: { markdown: 'Keep `tenant_id` and \\(25 \\times 40 = 1000\\). مرحبا.', data: null },
    s1: { markdown: 'These roles are supplied.', data: { cards: [{ title: 'Next.js', subtitle: 'Application', description: 'Validate server-owned membership.' }, { title: 'Supabase', subtitle: 'Data', description: 'Apply tenant policies.' }] } },
    s2: { markdown: 'These are explanatory relationships.', data: { nodes: [{ id: 'app', label: 'Application' }, { id: 'db', label: 'Database' }], edges: [{ id: 'query', source: 'app', target: 'db', label: 'Authorized query' }] } },
    s3: { markdown: 'Supplied fields.', data: { columns: ['Field', 'Role'], rows: [['tenant_id', 'Scope'], ['user_id', 'Identity']] } },
    s4: { markdown: 'Proposed steps, no action was performed.', data: { steps: [{ title: 'Verify', description: 'Check current membership.' }, { title: 'Read', description: 'Read the authorized record.' }] } },
    s5: { markdown: 'Hypothetical revenue: ticket price × tickets.', data: { operation: 'product', inputs: [{ id: 'price', label: 'Ticket price', value: 25, unit: 'USD', min: 0, max: 100, step: 1 }, { id: 'tickets', label: 'Tickets', value: 40, unit: 'tickets', min: 0, max: 200, step: 1 }], resultLabel: 'Revenue', resultUnit: 'USD', precision: 2, derivedResults: null } },
    s6: { markdown: 'Reference data at the original 25 USD price.', data: { chartType: 'bar', xLabel: 'Tickets', series: [{ label: 'Revenue', unit: 'USD' }], data: [{ x: 20, values: [500] }, { x: 40, values: [1000] }, { x: 60, values: [1500] }] } },
  };
  const raw = JSON.stringify(values), stream = createPresentationProjection(plan);
  let streamed = '';
  for (let i = 0; i < raw.length; i += 13) streamed += stream.append(raw.slice(i, i + 13));
  const result = stream.finish(raw);
  assert.equal(result.ok, true);
  assert.equal(result.response, streamed);
  const enhanced = enhanceAiResponse(result.response, 'generated-contract', { status: 'complete' }, { format: 'xroga-response-json-v1', text: raw });
  const output = parseXrogaOutput(JSON.parse(JSON.stringify(enhanced.output)));
  assert.ok(output);
  assert.equal(output.status, 'completed');
  assert.equal(output.responseSource?.text, raw);
  assert.deepEqual(output.blocks.filter(block => block.type !== 'narrative').map(block => block.type), ['card-grid', 'graph', 'table', 'steps', 'calculator', 'chart']);
  assert.equal(output.blocks.some(block => block.type === 'notice'), false);

  const input = { id: 'generated-contract', content: enhanced.content, featureOutput: output };
  const adapted = adaptResponseV2(input);
  assert.equal(adapted.supported, true);
  const calc = adapted.document.nodes.find(node => node.kind === 'calculator');
  assert.ok(calc?.kind === 'calculator');
  assert.equal(calculateV2(calc, { price: '25', tickets: '40' }), 1000);
  assert.equal(calculateV2(calc, { price: '30', tickets: '40' }), 1200);
  assert.equal(calculateV2(calc, { price: '25', tickets: '40' }), 1000, 'Reset uses the original inputs');
  assert.match(formulaV2(calc, { price: '25', tickets: '40' })!, /25.*40/);
  const chart = adapted.document.nodes.find(node => node.kind === 'chart');
  assert.ok(chart?.kind === 'chart');
  assert.deepEqual(chart.rows.map(row => row.v0), [500, 1000, 1500], 'Fixed reference data does not change with the calculator');

  const copied = responseTextV2(input)!;
  assert.match(copied, /tenant_id/);
  assert.match(copied, /Application → Database: Authorized query/);
  assert.match(copied, /Revenue: 1000\.00 USD/);
  assert.ok(copied.indexOf('Supplied graph') < copied.indexOf('Supplied table'));
  const shared = readRichShareSnapshot(richShareSnapshot(input, copied)!);
  assert.equal(shared.text, copied);
  assert.deepEqual(shared.document?.nodes, JSON.parse(JSON.stringify(adapted.document.nodes)));
  assert.equal(shared.document?.streaming, false);
});
