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
  it('spark matches base $16.77 / 6.17M pool', () => {
    assert.equal(getApiBudgetUsd('spark'), MONTHLY_TOTAL_BUDGET_USD);
    assert.equal(getTokenPool('spark'), 6_172_222);
  });

  it('higher plans get larger API credit', () => {
    assert.ok(getApiBudgetUsd('pulse') > getApiBudgetUsd('spark'));
    assert.ok(getApiBudgetUsd('nova') > getApiBudgetUsd('pulse'));
    assert.ok(getApiBudgetUsd('singularity') > getApiBudgetUsd('zenith'));
  });

  it('trial is capped below spark', () => {
    const trial = getPlanByTier('unpaid')!;
    assert.ok(trial.apiBudgetUsd < MONTHLY_TOTAL_BUDGET_USD);
    assert.ok(trial.tokenPool < getTokenPool('spark'));
  });

  it('every galactic plan has apiBudgetUsd + tokenPool', () => {
    for (const p of GALACTIC_PLANS) {
      assert.ok(p.apiBudgetUsd > 0, p.tier);
      assert.ok(p.tokenPool > 0, p.tier);
    }
  });
});

describe('scaled model pools', () => {
  it('spark pools sum near $16.77', () => {
    const pools = dashboardModelPools(MONTHLY_TOTAL_BUDGET_USD);
    const sum = pools.reduce((a, p) => a + p.budgetUsd, 0);
    assert.ok(Math.abs(sum - MONTHLY_TOTAL_BUDGET_USD) < 0.05);
  });

  it('nova pools scale up', () => {
    const spark = dashboardModelPools(getApiBudgetUsd('spark'));
    const nova = dashboardModelPools(getApiBudgetUsd('nova'));
    assert.ok(nova[0].totalLimit > spark[0].totalLimit);
    assert.ok(nova[0].budgetUsd > spark[0].budgetUsd);
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
    planBudgetUsd: 16.77,
    rolloverUsd: 2,
    spentUsd: 1.5,
    creditRemainingUsd: 17.27,
    percentCreditUsed: 8,
    planTier: 'spark',
    byModel: [
      {
        role: 'kimi_k3',
        label: 'Xroga Apex',
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

  it('usageToTokenUsage exposes credit without inventing invoice fields', () => {
    const tu = usageToTokenUsage(usage);
    assert.equal(tu.totalTokensRemaining, 2000);
    assert.equal(tu.creditRemainingUsd, 17.27);
    assert.equal(tu.spentUsd, 1.5);
    assert.equal(tu.rolloverUsd, 2);
    assert.ok(!('providerInvoiceUsd' in tu));
  });
});
