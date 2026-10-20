import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalAuthorityJson, canonicalAuthorityValue, preparedActionDigest } from './digest.js';
import { snapshotBusinessActionPlan, verifyPlanDigest, type BusinessActionPlan } from '../../services/integrations/businessAction.js';
import { actionPlanDigest } from '../../operations/operationsEngine.js';

test('canonical authority digest binds exact nested payload without redaction or locale-dependent ordering', () => {
  const original = { recipient: 'first@example.invalid', account: 'account-A', amount: 15, currency: 'USD', values: [null, true, { b: 2, a: 1 }] };
  assert.equal(preparedActionDigest(original), preparedActionDigest({ values: [null, true, { a: 1, b: 2 }], currency: 'USD', amount: 15, account: 'account-A', recipient: 'first@example.invalid' }));
  for (const change of [{ recipient: 'second@example.invalid' }, { account: 'account-B' }, { amount: 16 }, { currency: 'EUR' }]) {
    assert.notEqual(preparedActionDigest(original), preparedActionDigest({ ...original, ...change }));
  }
  assert.equal(canonicalAuthorityJson({ é: 1, z: 2, A: 3 }), '{"A":3,"z":2,"é":1}');
  assert.notEqual(preparedActionDigest('é'), preparedActionDigest('e\u0301'), 'Do not normalize a different recipient/payload into an approval');
});

test('canonical authority rejects values JSON would silently coerce, erase or execute', () => {
  const cycle: Record<string, unknown> = {}; cycle.self = cycle;
  let getterCalls = 0;
  const getter = Object.defineProperty({}, 'secret', { enumerable: true, get() { getterCalls++; return 'not-authorized'; } });
  const symbol = { [Symbol('hidden-authority')]: 'hidden' };
  const extraArray = Object.assign([1], { recipient: 'hidden' });
  for (const value of [undefined, NaN, Infinity, -Infinity, -0, 1n, () => true, new Date(), new Map(), new Set(), Buffer.from('x'), cycle, getter, symbol, extraArray, new Array(2), { value: undefined }, { value: '\ud800' }, JSON.parse('{"__proto__":{}}')]) {
    assert.throws(() => canonicalAuthorityJson(value), /Invalid prepared-action/);
  }
  assert.equal(getterCalls, 0);
  const shared = { a: 1 };
  assert.deepEqual(canonicalAuthorityValue([shared, shared]), [{ a: 1 }, { a: 1 }]);
});

test('business snapshots reject coerced parameters before serializing while Operations uses the same boundary', () => {
  const plan: BusinessActionPlan = { version: '1.0', sessionId: 'trs_fixture', useCase: 'Send exact message', toolkit: 'slack', toolSlug: 'SLACK_SEND_MESSAGE', arguments: { amount: null }, risk: 'write', requiresConfirmation: true, summary: 'Send exact message', requiredScopes: [], scopeRequirements: null, planDigest: '' };
  const { planDigest: _, ...unsigned } = plan;
  const legacyOrder = (value: unknown): unknown => Array.isArray(value) ? value.map(legacyOrder)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, legacyOrder(child)])) : value;
  plan.planDigest = createHash('sha256').update(JSON.stringify(legacyOrder(unsigned))).digest('hex');
  assert.equal(verifyPlanDigest(plan), true);
  assert.deepEqual(snapshotBusinessActionPlan(plan), plan);
  let calls = 0;
  const accessor = Object.defineProperty({}, 'amount', { enumerable: true, get() { calls++; return null; } });
  assert.equal(verifyPlanDigest({ ...plan, arguments: accessor }), false);
  assert.throws(() => snapshotBusinessActionPlan({ ...plan, arguments: accessor }), { code: 'BUSINESS_ACTION_PLAN_CHANGED' });
  assert.equal(calls, 0);
  for (const value of [NaN, Infinity, new Date(), undefined]) {
    const changed = { ...plan, arguments: { amount: value } };
    assert.equal(verifyPlanDigest(changed), false);
    assert.throws(() => snapshotBusinessActionPlan(changed), { code: 'BUSINESS_ACTION_PLAN_CHANGED' });
    assert.throws(() => actionPlanDigest({ actionType: 'retry_job', projectId: 'p', targetType: 'job', targetId: 'j', targetVersion: 1, idempotencyKey: 'fixture', confirmed: true, parameters: { amount: value } }), /Invalid prepared-action/);
  }
});
