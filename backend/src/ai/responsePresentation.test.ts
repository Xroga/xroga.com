import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresentationProjection, presentationPlanSchema, presentationRequestInstructions, presentationResponseFormat, type PresentationPlan } from './responsePresentation.js';
import {publicCompletionState} from './completionDiagnostics.js';

const plan: PresentationPlan = [
  { kind: 'prose', heading: 'Explanation', instruction: 'Preserve supplied facts and code.' },
  { kind: 'graph', heading: 'Relationships', instruction: 'Use supplied component relationships.' },
  { kind: 'table', heading: 'Records', instruction: 'Use supplied fields.' },
];
const values = {
  s0: { markdown: 'Keep `tenant_id` and \\(25 \\times 40 = 1000\\).\n\nمرحبا. A brace } and a quote " stay intact.', data: null },
  s1: { markdown: 'The request reaches the application.', data: { nodes: [{ id: 'client', label: 'Client' }, { id: 'server', label: 'Server' }], edges: [{ id: 'request', source: 'client', target: 'server', label: 'Request' }] } },
  s2: { markdown: 'These fields were supplied.', data: { columns: ['Field', 'Purpose'], rows: [['tenant_id', 'Tenant scope'], ['user_id', 'User identity']] } },
};

test('the same answer schema requires every planned section without domain-specific examples', () => {
  const format = presentationResponseFormat(plan);
  assert.deepEqual(format.json_schema.schema.required, ['s0', 's1', 's2']);
  assert.equal(format.json_schema.strict, true);
  assert.equal(format.json_schema.schema.additionalProperties, false);
  assert.throws(() => presentationPlanSchema.parse([{ ...plan[0], kind: 'execute', authority: 'admin' }]));
  assert.throws(() => presentationResponseFormat([]));
});

test('answer instructions avoid duplicate schemas and server-only coverage IDs while retaining the strict SDK contract', () => {
  const covered = plan.map(section => ({ ...section, covers: ['server-coverage-id'] }));
  const instruction = presentationRequestInstructions(covered, { includeSchema: false });
  assert.match(instruction, /supplied response_format schema/);
  for (const section of plan) { assert.ok(instruction.includes(section.heading)); assert.ok(instruction.includes(section.instruction)); }
  assert.doesNotMatch(instruction, /server-coverage-id|JSON schema:|additionalProperties/);
  assert.deepEqual(presentationResponseFormat(covered), presentationResponseFormat(plan));
});

test('streaming every character publishes ordered complete sections and retains the full original', () => {
  const raw = JSON.stringify(values), projection = createPresentationProjection(plan);
  let streamed = '';
  for (const character of raw) streamed += projection.append(character);
  const final = projection.finish(raw);
  assert.equal(final.ok, true);
  assert.equal(final.original, raw);
  assert.equal(final.response, streamed);
  assert.ok(final.response.includes(values.s0.markdown));
  assert.ok(final.response.includes('tenant_id'));
  assert.ok(final.response.indexOf('## Relationships') < final.response.indexOf('## Records'));
  assert.match(final.response, /"source":"client","target":"server"/);
  assert.match(final.response, /"c0":"tenant_id","c1":"Tenant scope"/);
});

test('omitted sections, duplicate keys, truncated streams and invalid graph references cannot pass', () => {
  for (const raw of [
    JSON.stringify({ s0: values.s0, s1: values.s1 }),
    JSON.stringify(values).slice(0, -1),
    JSON.stringify(values).replace('"target":"server"', '"target":"missing"'),
    JSON.stringify(values).replace('"s1":', `"s0":${JSON.stringify(values.s0)},"s1":`),
    JSON.stringify({ ...values, injected: { html: '<script>run()</script>' } }),
  ]) {
    const projection = createPresentationProjection(plan);
    projection.append(raw);
    const result = projection.finish(raw);
    assert.equal(result.ok, false, raw);
    assert.equal(result.original, raw);
  }
});

