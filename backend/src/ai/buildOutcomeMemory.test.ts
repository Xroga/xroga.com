import {
  readFileSync,
} from 'node:fs';

import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import type {
  RoutingOutcome,
} from './routingOutcomes.js';

import {
  buildOutcomeFromTerminalRun,
  classifyBuildFailure,
  recordBuildOutcomeFailOpen,
  type BuildOutcomeRecord,
  type BuildOutcomeStore,
} from './buildOutcomeMemory.js';

class MemoryStore
implements BuildOutcomeStore {
  readonly rows =
    new Map<
      string,
      BuildOutcomeRecord
    >();

  async upsert(
    outcome:
      BuildOutcomeRecord,
  ): Promise<void> {
    this.rows.set(
      outcome.runId,
      outcome,
    );
  }
}

describe(
  'Step 7B.1 BuildOutcome memory',
  () => {
    it(
      'classifies terminal failures deterministically from stable evidence',
      () => {
        assert.deepEqual(
          classifyBuildFailure({
            terminalStatus:
              'error',

            output: {
              type:
                'error',

              code:
                'BUILD_INTERRUPTED',

              error:
                'raw text must not control classification',
            },
          }),

          {
            category:
              'interrupted',

            code:
              'BUILD_INTERRUPTED',
          },
        );

        assert.equal(
          classifyBuildFailure({
            terminalStatus:
              'error',

            output: {
              compile: {
                ok:
                  false,
              },
            },
          })
            .category,

          'compile',
        );

        assert.equal(
          classifyBuildFailure({
            terminalStatus:
              'error',

            output: {
              qa: {
                ok:
                  false,
              },
            },
          })
            .category,

          'verification',
        );

        assert.equal(
          classifyBuildFailure({
            terminalStatus:
              'cancelled',

            output:
              null,
          })
            .category,

          'user_cancelled',
        );
      },
    );

    it(
      'stores sanitized model telemetry without user prompt, source, messages or repository contents',
      () => {
        const routing:
          RoutingOutcome[] = [
            {
              runId:
                'run-1',

              userId:
                'user-secret-id',

              taskClass:
                'multi_file_implementation',

              modelId:
                'deepseek_v4_flash',

              mode:
                'balanced',

              latencyMs:
                321,

              inputTokens:
                1200,

              outputTokens:
                400,

              estimatedCostUsd:
                0.02,

              patchApplied:
                true,

              repairLoops:
                1,

              modelSwitches:
                0,

              provider:
                'deepseek',

              framework:
                'nextjs',

              requiredCapabilities: [
                'software.implement',
              ],

              finalVerificationOk:
                true,
            },
          ];

        const outcome =
          buildOutcomeFromTerminalRun({
            runId:
              'run-1',

            userId:
              'user-1',

            terminalStatus:
              'complete',

            featureCategory:
              'universal',

            iterationCount:
              1,

            createdAt:
              '2026-09-30T10:00:00.000Z',

            completedAt:
              '2026-09-30T10:00:05.000Z',

            output: {
              type:
                'engineering',

              prompt:
                'THIS MUST NOT BE STORED',

              source:
                'PRIVATE SOURCE MUST NOT BE STORED',

              messages: [
                'PRIVATE MESSAGE',
              ],
            },

            routingOutcomes:
              routing,

            recordedAt:
              '2026-09-30T10:00:05.000Z',
          });

        assert.equal(
          outcome.success,
          true,
        );

        assert.equal(
          outcome.failureCategory,
          'none',
        );

        assert.equal(
          outcome.durationMs,
          5000,
        );

        assert.equal(
          outcome.modelTelemetry
            .length,
          1,
        );

        const serialized =
          JSON.stringify(
            outcome,
          );

        assert.doesNotMatch(
          serialized,

          /THIS MUST NOT BE STORED/,
        );

        assert.doesNotMatch(
          serialized,

          /PRIVATE SOURCE/,
        );

        assert.doesNotMatch(
          serialized,

          /PRIVATE MESSAGE/,
        );

        assert.doesNotMatch(
          serialized,

          /user-secret-id/,
        );
      },
    );

    it(
      'is idempotent by run id when the same run receives a later authoritative outcome',
      async () => {
        const store =
          new MemoryStore();

        const first =
          buildOutcomeFromTerminalRun({
            runId:
              'same-run',

            userId:
              'user-1',

            terminalStatus:
              'error',

            iterationCount:
              1,

            output: {
              code:
                'BUILD_INTERRUPTED',
            },

            routingOutcomes:
              [],
          });

        const final =
          buildOutcomeFromTerminalRun({
            runId:
              'same-run',

            userId:
              'user-1',

            terminalStatus:
              'complete',

            iterationCount:
              2,

            output: {
              type:
                'engineering',
            },

            routingOutcomes:
              [],
          });

        assert.equal(
          await recordBuildOutcomeFailOpen(
            first,
            store,
          ),
          true,
        );

        assert.equal(
          await recordBuildOutcomeFailOpen(
            final,
            store,
          ),
          true,
        );

        assert.equal(
          store.rows.size,
          1,
        );

        assert.equal(
          store.rows
            .get(
              'same-run',
            )
            ?.success,
          true,
        );
      },
    );

    it(
      'fails open when learning-memory persistence is unavailable',
      async () => {
        const outcome =
          buildOutcomeFromTerminalRun({
            runId:
              'run-fail-open',

            userId:
              'user-1',

            terminalStatus:
              'complete',

            iterationCount:
              1,

            output:
              null,

            routingOutcomes:
              [],
          });

        const store:
          BuildOutcomeStore = {
          async upsert() {
            throw new Error(
              'database offline',
            );
          },
        };

        const recorded =
          await recordBuildOutcomeFailOpen(
            outcome,
            store,
          );

        assert.equal(
          recorded,
          false,
        );
      },
    );

    it(
      'uses a Supabase primary-key upsert for production idempotence',
      () => {
        const implementation =
          readFileSync(
            new URL(
              './buildOutcomeMemory.ts',
              import.meta.url,
            ),

            'utf8',
          );

        const migration =
          readFileSync(
            new URL(
              '../../../supabase/migrations/20260930152000_step7b_build_outcomes.sql',
              import.meta.url,
            ),

            'utf8',
          );

        assert.match(
          implementation,

          /onConflict\s*:\s*['"]run_id['"]/,
        );

        assert.match(
          migration,

          /run_id\s+TEXT\s+PRIMARY KEY/i,
        );
      },
    );

    it(
      'explicitly limits BuildOutcome reuse to evaluation and routing rather than fine-tuning',
      () => {
        const outcome =
          buildOutcomeFromTerminalRun({
            runId:
              'run-scope',

            userId:
              'user-1',

            terminalStatus:
              'complete',

            iterationCount:
              1,

            output:
              null,

            routingOutcomes:
              [],
          });

        assert.equal(
          outcome.reuseScope,
          'evaluation_and_routing',
        );

        assert.notEqual(
          outcome.reuseScope as string,
          'fine_tuning',
        );
      },
    );
  },
);
