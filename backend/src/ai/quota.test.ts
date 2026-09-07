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

describe(
  'costUsdForTokens',
  () => {
    it(
      'computes real provider $ from rates',
      () => {
        const usd =
          costUsdForTokens(
            'kimi_k3',
            1_000_000,
            1_000_000,
          );

        assert.equal(
          usd,
          18,
        );
      },
    );

    it(
      'handles DeepSeek Flash cheap volume',
      () => {
        const usd =
          costUsdForTokens(
            'deepseek_v4_flash',
            1_000_000,
            1_000_000,
          );

        assert.equal(
          usd,
          0.27,
        );
      },
    );

    it(
      'rounds small calls without going negative',
      () => {
        const usd =
          costUsdForTokens(
            'deepseek_v4_flash',
            1_000,
            500,
          );

        assert.ok(
          usd > 0,
        );

        assert.ok(
          usd < 0.01,
        );
      },
    );
  },
);

describe(
  'plan budgets',
  () => {
    it(
      'canonical plan uses the $16.50 internal provider ceiling',
      () => {
        assert.equal(
          getApiBudgetUsd(
            'spark',
          ),
          MONTHLY_TOTAL_BUDGET_USD,
        );

        assert.equal(
          MONTHLY_TOTAL_BUDGET_USD,
          16.5,
        );

        assert.equal(
          getTokenPool(
            'spark',
          ),
          6_172_222,
        );
      },
    );

    it(
      'publishes one canonical plan while preserving historical tiers at the same ceiling',
      () => {
        assert.deepEqual(
          GALACTIC_PLANS.map(
            (plan) =>
              plan.tier,
          ),
          ['spark'],
        );

        assert.equal(
          getApiBudgetUsd(
            'pulse',
          ),
          getApiBudgetUsd(
            'spark',
          ),
        );

        assert.equal(
          getApiBudgetUsd(
            'singularity',
          ),
          getApiBudgetUsd(
            'spark',
          ),
        );
      },
    );

    it(
      'launch promotion users receive the same complete cycle capacity',
      () => {
        const trial =
          getPlanByTier(
            'unpaid',
          )!;

        assert.equal(
          trial.apiBudgetUsd,
          MONTHLY_TOTAL_BUDGET_USD,
        );

        assert.equal(
          trial.tokenPool,
          getTokenPool(
            'spark',
          ),
        );
      },
    );

    it(
      'every public plan has budget and token capacity',
      () => {
        for (
          const plan of
          GALACTIC_PLANS
        ) {
          assert.ok(
            plan.apiBudgetUsd >
              0,
          );

          assert.ok(
            plan.tokenPool >
              0,
          );
        }
      },
    );
  },
);

describe(
  'scaled model pools',
  () => {
    it(
      'internal pools sum near the $16.50 ceiling',
      () => {
        const pools =
          dashboardModelPools(
            MONTHLY_TOTAL_BUDGET_USD,
          );

        const sum =
          pools.reduce(
            (
              total,
              pool,
            ) =>
              total +
              pool.budgetUsd,
            0,
          );

        assert.ok(
          Math.abs(
            sum -
              MONTHLY_TOTAL_BUDGET_USD,
          ) < 0.05,
        );
      },
    );

    it(
      'combined GLM family preserves the historical economic pool',
      () => {
        const pools =
          dashboardModelPools(
            MONTHLY_TOTAL_BUDGET_USD,
          );

        const glm =
          pools.find(
            (pool) =>
              pool.role ===
              'glm_5_2',
          );

        assert.ok(glm);

        assert.equal(
          glm.totalLimit,
          2_000_000,
        );

        assert.equal(
          glm.budgetUsd,
          5.8,
        );
      },
    );

    it(
      'historical tiers cannot unlock more than the canonical plan',
      () => {
        const spark =
          dashboardModelPools(
            getApiBudgetUsd(
              'spark',
            ),
          );

        const nova =
          dashboardModelPools(
            getApiBudgetUsd(
              'nova',
            ),
          );

        assert.deepEqual(
          nova,
          spark,
        );
      },
    );

    it(
      'scale factor is linear',
      () => {
        assert.equal(
          scaleFactorForBudget(
            MONTHLY_TOTAL_BUDGET_USD,
          ),
          1,
        );

        assert.ok(
          Math.abs(
            scaleFactorForBudget(
              MONTHLY_TOTAL_BUDGET_USD *
                2,
            ) - 2,
          ) < 1e-9,
        );
      },
    );
  },
);

describe(
  'modelBudgetRemaining and public usage fields',
  () => {
    const usage: UsageSnapshot =
      {
        inputTokensUsed: 100,
        outputTokensUsed: 50,
        totalTokensUsed: 150,

        inputTokensRemaining:
          1000,

        outputTokensRemaining:
          1000,

        totalTokensRemaining:
          2000,

        percentUsed: 1,

        quotaPeriodStart:
          '2026-07-01',

        emergencyTokensAvailable:
          false,

        emergencyTokensClaimedThisMonth:
          false,

        totalLimit:
          6_172_222,

        planBudgetUsd:
          16.5,

        rolloverUsd: 2,
        spentUsd: 1.5,

        creditRemainingUsd:
          17.27,

        percentCreditUsed: 8,

        planTier: 'spark',

        byModel: [
          {
            id: 'flagship',

            label:
              'Flagship Reasoning',

            inputUsed: 100,
            outputUsed: 50,

            inputLimit:
              400_000,

            outputLimit:
              400_000,

            totalUsed: 150,

            totalLimit:
              888_888,

            percentUsed: 0.1,

            budgetUsd: 8,
            spentUsd: 1.5,

            creditRemainingUsd:
              6.5,
          },
        ],
      };

    it(
      'enforces remaining capacity from the snapshot',
      () => {
        const remaining =
          modelBudgetRemaining(
            usage,
            'kimi_k3',
          );

        assert.equal(
          remaining.tokensRemaining,
          888_888 - 150,
        );

        assert.equal(
          remaining.creditRemainingUsd,
          6.5,
        );
      },
    );

    it(
      'pool roles group provider families',
      () => {
        assert.equal(
          poolRoleFor(
            'deepseek_v4_flash',
          ),
          'deepseek_v4',
        );

        assert.equal(
          poolRoleFor(
            'glm_5_2',
          ),
          'glm_5_2',
        );

        assert.equal(
          poolRoleFor(
            'glm_5_3',
          ),
          'glm_5_2',
        );

        assert.equal(
          poolRoleFor(
            'glm_5_3_flash',
          ),
          'glm_5_2',
        );

        assert.equal(
          poolRoleFor(
            'grok_4_5',
          ),
          'grok',
        );

        assert.equal(
          poolRoleFor(
            'kimi_k3',
          ),
          'kimi_k3',
        );
      },
    );

    it(
      'public usage hides internal provider economics',
      () => {
        const tokenUsage =
          usageToTokenUsage(
            usage,
          );

        assert.equal(
          tokenUsage.totalTokensRemaining,
          2000,
        );

        assert.ok(
          !(
            'creditRemainingUsd' in
            tokenUsage
          ),
        );

        assert.ok(
          !(
            'spentUsd' in
            tokenUsage
          ),
        );

        assert.ok(
          !(
            'rolloverUsd' in
            tokenUsage
          ),
        );

        assert.ok(
          !(
            'byModel' in
            tokenUsage
          ),
        );
      },
    );
  },
);
