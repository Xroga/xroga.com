import {
  readFileSync,
} from 'node:fs';

import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  buildOutcomeFromTerminalRun,
} from './buildOutcomeMemory.js';

import {
  evaluateBuildOutcomes,
  normalizeBuildOutcomeEvaluationRow,
} from './buildOutcomeEvaluation.js';

import {
  MIN_STRATEGY_SAMPLE_SIZE,
  preferGoldenExampleIds,
  preferRecipeIds,
  prioritizeValidationPhases,
  summarizeBuildStrategyRows,
  type BuildStrategyMemory,
  type StoredBuildStrategyRow,
} from './buildStrategyMemory.js';

import {
  prepareProductIntelligence,
} from '../synthesis/productIntelligence.js';

import {
  selectGoldenExamples,
} from '../synthesis/goldenExamples.js';

function measured(
  rows:
    readonly StoredBuildStrategyRow[],
): BuildStrategyMemory {
  return summarizeBuildStrategyRows(
    rows,
    Date.now(),
  );
}

function row(
  input: {
    recipeId?:
      string | null;

    goldenExampleIds?:
      readonly string[];

    success?:
      boolean;

    verified?:
      boolean;

    learningEligible?:
      boolean;

    failureDomain?:
      string | null;

    failureStage?:
      string | null;
  } = {},
): StoredBuildStrategyRow {
  return {
    success:
      input.success ??
      true,

    verified:
      input.verified ??
      true,

    learning_eligible:
      input.learningEligible ??
      true,

    taxonomy_id:
      'custom.web',

    product_surface:
      'web_frontend',

    product_subtype:
      'custom',

    recipe_id:
      input.recipeId ??
      null,

    golden_example_ids:
      input.goldenExampleIds ??
      [],

    failure_domain:
      input.failureDomain ??
      'none',

    failure_stage:
      input.failureStage ??
      'none',

    updated_at:
      new Date()
        .toISOString(),
  };
}

