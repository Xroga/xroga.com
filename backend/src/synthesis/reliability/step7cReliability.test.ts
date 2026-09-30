import {
  readFileSync,
} from 'node:fs';

import {
  randomUUID,
} from 'node:crypto';

import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  completeRun,
  createRun,
  failRun,
  getRun,
  requestRunCancellation,
} from '../../ai/runStore.js';

import {
  BUILD_OUTCOME_RETENTION_MS,
  isLearningEnabled,
} from '../../ai/learningPolicy.js';

import {
  applyBuildOutcomeRoutingMemory,
  summarizeBuildOutcomeRows,
} from '../../ai/buildOutcomeRoutingMemory.js';

import {
  MIN_IMPROVEMENT_SAMPLE_SIZE,
  applyBuildImprovementMemory,
  summarizeBuildImprovementRows,
  type StoredBuildImprovementRow,
} from '../../ai/buildImprovementMemory.js';

import {
  buildOutcomeFromTerminalRun,
  classifyBuildFailure,
} from '../../ai/buildOutcomeMemory.js';

function source(
  path:
    string,
): string {
  return readFileSync(
    new URL(
      path,
      import.meta.url,
    ),

    'utf8',
  );
}

function withLearningSetting<T>(
  value:
    string | undefined,

  run:
    () => T,
): T {
  const previous =
    process.env
      .XROGA_LEARNING_ENABLED;

  if (
    value ===
    undefined
  ) {
    delete process.env
      .XROGA_LEARNING_ENABLED;
  } else {
    process.env
      .XROGA_LEARNING_ENABLED =
      value;
  }

  try {
    return run();
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
}

function improvementRow(
  modelId:
    string,

  success:
    boolean,

  finalVerificationOk:
    boolean | null,

  updatedAt =
    '2026-09-30T12:00:00.000Z',
): StoredBuildImprovementRow {
  return {
    success,

    failure_category:
      success
        ? 'none'
        : 'compile',

    feature_category:
      'universal',

    model_telemetry: [
      {
        modelId,

        taskClass:
          'multi_file_implementation',

        framework:
          'nextjs',

        requiredCapabilities: [
          'software.implement',
        ],

        repairLoops:
          success
            ? 0
            : 1,

        finalVerificationOk,
      },
    ],

    updated_at:
      updatedAt,
  };
}

describe(
  'Step 7C reliability, learning and retirement',
  () => {
    it(
      'reconciles interrupted and orphaned runs to truthful same-run recovery',
      () => {
        const reconciler =
          source(
            '../../ai/runReconciler.ts',
          );

        const index =
          source(
            '../../index.ts',
          );

        assert.match(
          reconciler,
          /BUILD_INTERRUPTED/,
        );

        assert.match(
          reconciler,
          /resumable:\s*true/,
        );

        assert.match(
          reconciler,
          /resumeMode:\s*['"]same_run['"]/,
        );

        assert.match(
          reconciler,
          /reconcileOrphanedRuns/,
        );

        assert.match(
          index,
          /reconcileOrphanedRuns\(\)/,
        );

        assert.match(
          index,
          /failInFlightRuns/,
        );
      },
    );

    it(
      'finalizes a run once and ignores late duplicate completion or failure callbacks',
      () => {
        const previous =
          process.env
            .SUPABASE_SERVICE_ROLE_KEY;

        delete process.env
          .SUPABASE_SERVICE_ROLE_KEY;

        try {
          const runId =
            randomUUID();

          createRun(
            randomUUID(),
            'idempotent finalization',
            runId,
          );

          const first =
            completeRun(
              runId,

              {
                output: {
                  type:
                    'engineering',

                  marker:
                    'authoritative',
                },

                featureCategory:
                  'universal',

                success:
                  true,
              },
            );

          assert.equal(
            first?.status,
            'complete',
          );

          const completedAt =
            first?.completed_at;

          const iterations =
            first?.iteration_count;

          failRun(
            runId,
            'late failure',
            'error',
            {
              code:
                'LATE_FAILURE',
            },
          );

          completeRun(
            runId,

            {
              output: {
                type:
                  'engineering',

                marker:
                  'duplicate',
              },

              success:
                false,
            },
          );

          const final =
            getRun(
              runId,
            );

          assert.equal(
            final?.status,
            'complete',
          );

          assert.equal(
            final?.completed_at,
            completedAt,
          );

          assert.equal(
            final?.iteration_count,
            iterations,
          );

          assert.equal(
            (
              final?.output as
                | {
                    marker?:
                      string;
                  }
                | null
            )
              ?.marker,
            'authoritative',
          );
        } finally {
          if (
            previous ===
            undefined
          ) {
            delete process.env
              .SUPABASE_SERVICE_ROLE_KEY;
          } else {
            process.env
              .SUPABASE_SERVICE_ROLE_KEY =
              previous;
          }
        }
      },
    );

    it(
      'cannot rewrite a completed run as cancelled',
      async () => {
        const previous =
          process.env
            .SUPABASE_SERVICE_ROLE_KEY;

        delete process.env
          .SUPABASE_SERVICE_ROLE_KEY;

        try {
          const runId =
            randomUUID();

          const userId =
            randomUUID();

          createRun(
            userId,
            'late cancellation',
            runId,
          );

          completeRun(
            runId,

            {
              output: {
                type:
                  'engineering',
              },

              success:
                true,
            },
          );

          assert.equal(
            await requestRunCancellation(
              runId,
              userId,
            ),
            false,
          );

          assert.equal(
            getRun(
              runId,
            )
              ?.status,
            'complete',
          );
        } finally {
          if (
            previous ===
            undefined
          ) {
            delete process.env
              .SUPABASE_SERVICE_ROLE_KEY;
          } else {
            process.env
              .SUPABASE_SERVICE_ROLE_KEY =
              previous;
          }
        }
      },
    );

    it(
      'provides a global learning kill switch that restores deterministic ordering',
      () => {
        withLearningSetting(
          'false',

          () => {
            assert.equal(
              isLearningEnabled(),
              false,
            );

            const routing =
              applyBuildOutcomeRoutingMemory(
                [
                  'model-a',
                  'model-b',
                ],

                {
                  schemaVersion:
                    '1.0.0',

                  source:
                    'measured',

                  sampleCount:
                    4,

                  successRate:
                    0,

                  consecutiveFailures:
                    3,

                  recentFailureCategories: [
                    'compile',
                  ],

                  deprioritizedModels: [
                    'model-a',
                  ],
                },
              );

            assert.equal(
              routing.applied,
              false,
            );

            assert.deepEqual(
              routing.candidates,
              [
                'model-a',
                'model-b',
              ],
            );

            const improvement =
              applyBuildImprovementMemory(
                [
                  'model-a',
                  'model-b',
                ],

                {
                  taskClass:
                    'multi_file_implementation',

                  framework:
                    'nextjs',

                  featureCategory:
                    'universal',
                },

                summarizeBuildImprovementRows(
                  Array.from(
                    {
                      length:
                        MIN_IMPROVEMENT_SAMPLE_SIZE,
                    },

                    () =>
                      improvementRow(
                        'model-b',
                        true,
                        true,
                      ),
                  ),

                  Date.parse(
                    '2026-09-30T13:00:00.000Z',
                  ),
                ),
              );

            assert.equal(
              improvement.applied,
              false,
            );

            assert.deepEqual(
              improvement.candidates,
              [
                'model-a',
                'model-b',
              ],
            );
          },
        );
      },
    );

    it(
      'does not let missing, invalid or stale routing evidence dominate current decisions',
      () => {
        const now =
          Date.parse(
            '2026-09-30T13:00:00.000Z',
          );

        const memory =
          summarizeBuildOutcomeRows(
            [
              {
                success:
                  false,

                failure_category:
                  'compile',

                model_telemetry: [
                  {
                    modelId:
                      'model-a',
                  },
                ],

                updated_at:
                  null,
              },

              {
                success:
                  false,

                failure_category:
                  'compile',

                model_telemetry: [
                  {
                    modelId:
                      'model-a',
                  },
                ],

                updated_at:
                  'not-a-date',
              },

              {
                success:
                  false,

                failure_category:
                  'compile',

                model_telemetry: [
                  {
                    modelId:
                      'model-a',
                  },
                ],

                updated_at:
                  '2026-01-01T00:00:00.000Z',
              },
            ],

            now,
          );

        assert.equal(
          memory.sampleCount,
          0,
        );

        assert.deepEqual(
          memory.deprioritizedModels,
          [],
        );
      },
    );

    it(
      'keeps improvement retrieval user-scoped, fresh and deterministically bounded',
      () => {
        const improvement =
          source(
            '../../ai/buildImprovementMemory.ts',
          );

        const routing =
          source(
            '../../ai/buildOutcomeRoutingMemory.ts',
          );

        assert.match(
          improvement,
          /\.eq\(\s*['"]user_id['"]\s*,\s*userId\s*\)/s,
        );

        assert.match(
          improvement,
          /\.gte\(\s*['"]updated_at['"]\s*,\s*cutoff\s*\)/s,
        );

        assert.match(
          improvement,
          /\.limit\(\s*MAX_IMPROVEMENT_ROWS\s*\)/s,
        );

        assert.match(
          routing,
          /\.eq\(\s*['"]user_id['"]\s*,\s*userId\s*\)/s,
        );

        assert.match(
          routing,
          /\.gte\(\s*['"]updated_at['"]\s*,\s*cutoff\s*\)/s,
        );

        assert.match(
          routing,
          /\.limit\(\s*MAX_ROWS\s*\)/s,
        );
      },
    );

    it(
      'retains learning outcomes for a finite period and prunes only the owning user',
      () => {
        const memory =
          source(
            '../../ai/buildOutcomeMemory.ts',
          );

        assert.ok(
          BUILD_OUTCOME_RETENTION_MS >
            0,
        );

        assert.match(
          memory,
          /\.delete\(\)[\s\S]*\.eq\(\s*['"]user_id['"]\s*,\s*outcome\.userId\s*\)[\s\S]*\.lt\(\s*['"]updated_at['"]\s*,\s*cutoff\s*\)/s,
        );
      },
    );

    it(
      'serializes no raw prompt, project source, messages, secrets or reasoning into BuildOutcome',
      () => {
        const secret =
          'STEP7C_PRIVATE_VALUE';

        const outcome =
          buildOutcomeFromTerminalRun({
            runId:
              'privacy-run',

            userId:
              '00000000-0000-0000-0000-000000000001',

            terminalStatus:
              'complete',

            featureCategory:
              'universal',

            iterationCount:
              1,

            output: {
              prompt:
                secret,

              source:
                secret,

              messages: [
                secret,
              ],

              environment: {
                API_KEY:
                  secret,
              },

              reasoning:
                secret,
            },

            routingOutcomes:
              [],
          });

        const serialized =
          JSON.stringify(
            outcome,
          );

        assert.doesNotMatch(
          serialized,
          new RegExp(
            secret,
          ),
        );

        assert.doesNotMatch(
          serialized,
          /API_KEY/,
        );
      },
    );

    it(
      'requires verified evidence before a successful build can teach a positive model preference',
      () => {
        withLearningSetting(
          'true',

          () => {
            const memory =
              summarizeBuildImprovementRows(
                Array.from(
                  {
                    length:
                      MIN_IMPROVEMENT_SAMPLE_SIZE,
                  },

                  () =>
                    improvementRow(
                      'model-b',
                      true,
                      null,
                    ),
                ),

                Date.parse(
                  '2026-09-30T13:00:00.000Z',
                ),
              );

            const decision =
              applyBuildImprovementMemory(
                [
                  'model-a',
                  'model-b',
                ],

                {
                  taskClass:
                    'multi_file_implementation',

                  framework:
                    'nextjs',

                  featureCategory:
                    'universal',
                },

                memory,
              );

            assert.equal(
              decision.applied,
              false,
            );
          },
        );
      },
    );

    it(
      'keeps the canonical Agent V2 implementation and Universal verifier authoritative',
      () => {
        const entry =
          source(
            '../universalEntrypoint.ts',
          );

        const adapter =
          source(
            '../softwareAgentImplementationAdapter.ts',
          );

        const execution =
          source(
            '../universalExecution.ts',
          );

        assert.match(
          adapter,
          /runSoftwareAgentRuntime/,
        );

        assert.match(
          adapter,
          /verificationAuthority:\s*['"]universal['"]/,
        );

        assert.doesNotMatch(
          adapter,
          /runLegacy/,
        );

        assert.doesNotMatch(
          entry,
          /repairIncrementally/,
        );

        assert.match(
          entry,
          /forceContinueFromCheckpoint\s*:\s*true/,
        );

        assert.match(
          execution,
          /runValidationAsCanonicalTask/,
        );
      },
    );

    it(
      'refuses wrong-product legacy fallback instead of converting unknown non-web work into static HTML',
      () => {
        const execution =
          source(
            '../universalExecution.ts',
          );

        assert.match(
          execution,
          /fallback would succeed at building the wrong product rather than fail/,
        );

        assert.match(
          execution,
          /the legacy pipeline cannot build/,
        );
      },
    );

    it(
      'keeps GitHub and deployment optional after verified project persistence',
      () => {
        const delivery =
          source(
            '../delivery/projectDeliveryService.ts',
          );

        const state =
          source(
            '../delivery/projectDelivery.ts',
          );

        assert.match(
          delivery,
          /GitHub is optional/,
        );

        assert.match(
          state,
          /optional[\s\S]*requested external delivery channel/s,
        );
      },
    );

    it(
      'keeps the failure taxonomy stable and structured',
      () => {
        assert.equal(
          classifyBuildFailure({
            terminalStatus:
              'error',

            output: {
              code:
                'BUILD_INTERRUPTED',
            },
          })
            .category,
          'interrupted',
        );

        assert.equal(
          classifyBuildFailure({
            terminalStatus:
              'error',

            output: {
              code:
                'PROVIDER_CAPACITY_UNAVAILABLE',
            },
          })
            .category,
          'capacity',
        );

        assert.equal(
          classifyBuildFailure({
            terminalStatus:
              'error',

            output: {
              code:
                'BROWSER_VERIFICATION_FAILED',
            },
          })
            .category,
          'preview',
        );

        assert.equal(
          classifyBuildFailure({
            terminalStatus:
              'error',

            output: {
              code:
                'DEPLOYMENT_FAILED',
            },
          })
            .category,
          'deployment',
        );
      },
    );

    it(
      'locks production to retirement mode while preserving only the explicit operator rollback boundary',
      () => {
        const fly =
          source(
            '../../../../fly.api.toml',
          );

        const retirement =
          source(
            './legacyRetirement.test.ts',
          );

        assert.match(
          fly,
          /UNIVERSAL_AGENT_ENABLED\s*=\s*['"]retirement['"]/,
        );

        assert.match(
          retirement,
          /explicit operator legacy mode as the emergency rollback/,
        );

        assert.match(
          retirement,
          /removes the legacy implementation callback from the universal agent/,
        );
      },
    );
  },
);
