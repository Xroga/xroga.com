import assert from 'node:assert/strict';
import { test } from 'node:test';

import { enhanceAiResponse, stripXrogaUiProtocol } from './xrogaResponseDocument';

test('ordinary answers stay lightweight text', () => {
  const result = enhanceAiResponse('A direct answer with **useful emphasis**.', 'message-1');
  assert.equal(result.content, 'A direct answer with **useful emphasis**.');
  assert.equal(result.output, undefined);
});

test('a length-limited answer retains its exact source and partial warning through persistence', () => {
  const source='Tenant access must be checked against the user\'s';
  const result=enhanceAiResponse(source,'partial',{status:'partial',reason:'output_limit'});
  assert.equal(result.content,source);
  assert.equal(result.output?.sourceText,source);
  assert.equal(result.output?.status,'partial');
  const saved=JSON.parse(JSON.stringify(result));
  assert.equal(saved.output.blocks[0].type,'notice');
  assert.match(saved.output.blocks[0].text,/output limit.*incomplete/);
  assert.equal(saved.output.blocks[1].text,source);
  assert.equal(enhanceAiResponse(source,'complete',{status:'complete'}).output,undefined);
});

test('primary model graph subtitles survive canonicalization without replacing detail', () => {
  const source = '```xroga-ui\n' + JSON.stringify({ type: 'graph', nodes: [
    { id: 'api', label: 'API', subtitle: 'Server routes' },
    { id: 'db', label: 'Database', detail: 'RLS policies', subtitle: 'Secondary' },
  ], edges: [{ source: 'api', target: 'db' }] }) + '\n```';
  const result = enhanceAiResponse(source, 'graph-descriptions');
  const graph = result.output?.blocks.find(block => block.type === 'graph');
  assert.deepEqual(graph?.nodes.map(node => node.detail), ['Server routes', 'RLS policies']);
  assert.equal(result.output?.sourceText, source);
});

test('markdown data becomes a searchable table and a chart', () => {
  const result = enhanceAiResponse([
    '## Monthly revenue',
    'The latest measured values are below.',
    '',
    '| Month | Revenue | Orders |',
    '| --- | ---: | ---: |',
    '| Jan | $12,000 | 120 |',
    '| Feb | $15,500 | 148 |',
    '| Mar | $18,000 | 171 |',
  ].join('\n'), 'message-2');

  assert.deepEqual(result.output?.blocks.map((block) => block.type), ['narrative', 'table', 'chart']);
  assert.doesNotMatch(result.content, /\| Month \|/);
  const table = result.output?.blocks.find((block) => block.type === 'table');
  assert.equal(table?.rows[0]?.revenue, '$12,000');
  const chart = result.output?.blocks.find((block) => block.type === 'chart');
  assert.equal(chart?.chartType, 'line');
  assert.deepEqual(chart?.series.map((series) => series.key), ['orders']);
});

test('table conversion preserves numeric units and precision', () => {
  const result = enhanceAiResponse('| Item | Value |\n| --- | --- |\n| Rate | 5% |\n| Price | $1.00 |\n| Code | 001 |\n| Scale | 2m |', 'units');
  const table = result.output?.blocks.find(b => b.type === 'table');
  assert.deepEqual(table?.rows.map(r => r.value), ['5%', '$1.00', '001', '2m']);
  assert.equal(result.output?.blocks.some(b => b.type === 'chart'), false);
});

test('Markdown tables inside code remain exact code examples', () => {
  const source = 'Example:\n```markdown\n| Name | Value |\n| --- | --- |\n| x | 1 |\n```';
  assert.deepEqual(enhanceAiResponse(source, 'code'), { content: source });
});

test('large Markdown tables retain every row', () => {
  const source = ['| Name | Value |', '| --- | --- |', ...Array.from({ length: 251 }, (_, i) => `| Item ${i} | ${i} |`)].join('\n');
  assert.deepEqual(enhanceAiResponse(source, 'large'), { content: source });
});

