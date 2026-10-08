import assert from 'node:assert/strict';
import { test } from 'node:test';

import { enhanceAiResponse, stripXrogaUiProtocol } from './xrogaResponseDocument';

test('ordinary answers stay lightweight text', () => {
  const result = enhanceAiResponse('A direct answer with **useful emphasis**.', 'message-1');
  assert.equal(result.content, 'A direct answer with **useful emphasis**.');
  assert.equal(result.output, undefined);
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
  assert.equal(table?.rows[0]?.revenue, 12000);
  const chart = result.output?.blocks.find((block) => block.type === 'chart');
  assert.equal(chart?.chartType, 'line');
  assert.deepEqual(chart?.series.map((series) => series.key), ['revenue', 'orders']);
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
  assert.doesNotMatch(JSON.stringify(result.output), /xroga-ui/);
});

test('validated utility blocks become interactive response output', () => {
  const response = [
    'Adjust the inputs to explore the estimate.',
    '```xroga-ui',
    JSON.stringify({
      type: 'calculator',
      title: 'Revenue estimate',
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
});

test('malformed and executable rich payloads are hidden and rejected', () => {
  const malformed = 'Safe answer.\n```xroga-ui\n{"type":"chart"\n```';
  const executable = `Safe answer.\n\`\`\`xroga-ui\n${JSON.stringify({
    type: 'metric',
    metric: { id: 'm', label: 'Users', value: 10 },
    onClick: 'steal()',
  })}\n\`\`\``;

  assert.equal(enhanceAiResponse(malformed, 'bad-1').output, undefined);
  assert.equal(enhanceAiResponse(executable, 'bad-2').output, undefined);
  assert.equal(enhanceAiResponse(executable, 'bad-2').content, 'Safe answer.');
  assert.equal(stripXrogaUiProtocol('Visible\n```xroga-ui\n{"type":"chart"'), 'Visible');
});
