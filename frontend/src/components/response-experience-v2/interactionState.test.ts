import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreScenarioV2, saveScenarioV2 } from './interactionState';
import type { CalculatorNode } from './calculations';

const node: CalculatorNode = { id: 'risk', kind: 'calculator', operation: 'percentage', inputs: [
  { id: 'capital', label: 'Capital', value: 50000, min: 0, max: 100000 },
  { id: 'rate', label: 'Risk', value: 1, min: 0, max: 10 },
], resultLabel: 'Risk budget', precision: 2, unit: 'USD' };
const values = { capital: '50000', rate: '2' };
function memory() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
test('reopen restores only matching account, message and calculation schema', () => {
  const store = memory(); const scope = JSON.stringify(['alice', 'message1']);
  saveScenarioV2(store, scope, node, values, 1000);
  assert.deepEqual(restoreScenarioV2(store, scope, node, 2000), values);
  assert.equal(restoreScenarioV2(store, JSON.stringify(['bob', 'message1']), node, 2000), null);
  assert.equal(restoreScenarioV2(store, JSON.stringify(['alice', 'message2']), node, 2000), null);
  assert.equal(restoreScenarioV2(store, scope, { ...node, operation: 'sum' }, 2000), null);
  assert.equal(restoreScenarioV2(store, scope, node, 1000 + 8 * 60 * 60 * 1000), null);
});
test('reset persists original inputs without altering the authored node', () => {
  const store = memory(); const original = JSON.stringify(node);
  saveScenarioV2(store, 'scope', node, values, 1000);
  const defaults = Object.fromEntries(node.inputs.map(input => [input.id, String(input.value)]));
  saveScenarioV2(store, 'scope', node, defaults, 2000);
  assert.deepEqual(restoreScenarioV2(store, 'scope', node, 3000), defaults);
  assert.equal(JSON.stringify(node), original);
});
test('invalid values and unavailable storage cannot break rendering', () => {
  const store = memory();
  saveScenarioV2(store, 'scope', node, { ...values, rate: '999' }, 1000);
  assert.equal(store.data.size, 0);
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('quota'); } };
  assert.doesNotThrow(() => saveScenarioV2(denied, 'scope', node, values));
  assert.equal(restoreScenarioV2(denied, 'scope', node), null);
  store.setItem('xroga:response-v2:scenario:scope', '{bad json');
  assert.equal(restoreScenarioV2(store, 'scope', node), null);
});
test('storage retains at most 32 calculations per message', () => {
  const store = memory();
  for (let i = 0; i < 40; i++) saveScenarioV2(store, 'scope', { ...node, id: String(i) }, values, 1000 + i);
  assert.equal(JSON.parse([...store.data.values()][0]).length, 32);
  assert.equal(restoreScenarioV2(store, 'scope', { ...node, id: '0' }, 2000), null);
  assert.deepEqual(restoreScenarioV2(store, 'scope', { ...node, id: '39' }, 2000), values);
});