test('validated xroga-ui blocks become live rich output without leaking protocol text', () => {
  const response = [
    'Here is the dependency view.',
    '```xroga-ui',
    JSON.stringify({
      type: 'graph',
      title: 'Release dependencies',
      nodes: [{ id: 'build', label: 'Build' }, { id: 'test', label: 'Test' }],
      edges: [{ source: 'build', target: 'test' }],
    }),
    '```',
  ].join('\n');
  const result = enhanceAiResponse(response, 'message-3');

  assert.equal(result.content, 'Here is the dependency view.');
  assert.deepEqual(result.output?.blocks.map((block) => block.type), ['narrative', 'graph']);
  assert.doesNotMatch(JSON.stringify(result.output?.blocks), /xroga-ui/);
  assert.equal(result.output?.sourceText, response);
});

test('validated utility blocks become interactive response output', () => {
  const response = [
    'Adjust the inputs to explore the estimate.',
    '```xroga-ui',
    JSON.stringify({
      type: 'calculator',
      title: 'Revenue estimate',
      icon: 'calculator',
      operation: 'product',
      inputs: [
        { id: 'price', label: 'Price', value: 25, unit: 'USD' },
        { id: 'customers', label: 'Customers', value: 40 },
      ],
      resultLabel: 'Revenue',
      resultUnit: 'USD',
    }),
    '```',
  ].join('\n');
  const result = enhanceAiResponse(response, 'message-utility');

  assert.equal(result.content, 'Adjust the inputs to explore the estimate.');
  assert.deepEqual(result.output?.blocks.map((block) => block.type), ['narrative', 'calculator']);
  assert.equal(result.output?.blocks[1]?.icon, 'calculator');
});

test('organizer and developer blocks become live response output', () => {
  const response = [
    'The implementation is organized below.',
    '```xroga-ui',
    JSON.stringify({
      type: 'tabs',
      title: 'Implementation',
      tabs: [
        { id: 'summary', label: 'Summary', content: 'Checkout repaired.' },
        { id: 'tests', label: 'Tests', content: 'All checks passed.' },
      ],
    }),
    '```',
    '```xroga-ui',
    JSON.stringify({ type: 'diff', title: 'Patch', path: 'src/checkout.ts', content: '- broken\n+ repaired' }),
    '```',
  ].join('\n');
  const result = enhanceAiResponse(response, 'message-organizer');

  assert.equal(result.content, 'The implementation is organized below.');
  assert.deepEqual(result.output?.blocks.map((block) => block.type), ['narrative', 'tabs', 'diff']);
});

test('cards, trees, JSON, and API exchanges become live response output', () => {
  const response = [
    'Here are the structured results.',
    '```xroga-ui',
    JSON.stringify({ type: 'card-grid', title: 'Options', cards: [{ id: 'a', title: 'Option A', metrics: { Score: 94 } }] }),
    '```',
    '```xroga-ui',
    JSON.stringify({ type: 'tree', title: 'Team', nodes: [{ id: 'lead', label: 'Lead' }, { id: 'dev', label: 'Developer', parentId: 'lead' }] }),
    '```',
    '```xroga-ui',
    JSON.stringify({ type: 'json', title: 'Payload', data: { ok: true } }),
    '```',
    '```xroga-ui',
    JSON.stringify({ type: 'api-request', title: 'Health check', method: 'GET', url: '/api/health', status: 200, responseBody: '{"ok":true}' }),
    '```',
  ].join('\n');
  const result = enhanceAiResponse(response, 'message-structured');

  assert.equal(result.content, 'Here are the structured results.');
  assert.deepEqual(result.output?.blocks.map((block) => block.type), ['narrative', 'card-grid', 'tree', 'json', 'api-request']);
});

test('malformed and executable rich payloads are hidden and rejected', () => {
  const malformed = 'Safe answer.\n```xroga-ui\n{"type":"chart"\n```';
  const executable = `Safe answer.\n\`\`\`xroga-ui\n${JSON.stringify({
    type: 'metric',
    metric: { id: 'm', label: 'Users', value: 10 },
    onClick: 'steal()',
  })}\n\`\`\``;

  for (const source of [malformed, executable]) {
    const result = enhanceAiResponse(source, 'bad');
    assert.equal(result.output?.status, 'partial');
    assert.equal(result.output?.sourceText, source);
    assert.deepEqual(result.output?.blocks.map(b => b.type), ['narrative', 'notice']);
    assert.doesNotMatch(JSON.stringify(result.output?.blocks), /steal|onClick|xroga-ui/);
  }
  assert.equal(enhanceAiResponse(executable, 'bad-2').content, 'Safe answer.');
  assert.equal(stripXrogaUiProtocol('Visible\n```xroga-ui\n{"type":"chart"'), 'Visible');
});

