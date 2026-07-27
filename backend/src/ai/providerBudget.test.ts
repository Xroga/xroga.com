import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHARED_PROVIDER_ENTITLEMENT_MICRO_USD,
  activatePaidCycle,
  actualProviderCostMicroUsd,
  estimateProviderReservationMicroUsd,
  getProviderEntitlementStatus,
  reserveProviderBudget,
  resetProviderBudgetMemoryForTests,
  unlockedEntitlementMicroUsd,
} from './providerBudget.js';

test('uses integer micro-USD and reserves more than the maximum estimated cost', () => {
  const actual = actualProviderCostMicroUsd({
    modelId: 'kimi_k3', inputTokens: 20_000, outputTokens: 4_000,
  });
  const reserved = estimateProviderReservationMicroUsd({
    modelId: 'kimi_k3', estimatedInputTokens: 20_000, maximumOutputTokens: 4_000,
  });
  assert.equal(Number.isInteger(actual), true);
  assert.equal(Number.isInteger(reserved), true);
  assert.ok(reserved > actual);
});

test('balanced month unlocks cycle-relative daily and complexity portions', () => {
  const startsAt = new Date('2026-07-01T12:00:00.000Z');
  assert.equal(unlockedEntitlementMicroUsd({ startsAt, now: startsAt, pacing: 'balanced_month', purpose: 'daily_work' }), 1_361_250);
  assert.equal(unlockedEntitlementMicroUsd({ startsAt, now: new Date('2026-07-08T12:00:00.000Z'), pacing: 'balanced_month', purpose: 'daily_work' }), 4_702_500);
  assert.equal(unlockedEntitlementMicroUsd({ startsAt, now: new Date('2026-07-30T12:00:00.000Z'), pacing: 'balanced_month', purpose: 'completion' }), SHARED_PROVIDER_ENTITLEMENT_MICRO_USD);
});

test('full access never unlocks the protected completion reserve for ordinary work', () => {
  const startsAt = new Date('2026-07-01T00:00:00.000Z');
  const now = new Date('2026-07-01T00:00:00.000Z');
  assert.equal(unlockedEntitlementMicroUsd({ startsAt, now, pacing: 'full_access', purpose: 'daily_work' }), 14_025_000);
  assert.equal(unlockedEntitlementMicroUsd({ startsAt, now, pacing: 'full_access', purpose: 'completion' }), SHARED_PROVIDER_ENTITLEMENT_MICRO_USD);
});

test('idempotent replay returns one reservation without double accounting', async () => {
  resetProviderBudgetMemoryForTests();
  const input = {
    userId: 'replay-user',
    modelId: 'deepseek_v4_flash' as const,
    estimatedInputTokens: 100,
    maximumOutputTokens: 100,
    idempotencyKey: '7e72ed04-52f3-41c5-96c1-a3ef79a8d3be',
  };
  const first = await reserveProviderBudget(input);
  const replay = await reserveProviderBudget(input);
  assert.equal(replay.id, first.id);
  assert.equal(replay.reservedMicroUsd, first.reservedMicroUsd);
});

test('verified payment cycle becomes the active paid entitlement', async () => {
  resetProviderBudgetMemoryForTests();
  const startsAt = new Date();
  const status = await activatePaidCycle({
    userId: 'paid-user',
    providerReference: 'event:subscription:period',
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 86_400_000),
  });
  assert.equal(status.state, 'paid_active');
  assert.equal((await getProviderEntitlementStatus('paid-user')).requiresCard, true);
});
