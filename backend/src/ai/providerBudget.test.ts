import assert from 'node:assert/strict';
import test from 'node:test';
import { createTenantContext } from '../security/tenantContext.js';
import {
  SHARED_PROVIDER_ENTITLEMENT_MICRO_USD,
  activatePaidCycle,
  actualProviderCostMicroUsd,
  estimateProviderReservationMicroUsd,
  getProviderEntitlementStatus,
  reserveProviderBudget,
  resetProviderBudgetMemoryForTests,
  unlockedEntitlementMicroUsd,
  settleProviderBudget,
  finishFailedProviderReservation,
  withProviderReservation,
} from './providerBudget.js';

test('invalid accounting values cannot authorize execution or poison local balances', async () => {
  for (const invalid of [NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => estimateProviderReservationMicroUsd({ modelId: 'deepseek_v4_1_flash_1017', estimatedInputTokens: invalid, maximumOutputTokens: 10 }));
    assert.throws(() => actualProviderCostMicroUsd({ modelId: 'deepseek_v4_1_flash_1017', inputTokens: 10, outputTokens: invalid }));
    let executed = false;
    await assert.rejects(withProviderReservation({ userId: 'invalid-amount', modelId: 'deepseek_v4_1_flash_1017', estimatedInputTokens: invalid, maximumOutputTokens: 10,
      execute: async () => { executed = true; return { inputTokens: 1, outputTokens: 1 }; } }));
    assert.equal(executed, false);
  }
  assert.throws(() => estimateProviderReservationMicroUsd({ modelId: 'deepseek_v4_1_flash_1017', estimatedInputTokens: 10, maximumOutputTokens: 10, billingTolerance: NaN }));
});

