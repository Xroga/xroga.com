import test from 'node:test';
import assert from 'node:assert/strict';
import { responseTextV2 } from './exportText';
import { enhanceAiResponse } from '@/lib/xrogaResponseDocument';
import { serializeAssistantCopy } from '@/lib/assistantCopy';
import { readFileSync } from 'node:fs';

test('real generated database fields survive full V2 export and clipboard conversion', () => {
  const message = JSON.parse(readFileSync(new URL('./testdata/generated-saas-database.json', import.meta.url), 'utf8'));
  const exported = responseTextV2(message);
  assert.ok(exported);
  const copied = serializeAssistantCopy(exported);
  for (const field of ['user_id', 'tenant_id', 'stripe_customer_id', 'stripe_subscription_id']) {
    assert.ok(copied.includes(field), `Lost field ${field}`);
  }
  assert.ok(copied.includes('→'));
});

test('a persisted model answer exports its ordered diagram, dataset and complete explanation', () => {
  const source = ['Intro.', '```xroga-ui', JSON.stringify({ type: 'graph', nodes: [{ id: 'ui', label: 'Client' }, { id: 'db', label: 'Database' }], edges: [{ source: 'ui', target: 'db', label: 'Authorized query' }] }), '```', '## Results', '| Name | Value |', '| --- | --- |', '| Zero | 0 |', '| Disabled | false |', 'Conclusion.'].join('\n');
  const enhanced = enhanceAiResponse(source, 'export');
  const input = JSON.parse(JSON.stringify({ id: 'export', content: enhanced.content, featureOutput: enhanced.output }));
  const text = responseTextV2(input)!;
  assert.ok(text.indexOf('Intro.') < text.indexOf('Client → Database: Authorized query'));
  assert.ok(text.indexOf('Client → Database: Authorized query') < text.indexOf('Results'));
  assert.ok(text.indexOf('Results') < text.indexOf('Conclusion.'));
  assert.match(text, /Zero\t0/);
  assert.match(text, /Disabled\tfalse/);
  assert.equal(text.match(/Conclusion\./g)?.length, 1);
});

test('calculator export distinguishes original inputs and computes without a provider call', () => {
  const text = responseTextV2({ id: 'm', content: '', featureOutput: { schemaVersion: 1, id: 'o', status: 'completed', blocks: [{ schemaVersion: 1, id: 'calc', type: 'calculator', operation: 'product', inputs: [{ id: 'price', label: 'Price', value: 25, unit: 'USD' }, { id: 'customers', label: 'Customers', value: 40 }], resultLabel: 'Monthly revenue', resultUnit: 'USD', precision: 2 }] } });
  assert.match(text!, /Original calculation inputs/);
  assert.match(text!, /25 × 40/);
  assert.match(text!, /Monthly revenue: 1000.00 USD/);
});

test('resource export retains qualifiers and literals through the existing clipboard formatter', () => {
  const item = { id: 'r', domain: 'travel', kind: 'flight', title: 'Example only', status: 'demo', demo: true, price: { amount: 0, currency: 'USD', basis: 'round-trip', taxesIncluded: false, feesIncluded: false }, limitations: 'Not bookable: literal_a_b', route: [{ from: 'A', to: 'B', departureLocal: '09:00', departureTimeZone: 'UTC' }] };
  const text = responseTextV2({ id: 'm', content: '', featureOutput: { schemaVersion: 1, id: 'o', status: 'completed', blocks: [{ schemaVersion: 1, id: 'r', type: 'rich-results', items: [item] }] } });
  assert.ok(text);
  const copied = serializeAssistantCopy(text);
  assert.deepEqual(JSON.parse(copied), item);
});

test('unsupported contracts retain legacy export rather than dropping data', () => {
  assert.equal(responseTextV2({ id: 'm', content: 'Keep me', featureOutput: { type: 'unknown-action' } }), undefined);
  assert.equal(responseTextV2({ id: 'm', content: 'Simple reply.' }), 'Simple reply.');
});