describe(
  'Step 7B bounded strategy learning',
  () => {
    it(
      'low-sample evidence cannot reorder recipe or golden-example candidates',
      () => {
        const memory =
          measured(
            Array.from(
              {
                length:
                  MIN_STRATEGY_SAMPLE_SIZE -
                  1,
              },

              () =>
                row({
                  recipeId:
                    'candidate-b',

                  goldenExampleIds: [
                    'example-b',
                  ],
                }),
            ),
          );

        const context = {
          taxonomyId:
            'custom.web',

          surface:
            'web_frontend',

          subtype:
            'custom',
        };

        assert.deepEqual(
          preferRecipeIds(
            [
              'candidate-a',
              'candidate-b',
            ],

            context,

            memory,
          ).candidates,

          [
            'candidate-a',
            'candidate-b',
          ],
        );

        assert.deepEqual(
          preferGoldenExampleIds(
            [
              'example-a',
              'example-b',
            ],

            context,

            memory,
          ).candidates,

          [
            'example-a',
            'example-b',
          ],
        );
      },
    );

    it(
      'strong verified evidence may reorder only candidates already supplied by deterministic planning',
      () => {
        const memory =
          measured(
            Array.from(
              {
                length:
                  MIN_STRATEGY_SAMPLE_SIZE,
              },

              () =>
                row({
                  recipeId:
                    'candidate-b',
                }),
            ),
          );

        const decision =
          preferRecipeIds(
            [
              'candidate-a',
              'candidate-b',
            ],

            {
              taxonomyId:
                'custom.web',

              surface:
                'web_frontend',

              subtype:
                'custom',
            },

            memory,
          );

        assert.equal(
          decision.applied,
          true,
        );

        assert.deepEqual(
          decision.candidates,

          [
            'candidate-b',
            'candidate-a',
          ],
        );

        const invalidOnly =
          preferRecipeIds(
            [
              'candidate-a',
            ],

            {
              taxonomyId:
                'custom.web',

              surface:
                'web_frontend',

              subtype:
                'custom',
            },

            measured(
              Array.from(
                {
                  length:
                    MIN_STRATEGY_SAMPLE_SIZE,
                },

                () =>
                  row({
                    recipeId:
                      'not-a-valid-candidate',
                  }),
              ),
            ),
          );

        assert.deepEqual(
          invalidOnly.candidates,

          [
            'candidate-a',
          ],
        );
      },
    );

    it(
      'product taxonomy still outranks historical recipe preference',
      () => {
        const memory =
          measured(
            Array.from(
              {
                length:
                  MIN_STRATEGY_SAMPLE_SIZE,
              },

              () => ({
                ...row({
                  recipeId:
                    'web.portfolio',
                }),

                taxonomy_id:
                  'web.landing',

                product_subtype:
                  'landing_page',
              }),
            ),
          );

        const prepared =
          prepareProductIntelligence({
            text:
              'Build a one-page marketing landing page for a dental clinic',

            surfaces: [
              'web_frontend',
            ],

            learningMemory:
              memory,
          });

        assert.equal(
          prepared.classification
            ?.taxonomyId,
          'web.landing',
        );

        assert.equal(
          prepared.recipe
            ?.id,
          'web.static_landing',
        );
      },
    );

    it(
      'golden examples can only reorder compatible examples and can never insert an incompatible id',
      () => {
        const prepared =
          prepareProductIntelligence({
            text:
              'Build a photography portfolio',

            surfaces: [
              'web_frontend',
            ],
          });

        const examples =
          selectGoldenExamples({
            classification:
              prepared.classification,

            recipe:
              prepared.recipe,

            nichePack:
              prepared.nichePack,

            preferredIds: [
              'does.not.exist',
            ],

            limit:
              4,
          });

        assert.ok(
          examples.length >
          0,
        );

        assert.equal(
          examples.some(
            (
              example,
            ) =>
              example.id ===
              'does.not.exist',
          ),
          false,
        );
      },
    );

    it(
      'verification learning can change order but never coverage',
      () => {
        const phases = [
          'install',
          'lint',
          'typecheck',
          'test',
          'build',
          'package',
        ] as const;

        const memory =
          measured(
            Array.from(
              {
                length:
                  MIN_STRATEGY_SAMPLE_SIZE,
              },

              () =>
                row({
                  success:
                    false,

                  verified:
                    false,

                  failureDomain:
                    'project',

                  failureStage:
                    'test',
                }),
            ),
          );

        const prioritized =
          prioritizeValidationPhases(
            phases,

            {
              taxonomyId:
                'custom.web',

              surface:
                'web_frontend',

              subtype:
                'custom',
            },

            memory,
          );

        assert.equal(
          prioritized[0],
          'test',
        );

        assert.deepEqual(
          [
            ...prioritized,
          ].sort(),

          [
            ...phases,
          ].sort(),
        );
      },
    );

    it(
      'the global kill switch restores deterministic candidate order exactly',
      () => {
        const previous =
          process.env
            .XROGA_LEARNING_ENABLED;

        process.env
          .XROGA_LEARNING_ENABLED =
          'false';

        try {
          const memory =
            measured(
              Array.from(
                {
                  length:
                    MIN_STRATEGY_SAMPLE_SIZE,
                },

                () =>
                  row({
                    recipeId:
                      'candidate-b',
                  }),
              ),
            );

          assert.deepEqual(
            preferRecipeIds(
              [
                'candidate-a',
                'candidate-b',
              ],

              {
                taxonomyId:
                  'custom.web',

                surface:
                  'web_frontend',

                subtype:
                  'custom',
              },

              memory,
            ).candidates,

            [
              'candidate-a',
              'candidate-b',
            ],
          );
        } finally {
          if (
            previous ===
            undefined
          ) {
            delete process.env
              .XROGA_LEARNING_ENABLED;
          } else {
            process.env
              .XROGA_LEARNING_ENABLED =
              previous;
          }
        }
      },
    );

    it(
      'BuildOutcome records structured lifecycle evidence without private build content',
      () => {
        const outcome =
          buildOutcomeFromTerminalRun({
            runId:
              'run-learning-1',

            userId:
              'user-1',

            terminalStatus:
              'complete',

            featureCategory:
              'universal',

            iterationCount:
              2,

            output: {
              prompt:
                'PRIVATE PROMPT',

              source:
                'PRIVATE SOURCE',

              messages: [
                'PRIVATE MESSAGE',
              ],

              verified:
                true,

              generatedFiles: [
                'src/a.ts',
                'src/b.ts',
              ],

              projectRunState: {
                verification: {
                  status:
                    'succeeded',
                },

                persistence: {
                  status:
                    'succeeded',
                },

                publication: {
                  status:
                    'not_requested',
                },

                deployment: {
                  status:
                    'not_requested',
                },

                runtime: {
                  status:
                    'succeeded',
                },
              },

              learningContext: {
                taxonomyId:
                  'web.dashboard',

                surface:
                  'web_frontend',

                subtype:
                  'dashboard',

                domain:
                  'business',

                recipeId:
                  'web.dashboard',

                goldenExampleIds: [
                  'dashboard.application',
                ],

                framework:
                  'next',

                runtime:
                  'node',

                adapterId:
                  'node',

                learningDecision: {
                  recipePreferenceApplied:
                    false,

                  goldenExamplePreferenceApplied:
                    false,

                  recipeSampleSize:
                    0,

                  recipeConfidence:
                    null,

                  goldenSampleSize:
                    0,

                  goldenConfidence:
                    null,

                  modelPreferenceApplied:
                    false,

                  modelSampleSize:
                    0,

                  modelConfidence:
                    null,

                  verificationPriorityApplied:
                    false,
                },
              },
            },

            routingOutcomes:
              [],
          });

        assert.equal(
          outcome.verified,
          true,
        );

        assert.equal(
          outcome.learningEligible,
          true,
        );

        assert.equal(
          outcome.recipeId,
          'web.dashboard',
        );

        assert.equal(
          outcome.generatedFileCount,
          2,
        );

        assert.equal(
          outcome.runtimePassed,
          true,
        );

        const serialized =
          JSON.stringify(
            outcome,
          );

        assert.doesNotMatch(
          serialized,
          /PRIVATE PROMPT|PRIVATE SOURCE|PRIVATE MESSAGE/,
        );
      },
    );

    it(
      'provider/cancel/interruption evidence cannot poison project strategy, while optional delivery failure preserves verified quality',
      () => {
        const provider =
          buildOutcomeFromTerminalRun({
            runId:
              'provider-failure',

            userId:
              'user-1',

            terminalStatus:
              'error',

            iterationCount:
              1,

            output: {
              code:
                'PROVIDER_UNAVAILABLE',
            },

            routingOutcomes:
              [],
          });

        assert.equal(
          provider.failureDomain,
          'provider',
        );

        assert.equal(
          provider.learningEligible,
          false,
        );

        const delivery =
          buildOutcomeFromTerminalRun({
            runId:
              'delivery-failure',

            userId:
              'user-1',

            terminalStatus:
              'error',

            iterationCount:
              1,

            output: {
              code:
                'VERCEL_DEPLOY_FAILED',

              verified:
                true,

              projectRunState: {
                verification: {
                  status:
                    'succeeded',
                },

                persistence: {
                  status:
                    'succeeded',
                },

                publication: {
                  status:
                    'not_requested',
                },

                deployment: {
                  status:
                    'failed',
                },
              },
            },

            routingOutcomes:
              [],
          });

        assert.equal(
          delivery.failureDomain,
          'delivery',
        );

        assert.equal(
          delivery.verified,
          true,
        );

        assert.equal(
          delivery.learningEligible,
          true,
        );
      },
    );

    it(
      'old minimal rows remain readable and evaluation separates project/provider failures',
      () => {
        const old =
          normalizeBuildOutcomeEvaluationRow({
            schema_version:
              '1.0.0',

            success:
              true,
          });

        assert.equal(
          old.schemaVersion,
          '1.0.0',
        );

        assert.equal(
          old.verified,
          false,
        );

        const evaluation =
          evaluateBuildOutcomes([
            {
              schema_version:
                '1.1.0',

              success:
                true,

              verified:
                true,

              learning_eligible:
                true,

              failure_domain:
                'none',

              failure_stage:
                'none',

              repair_rounds:
                1,

              verification_attempts:
                2,

              model_telemetry: [
                {
                  modelSwitches:
                    1,
                },
              ],

              learning_decision: {
                modelPreferenceApplied:
                  true,
              },
            },

            {
              schema_version:
                '1.1.0',

              success:
                false,

              verified:
                false,

              learning_eligible:
                true,

              failure_domain:
                'project',

              failure_stage:
                'browser',

              repair_rounds:
                2,
            },

            {
              schema_version:
                '1.1.0',

              success:
                false,

              verified:
                false,

              learning_eligible:
                false,

              failure_domain:
                'provider',

              failure_stage:
                'unknown',
            },
          ]);

        assert.equal(
          evaluation.comparableOutcomes,
          2,
        );

        assert.equal(
          evaluation.verifiedSuccessRate,
          0.5,
        );

        assert.equal(
          evaluation.projectFailureRate,
          0.5,
        );

        assert.equal(
          evaluation.providerFailureRate,
          1 /
            3,
        );

        assert.equal(
          evaluation.browserFailureRate,
          0.5,
        );
      },
    );

    it(
      'production learning storage is service-role only and indexed by product context',
      () => {
        const migration =
          readFileSync(
            new URL(
              '../../../supabase/migrations/20260930203500_step7b_strategy_learning.sql',
              import.meta.url,
            ),

            'utf8',
          );

        assert.match(
          migration,
          /REVOKE ALL[\s\S]*FROM anon, authenticated/i,
        );

        assert.match(
          migration,
          /idx_build_outcomes_product_context/,
        );

        assert.match(
          migration,
          /idx_build_outcomes_recipe/,
        );

        assert.match(
          migration,
          /learning_eligible/,
        );
      },
    );
  },
);