test('production cannot authorize provider execution using process-memory accounting', async () => {
  const previous = process.env.NODE_ENV;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    let executed = false;
    await assert.rejects(withProviderReservation({ userId: 'missing-store', modelId: 'deepseek_v4_1_flash_1017', estimatedInputTokens: 10, maximumOutputTokens: 10,
      execute: async () => { executed = true; return { inputTokens: 1, outputTokens: 1 }; } }), /Durable provider accounting is unavailable/);
    assert.equal(executed, false);
    await assert.rejects(getProviderEntitlementStatus('missing-store'), /Durable provider accounting is unavailable/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test('uses integer micro-USD and reserves more than the maximum estimated cost', () => {
  const actual = actualProviderCostMicroUsd({
    modelId: 'deepseek_v4_1_flash_1017', inputTokens: 20_000, outputTokens: 4_000,
  });
  const reserved = estimateProviderReservationMicroUsd({
    modelId: 'deepseek_v4_1_flash_1017', estimatedInputTokens: 20_000, maximumOutputTokens: 4_000,
  });
  assert.equal(Number.isInteger(actual), true);
  assert.equal(Number.isInteger(reserved), true);
  assert.ok(reserved > actual);
});

test('DeepSeek reservation covers the observed provider charge and settles reported cost rather than a cheapest-endpoint estimate', () => {
  const observed={modelId:'deepseek_v4_flash' as const,inputTokens:2817,outputTokens:4096,providerCostMicroUsd:1985};
  const reserved=estimateProviderReservationMicroUsd({modelId:observed.modelId,estimatedInputTokens:2817,maximumOutputTokens:4096});
  assert.ok(reserved>observed.providerCostMicroUsd);
  assert.equal(actualProviderCostMicroUsd(observed),1985);
  for(const providerCostMicroUsd of [-1,NaN,Infinity,1.5]) assert.throws(()=>actualProviderCostMicroUsd({...observed,providerCostMicroUsd}),/Invalid provider usage/);
});

test('cached input is conservatively accounted until a provider-specific rate is verified', () => {
  const uncached = actualProviderCostMicroUsd({ modelId: 'glm_5_3_flash', inputTokens: 10_000, outputTokens: 100 });
  const cached = actualProviderCostMicroUsd({ modelId: 'glm_5_3_flash', inputTokens: 10_000, cachedInputTokens: 9_000, outputTokens: 100 });
  assert.equal(cached, uncached);
});

test('Zurelay completion counts include reasoning exactly once without rewriting historical accounting',()=>{
  const normal={modelId:'deepseek_v4_1_flash_1017' as const,inputTokens:1000,outputTokens:1000};
  assert.equal(actualProviderCostMicroUsd(normal),150);
  assert.equal(actualProviderCostMicroUsd({...normal,reasoningTokens:750}),150);
  assert.throws(()=>actualProviderCostMicroUsd({...normal,reasoningTokens:1001}),/Invalid provider usage/);
  assert.equal(actualProviderCostMicroUsd({...normal,modelId:'claude_sonnet_5_5',reasoningTokens:750}),4740);
});

test('balanced month unlocks cycle-relative daily and complexity portions', () => {
  const startsAt = new Date('2026-07-01T12:00:00.000Z');
  assert.equal(unlockedEntitlementMicroUsd({ startsAt, now: startsAt, pacing: 'balanced_month', purpose: 'daily_work' }), 1_775_000);
  assert.equal(unlockedEntitlementMicroUsd({ startsAt, now: new Date('2026-07-08T12:00:00.000Z'), pacing: 'balanced_month', purpose: 'daily_work' }), 5_950_000);
  assert.equal(unlockedEntitlementMicroUsd({ startsAt, now: new Date('2026-07-30T12:00:00.000Z'), pacing: 'balanced_month', purpose: 'completion' }), SHARED_PROVIDER_ENTITLEMENT_MICRO_USD);
});

test('full access never unlocks the protected completion reserve for ordinary work', () => {
  const startsAt = new Date('2026-07-01T00:00:00.000Z');
  const now = new Date('2026-07-01T00:00:00.000Z');
  assert.equal(unlockedEntitlementMicroUsd({ startsAt, now, pacing: 'full_access', purpose: 'daily_work' }), 17_500_000);
  assert.equal(unlockedEntitlementMicroUsd({ startsAt, now, pacing: 'full_access', purpose: 'completion' }), SHARED_PROVIDER_ENTITLEMENT_MICRO_USD);
});

test('idempotent replay returns one reservation without double accounting', async () => {
  resetProviderBudgetMemoryForTests();
  const input = {
    userId: 'replay-user',
    modelId: 'deepseek_v4_1_flash_1017' as const,
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
  const userId = '11111111-1111-4111-8111-111111111111';
  const status = await activatePaidCycle(createTenantContext({userId, via: 'local_jwt'}), {
    userId,
    providerReference: 'event:subscription:period',
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * 86_400_000),
  });
  assert.equal(status.state, 'paid_active');
  assert.equal((await getProviderEntitlementStatus(userId)).requiresCard, true);
});

test('same-key memory replays bind exact intent and deny settled, released or uncertain reservations', async () => {
  const input = { userId: 'replay-boundary', modelId: 'deepseek_v4_1_flash_1017' as const, estimatedInputTokens: 100, maximumOutputTokens: 100,
    idempotencyKey: '33333333-3333-4333-8333-333333333333' };
  for (const terminal of ['settled', 'released', 'pending']) {
    resetProviderBudgetMemoryForTests();
    const reservation = await reserveProviderBudget(input);
    await assert.rejects(reserveProviderBudget({...input,modelId:'deepseek_v4_flash'}), {code:'MODEL_DESTINATION_DENIED'});
    for (const changed of [{ purpose: 'completion' as const }, { estimatedInputTokens: 101 }, { maximumOutputTokens: 99 }]) {
      await assert.rejects(reserveProviderBudget({ ...input, ...changed }), /reservation evidence is invalid/);
    }
    assert.equal((await reserveProviderBudget(input)).id, reservation.id);
    if (terminal === 'settled') await settleProviderBudget({ userId: input.userId, modelId: input.modelId, reservation, result: { inputTokens: 1, outputTokens: 1 } });
    else await finishFailedProviderReservation({ userId: input.userId, reservation, error: new Error(terminal === 'pending' ? 'timeout' : 'unauthorized') });
    await assert.rejects(reserveProviderBudget(input), /reservation evidence is invalid/);
  }
});


test('free entitlement projections never exceed the active cycle ceiling', () => {
  const startsAt = new Date('2026-09-01T00:00:00.000Z');
  const now = new Date('2026-09-25T00:00:00.000Z');
  assert.equal(
    unlockedEntitlementMicroUsd({
      startsAt,
      now,
      pacing: 'balanced_month',
      purpose: 'daily_work',
      entitlementMicroUsd: 1_650_000,
    }),
    1_650_000,
  );
});

test('free in-memory status is bounded to 100 percent and does not advertise fake future unlocks', async () => {
  resetProviderBudgetMemoryForTests();
  const status = await getProviderEntitlementStatus('free-cap-user');
  assert.equal(status.state, 'free_active');
  assert.ok(status.capacityRemainingPercent != null && status.capacityRemainingPercent <= 100);
  assert.equal(status.availableNowPercent, 100);
  assert.equal(status.nextUnlockAt, null);
});

test('process-local reservation settlement and release cannot mutate another owner budget', async () => {
  assert.equal(Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),false,'this fixture tests the process-local boundary, not durable database proof');
  for(const action of ['settle','release','pending'] as const) {
    resetProviderBudgetMemoryForTests();
    const input={modelId:'deepseek_v4_1_flash_1017' as const,estimatedInputTokens:20000,maximumOutputTokens:4000,idempotencyKey:'ffe067ee-68b2-4139-9b0b-0bfcebfed161'};
    const owner=await reserveProviderBudget({...input,userId:'reservation-owner'});
    const other=await reserveProviderBudget({...input,userId:'reservation-other'});
    assert.notEqual(owner.id,other.id,'idempotency namespace must include owner');
    const beforeOwner=await getProviderEntitlementStatus('reservation-owner'),beforeOther=await getProviderEntitlementStatus('reservation-other');
    if(action==='settle') await settleProviderBudget({userId:'reservation-other',modelId:input.modelId,reservation:owner,result:{inputTokens:10000,outputTokens:1000}});
    else await finishFailedProviderReservation({userId:'reservation-other',reservation:owner,error:new Error(action==='pending'?'timeout':'unauthorized')});
    assert.equal((await getProviderEntitlementStatus('reservation-owner')).availableNowPercent,beforeOwner.availableNowPercent);
    assert.equal((await getProviderEntitlementStatus('reservation-other')).availableNowPercent,beforeOther.availableNowPercent);
    // Legitimate owner can still settle: a foreign attempt must not change reservation status.
    await settleProviderBudget({userId:'reservation-owner',modelId:input.modelId,reservation:owner,result:{inputTokens:10000,outputTokens:1000}});
    const after=await getProviderEntitlementStatus('reservation-owner');
    assert.ok(after.availableNowPercent!>beforeOwner.availableNowPercent!,'owner reservation must remain available for legitimate settlement');
    assert.equal((await getProviderEntitlementStatus('reservation-other')).availableNowPercent,beforeOther.availableNowPercent);
  }
});
