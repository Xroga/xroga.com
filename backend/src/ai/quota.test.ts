import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MONTHLY_TOTAL_BUDGET_USD,
  costUsdForTokens,
  dashboardModelPools,
  scaleFactorForBudget,
} from './models.js';
import {
  GALACTIC_PLANS,
  getApiBudgetUsd,
  getTokenPool,
  getPlanByTier,
} from '../config/plans.js';
import {
  modelBudgetRemaining,
  poolRoleFor,
  usageToTokenUsage,
  type UsageSnapshot,
} from './quota.js';

describe('costUsdForTokens', () => {
  it('computes real provider $ from rates', () => {
    // kimi: $3/1M in + $15/1M out → 1M in + 1M out = $18
    const usd = costUsdForTokens('kimi_k3', 1_000_000, 1_000_000);
    assert.equal(usd, 18);
  });

  it('handles flash cheap volume', () => {
    const usd = costUsdForTokens('deepseek_v4_flash', 1_000_000, 1_000_000);
    assert.equal(usd, 0.27);
  });

  it('rounds small calls without going negative', () => {
    const usd = costUsdForTokens('deepseek_v4_flash', 1000, 500);
    assert.ok(usd > 0);
    assert.ok(usd < 0.01);
  });
});

describe('plan budgets', () => {
  it('canonical plan uses the $16.50 internal provider ceiling', () => {
    assert.equal(getApiBudgetUsd('spark'), MONTHLY_TOTAL_BUDGET_USD);
    assert.equal(MONTHLY_TOTAL_BUDGET_USD, 16.5);
    assert.equal(getTokenPool('spark'), 6_172_222);
  });

  it('publishes one canonical plan while preserving historical tiers at the same ceiling', () => {
    assert.deepEqual(GALACTIC_PLANS.map((plan) => plan.tier), ['spark']);
    assert.equal(getApiBudgetUsd('pulse'), getApiBudgetUsd('spark'));
    assert.equal(getApiBudgetUsd('singularity'), getApiBudgetUsd('spark'));
  });

  it('launch-promotion users receive the same complete cycle capacity', () => {
    const trial = getPlanByTier('unpaid')!;
    assert.equal(trial.apiBudgetUsd, MONTHLY_TOTAL_BUDGET_USD);
    assert.equal(trial.tokenPool, getTokenPool('spark'));
  });

  it('every galactic plan has apiBudgetUsd + tokenPool', () => {
    for (const p of GALACTIC_PLANS) {
      assert.ok(p.apiBudgetUsd > 0, p.tier);
      assert.ok(p.tokenPool > 0, p.tier);
    }
  });
});

describe('scaled model pools', () => {
  it('internal pools sum near the $16.50 ceiling', () => {
    const pools = dashboardModelPools(MONTHLY_TOTAL_BUDGET_USD);
    const sum = pools.reduce((a, p) => a + p.budgetUsd, 0);
    assert.ok(Math.abs(sum - MONTHLY_TOTAL_BUDGET_USD) < 0.05);
  });

  it('historical tiers cannot unlock more than the canonical plan', () => {
    const spark = dashboardModelPools(getApiBudgetUsd('spark'));
    const nova = dashboardModelPools(getApiBudgetUsd('nova'));
    assert.deepEqual(nova, spark);
  });

  it('scale factor is linear', () => {
    assert.equal(scaleFactorForBudget(MONTHLY_TOTAL_BUDGET_USD), 1);
    assert.ok(Math.abs(scaleFactorForBudget(MONTHLY_TOTAL_BUDGET_USD * 2) - 2) < 1e-9);
  });
});

describe('modelBudgetRemaining + usage snapshot fields', () => {
  const usage: UsageSnapshot = {
    inputTokensUsed: 100,
    outputTokensUsed: 50,
    totalTokensUsed: 150,
    inputTokensRemaining: 1000,
    outputTokensRemaining: 1000,
    totalTokensRemaining: 2000,
    percentUsed: 1,
    quotaPeriodStart: '2026-07-01',
    emergencyTokensAvailable: false,
    emergencyTokensClaimedThisMonth: false,
    totalLimit: 6_172_222,
    planBudgetUsd: 16.5,
    rolloverUsd: 2,
    spentUsd: 1.5,
    creditRemainingUsd: 17.27,
    percentCreditUsed: 8,
    planTier: 'spark',
    byModel: [
      {
        id: 'flagship',
        label: 'Flagship Reasoning',
        inputUsed: 100,
        outputUsed: 50,
        inputLimit: 400_000,
        outputLimit: 400_000,
        totalUsed: 150,
        totalLimit: 888_888,
        percentUsed: 0.1,
        budgetUsd: 8,
        spentUsd: 1.5,
        creditRemainingUsd: 6.5,
      },
    ],
  };

  it('enforces per-model remaining from snapshot', () => {
    const rem = modelBudgetRemaining(usage, 'kimi_k3');
    assert.equal(rem.tokensRemaining, 888_888 - 150);
    assert.equal(rem.creditRemainingUsd, 6.5);
  });

  it('pool roles group deepseek / grok', () => {
    assert.equal(poolRoleFor('deepseek_v4_flash'), 'deepseek_v4');
    assert.equal(poolRoleFor('grok_4_5'), 'grok');
    assert.equal(poolRoleFor('kimi_k3'), 'kimi_k3');
  });

  it('usageToTokenUsage exposes activity without internal provider economics', () => {
    const tu = usageToTokenUsage(usage);
    assert.equal(tu.totalTokensRemaining, 2000);
    assert.ok(!('creditRemainingUsd' in tu));
    assert.ok(!('spentUsd' in tu));
    assert.ok(!('rolloverUsd' in tu));
    assert.ok(!('byModel' in tu));
  });
});