test('decision matrix is validated and unknown formats have an honest fallback', () => {
  const response = [
    'Compare the options below.',
    '```xroga-ui',
    JSON.stringify({ type: 'decision-matrix', title: 'Choose a vendor', criteria: [
      { id: 'cost', label: 'Cost', weight: 2 }, { id: 'quality', label: 'Quality', weight: 3 },
    ], options: [
      { id: 'a', label: 'A', scores: { cost: 8, quality: 7 } },
      { id: 'b', label: 'B', scores: { cost: 6, quality: 9 } },
    ] }),
    '```',
    '```xroga-ui',
    JSON.stringify({ type: 'holographic-realtime-market-cube', title: 'Unsupported view' }),
    '```',
  ].join('\n');
  const result = enhanceAiResponse(response, 'matrix-message');
  assert.deepEqual(result.output?.blocks.map((block) => block.type), ['narrative', 'decision-matrix', 'notice']);
  assert.match(JSON.stringify(result.output?.blocks[2]), /not a supported Xroga response format/);
});

test('decision matrix rejects incomplete or out-of-range scores', () => {
  const invalid = `\`\`\`xroga-ui\n${JSON.stringify({ type: 'decision-matrix', criteria: [{ id: 'cost', label: 'Cost', weight: 1 }], options: [{ id: 'a', label: 'A', scores: { cost: 11 } }, { id: 'b', label: 'B', scores: { cost: 4 } }] })}\n\`\`\``;
  assert.deepEqual(enhanceAiResponse(invalid, 'invalid-matrix').output?.blocks.map(b => b.type), ['notice']);
  const incomplete = `\`\`\`xroga-ui\n${JSON.stringify({ type: 'decision-matrix', criteria: [{ id: 'cost', label: 'Cost', weight: 1 }], options: [{ id: 'a', label: 'A', scores: {} }, { id: 'b', label: 'B', scores: { cost: 4 } }] })}\n\`\`\``;
  assert.deepEqual(enhanceAiResponse(incomplete, 'incomplete-matrix').output?.blocks.map(b => b.type), ['notice']);
});

test('deep executable payloads cannot bypass the data-only boundary', () => {
  let nested: Record<string, unknown> = { onClick: 'run()' };
  for (let index = 0; index < 15; index += 1) nested = { child: nested };
  const content = `\`\`\`xroga-ui\n${JSON.stringify({ type: 'json', data: nested })}\n\`\`\``;
  assert.deepEqual(enhanceAiResponse(content, 'deep-payload').output?.blocks.map(b => b.type), ['notice']);
});

test('a rejected member of a mixed payload is reported without losing valid data', () => {
  const source = '```xroga-ui\n' + JSON.stringify([
    { type: 'graph', nodes: [{ id: 'a', label: 'A' }], edges: [] },
    { type: 'calculator', operation: 'eval', inputs: [] },
  ]) + '\n```';
  const result = enhanceAiResponse(source, 'mixed');
  assert.equal(result.output?.status, 'partial');
  assert.equal(result.output?.sourceText, source);
  assert.deepEqual(result.output?.blocks.map(b => b.type), ['graph', 'notice']);
});

test('repeated model block IDs receive stable unique presentation IDs', () => {
  const source = '```xroga-ui\n' + JSON.stringify([
    { id: 'same', type: 'graph', nodes: [{ id: 'a', label: 'A' }], edges: [] },
    { id: 'same', type: 'graph', nodes: [{ id: 'b', label: 'B' }], edges: [] },
  ]) + '\n```';
  const first = enhanceAiResponse(source, 'x'.repeat(100));
  assert.equal(new Set(first.output?.blocks.map(b => b.id)).size, 2);
  assert.deepEqual(first, enhanceAiResponse(source, 'x'.repeat(100)));
});