test('out-of-order JSON properties wait for the explicit reading order, with no retraction', () => {
  const raw = JSON.stringify({ s2: values.s2, s0: values.s0, s1: values.s1 });
  const projection = createPresentationProjection(plan);
  let streamed = '';
  for (let i = 0; i < raw.length; i += 7) streamed += projection.append(raw.slice(i, i + 7));
  const result = projection.finish(raw);
  assert.equal(result.ok, true);
  assert.equal(streamed, result.response);
  assert.ok(result.response.indexOf('## Explanation') < result.response.indexOf('## Relationships'));
});

test('calculator and fixed chart data project to the existing data-only controls without inference', () => {
  const p: PresentationPlan = [{ kind: 'calculator', heading: 'Your scenario', instruction: 'Use supplied values.' }, { kind: 'chart', heading: 'Fixed reference', instruction: 'Keep the supplied reference price.' }];
  const raw = JSON.stringify({
    s0: { markdown: '25 × 40 = 1,000 USD.', data: { operation: 'product', inputs: [{ id: 'price', label: 'Ticket price', value: 25, unit: 'USD', min: 0, max: 100, step: 1 }, { id: 'tickets', label: 'Tickets', value: 40, unit: 'tickets', min: 0, max: 200, step: 1 }], resultLabel: 'Revenue', resultUnit: 'USD', precision: 2, derivedResults: null } },
    s1: { markdown: 'Fixed 25 USD per ticket.', data: { chartType: 'bar', xLabel: 'Tickets', series: [{ label: 'Revenue', unit: 'USD' }], data: [{ x: 20, values: [500] }, { x: 40, values: [1000] }, { x: 60, values: [1500] }] } },
  });
  const result = createPresentationProjection(p).finish(raw);
  assert.equal(result.ok, true);
  assert.match(result.response, /"type":"calculator"/);
  assert.match(result.response, /"type":"chart"/);
  assert.match(result.response, /"x":60,"v0":1500/);
  assert.equal(/"status":"(?:completed|confirmed)"/.test(result.response), false);
  const outOfRange = createPresentationProjection(p).finish(raw.replace('"value":40', '"value":4000'));
  assert.equal(outOfRange.ok, true, 'a bound that contradicts the value is dropped, the calculator is kept');
  const block = JSON.parse(outOfRange.response.split('```xroga-ui')[1].split('```')[0].trim());
  assert.equal(block.inputs.find((input: { id: string }) => input.id === 'tickets').value, 4000);
  assert.equal(block.inputs.find((input: { id: string }) => input.id === 'tickets').min, undefined, 'no slider bounds remain for that input');
});

test('authored visual descriptions cannot evade the existing authorization warning', () => {
  const p: PresentationPlan = [{ kind: 'cards', heading: 'Boundary', instruction: 'Explain the permission boundary.' }];
  const raw = JSON.stringify({ s0: { markdown: 'An explanation.', data: { cards: [{ title: 'Database', subtitle: 'Boundary', description: 'The service role enforces tenant RLS.' }] } } });
  const result = createPresentationProjection(p).finish(raw);
  assert.equal(result.ok, true, 'Shape validation does not certify factual safety');
  assert.deepEqual(publicCompletionState('stop', result.reviewText), { status: 'partial', reason: 'authorization_review' });
});

test('invalid quantitative controls retain their source without publishing an unusable calculator', () => {
  const p: PresentationPlan = [{ kind: 'calculator', heading: 'Scenario', instruction: 'Use supplied values.' }];
  const data = { operation: 'product', inputs: [{ id: 'price', label: 'Price', value: 25, unit: 'USD', min: 0, max: 100, step: 1 }], resultLabel: 'Result', resultUnit: 'USD', precision: 2, derivedResults: null };
  for (const changed of [
    { ...data, operation: 'quotient' },
    { ...data, inputs: [{ ...data.inputs[0], id: '$result' }] },
    { ...data, derivedResults: [{ id: 'derived', label: 'Derived', operation: 'sum', operands: ['missing'], rounding: null, unit: 'USD', precision: 2 }] },
  ]) {
    const raw = JSON.stringify({ s0: { markdown: 'Supplied scenario.', data: changed } });
    const projection = createPresentationProjection(p);
    assert.equal(projection.append(raw), '');
    const final = projection.finish(raw);
    assert.equal(final.ok, false);
    assert.equal(final.original, raw);
    assert.match(final.response, /Supplied scenario/);
    assert.match(final.response, /could not be validated/);
    assert.doesNotMatch(final.response, /```xroga-ui/);
  }
});

test('output budget scales with the planned sections and never exceeds the existing ceiling', async () => {
  const { presentedAnswerMaxTokens } = await import('./responsePresentation.js');
  const section = (kind: 'prose' | 'graph' | 'table' | 'cards' | 'steps', i: number) => ({ kind, heading: `H${i}`, instruction: 'x' });
  assert.equal(presentedAnswerMaxTokens(undefined), 4096);
  assert.equal(presentedAnswerMaxTokens([]), 4096);
  assert.equal(presentedAnswerMaxTokens([section('prose', 1)]), 4096);
  const saas = [section('prose', 1), section('graph', 2), section('cards', 3), section('table', 4), section('steps', 5)];
  const budget = presentedAnswerMaxTokens(saas);
  assert.ok(budget > 4096 && budget <= 8192, String(budget));
  assert.equal(budget % 512, 0);
  assert.equal(presentedAnswerMaxTokens(Array.from({ length: 8 }, (_, i) => section('graph', i))), 8192);
});

test('a table, diagram or step list with no extra text is a complete section; only prose needs words', () => {
  const plan: PresentationPlan = [
    { kind: 'prose', heading: 'Short answer', instruction: 'One or two sentences.', covers: [] },
    { kind: 'table', heading: 'Comparison', instruction: 'Compare the options.', covers: [] },
    { kind: 'steps', heading: 'Steps', instruction: 'The ordered steps.', covers: [] },
  ];
  const raw = JSON.stringify({
    s0: { markdown: 'Use PostgreSQL for most small SaaS products.', data: null },
    s1: { markdown: '', data: { columns: ['Database', 'Concurrency'], rows: [['PostgreSQL', 'MVCC'], ['SQLite', 'Single writer']] } },
    s2: { markdown: '', data: { steps: [{ title: 'Pick', description: 'Start with managed PostgreSQL.' }, { title: 'Review', description: 'Revisit at scale.' }] } },
  });
  const projection = createPresentationProjection(plan);
  const final = projection.finish(raw);
  assert.equal(final.ok, true);
  assert.match(final.response, /"c0":"PostgreSQL","c1":"MVCC"/);
  assert.match(final.response, /"type":"steps"/);
  const emptyProse = JSON.stringify({ s0: { markdown: '  ', data: null }, s1: { markdown: '', data: { columns: ['A', 'B'], rows: [['x', 'y']] } }, s2: { markdown: '', data: { steps: [{ title: 'a', description: 'b' }, { title: 'c', description: 'd' }] } } });
  assert.equal(createPresentationProjection(plan).finish(emptyProse).ok, false);
});

test('metrics and tabs project to the existing blocks, with tone as trend, and bad shapes are refused', () => {
  const plan: PresentationPlan = [
    { kind: 'prose', heading: 'Short answer', instruction: 'Answer.', covers: [] },
    { kind: 'metrics', heading: 'Headline numbers', instruction: 'Profit, loss and ratio.', covers: [] },
    { kind: 'tabs', heading: 'Strategies', instruction: 'Alternative strategies.', covers: [] },
  ];
  const ok = JSON.stringify({
    s0: { markdown: 'The setup risks $5 to make $12.', data: null },
    s1: { markdown: '', data: { metrics: [
      { label: 'Max profit', value: '$350', unit: '', tone: 'positive' },
      { label: 'Max loss', value: '$9,650', unit: '', tone: 'negative' },
      { label: 'Reward-to-risk', value: '2.4 : 1', unit: '', tone: 'neutral' },
    ] } },
    s2: { markdown: '', data: { tabs: [{ label: 'Theta', content: 'Premium selling.' }, { label: 'Gamma', content: 'Directional spreads.' }] } },
  });
  const final = createPresentationProjection(plan).finish(ok);
  assert.equal(final.ok, true);
  assert.match(final.response, /"type":"metric-group"/);
  assert.match(final.response, /"label":"Max profit","value":"\$350","trend":"up"/);
  assert.match(final.response, /"label":"Max loss","value":"\$9,650","trend":"down"/);
  assert.match(final.response, /"label":"Reward-to-risk","value":"2\.4 : 1","trend":"flat"/);
  assert.match(final.response, /"type":"tabs"/);
  assert.match(final.response, /"label":"Gamma","content":"Directional spreads\."/);
  // One metric or one tab is not a comparison; an unknown tone or empty tab text is invalid.
  const oneMetric = JSON.stringify({ s0: { markdown: 'x', data: null }, s1: { markdown: '', data: { metrics: [{ label: 'A', value: '1', unit: '', tone: 'neutral' }] } }, s2: { markdown: '', data: { tabs: [{ label: 'A', content: 'a' }, { label: 'B', content: 'b' }] } } });
  assert.equal(createPresentationProjection(plan).finish(oneMetric).ok, false);
  const badTone = JSON.stringify({ s0: { markdown: 'x', data: null }, s1: { markdown: '', data: { metrics: [{ label: 'A', value: '1', unit: '', tone: 'great' }, { label: 'B', value: '2', unit: '', tone: 'neutral' }] } }, s2: { markdown: '', data: { tabs: [{ label: 'A', content: 'a' }, { label: 'B', content: 'b' }] } } });
  assert.equal(createPresentationProjection(plan).finish(badTone).ok, false);
  const emptyTab = JSON.stringify({ s0: { markdown: 'x', data: null }, s1: { markdown: '', data: { metrics: [{ label: 'A', value: '1', unit: '', tone: 'neutral' }, { label: 'B', value: '2', unit: '', tone: 'neutral' }] } }, s2: { markdown: '', data: { tabs: [{ label: 'A', content: '' }, { label: 'B', content: 'b' }] } } });
  assert.equal(createPresentationProjection(plan).finish(emptyTab).ok, false);
  const schema = JSON.stringify(presentationResponseFormat(plan));
  assert.match(schema, /"tone"/);
  assert.match(schema, /"positive","negative","neutral"/);
});

test('card and step icons pass through only from the approved Lucide list', () => {
  const p: PresentationPlan = [{ kind: 'cards', heading: 'Options', instruction: 'Compare.' }, { kind: 'steps', heading: 'Plan', instruction: 'Order.' }];
  const body = (icon: string | null) => JSON.stringify({
    s0: { markdown: 'Options.', data: { cards: [{ title: 'House', subtitle: '3 bed', description: 'Detached home.', entityId: null, icon }] } },
    s1: { markdown: 'Plan.', data: { steps: [{ title: 'Pre-approval', description: 'Get a letter.', icon }, { title: 'Offer', description: 'Submit it.', icon: null }] } },
  });
  const ok = createPresentationProjection(p).finish(body('home'));
  assert.equal(ok.ok, true);
  assert.match(ok.response, /"icon":"home"/);
  assert.equal((ok.response.match(/"icon"/g) ?? []).length, 2, 'null icons are omitted');
  assert.equal(createPresentationProjection(p).finish(body(null)).ok, true);
  assert.equal(createPresentationProjection(p).finish(body('<script>alert(1)</script>')).ok, false);
});
