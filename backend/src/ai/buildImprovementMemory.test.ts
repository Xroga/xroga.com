import {
  readFileSync,
} from 'node:fs';

import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  MAX_IMPROVEMENT_AGE_MS,
  MIN_IMPROVEMENT_SAMPLE_SIZE,
  applyBuildImprovementMemory,
  loadBuildImprovementMemory,
  summarizeBuildImprovementRows,
  type BuildImprovementRowSource,
  type StoredBuildImprovementRow,
} from './buildImprovementMemory.js';

const NOW =
  Date.parse(
    '2026-09-30T12:00:00.000Z',
  );

function row(
  input: {
    readonly modelId:
      string;

    readonly success:
      boolean;

    readonly failureCategory:
      string;

    readonly finalVerificationOk:
      boolean | null;

    readonly updatedAt?:
      string;

    readonly extraTelemetry?:
      Record<
        string,
        unknown
      >;
  },
): StoredBuildImprovementRow {
  return {
    success:
      input.success,

    failure_category:
      input.failureCategory,

    feature_category:
      'universal',

    model_telemetry: [
      {
        modelId:
          input.modelId,

        taskClass:
          'multi_file_implementation',

        framework:
          'nextjs',

        requiredCapabilities: [
          'software.implement',
        ],

        repairLoops:
          input.success
            ? 0
            : 1,

        finalVerificationOk:
          input.finalVerificationOk,

        ...(
          input.extraTelemetry ??
          {}
        ),
      },
    ],

    updated_at:
      input.updatedAt ??
      '2026-09-30T11:00:00.000Z',
  };
}

function repeated(
  count:
    number,

  make:
    (
      index:
        number,
    ) =>
      StoredBuildImprovementRow,
):
  StoredBuildImprovementRow[] {
  return Array.from(
    {
      length:
        count,
    },

    (
      _,
      index,
    ) =>
      make(
        index,
      ),
  );
}

const CONTEXT = {
  taskClass:
    'multi_file_implementation',

  framework:
    'nextjs',

  featureCategory:
    'universal',

  requiredCapabilities: [
    'software.implement',
    'validation.run',
  ],
} as const;

describe(
  'Step 7B.3 improvement memory',
  () => {
    it(
      'never serializes raw prompt, source, messages or project content from telemetry',
      () => {
        const secret =
          'PRIVATE_CROSS_PROJECT_SOURCE';

        const memory =
          summarizeBuildImprovementRows(
            [
              row({
                modelId:
                  'model-a',

                success:
                  true,

                failureCategory:
                  'none',

                finalVerificationOk:
                  true,

                extraTelemetry: {
                  prompt:
                    secret,

                  source:
                    secret,

                  messages: [
                    secret,
                  ],

                  files: [
                    {
                      path:
                        'private.ts',

                      content:
                        secret,
                    },
                  ],

                  reasoning:
                    secret,

                  credentials:
                    secret,
                },
              }),
            ],

            NOW,
          );

        const serialized =
          JSON.stringify(
            memory,
          );

        assert.doesNotMatch(
          serialized,
          /PRIVATE_CROSS_PROJECT_SOURCE/,
        );

        assert.doesNotMatch(
          serialized,
          /private\.ts/,
        );

        assert.equal(
          memory
            .observations
            .length,
          1,
        );
      },
    );

    it(
      'does not reuse weak evidence from one successful build',
      () => {
        const memory =
          summarizeBuildImprovementRows(
            [
              row({
                modelId:
                  'model-b',

                success:
                  true,

                failureCategory:
                  'none',

                finalVerificationOk:
                  true,
              }),
            ],

            NOW,
          );

        const decision =
          applyBuildImprovementMemory(
            [
              'model-a',
              'model-b',
              'model-c',
            ],

            CONTEXT,

            memory,
          );

        assert.equal(
          decision.applied,
          false,
        );

        assert.deepEqual(
          decision.candidates,
          [
            'model-a',
            'model-b',
            'model-c',
          ],
        );
      },
    );

    it(
      'ignores stale evidence entirely',
      () => {
        const stale =
          new Date(
            NOW -
            MAX_IMPROVEMENT_AGE_MS -
            1,
          )
            .toISOString();

        const memory =
          summarizeBuildImprovementRows(
            repeated(
              MIN_IMPROVEMENT_SAMPLE_SIZE,
              () =>
                row({
                  modelId:
                    'model-b',

                  success:
                    true,

                  failureCategory:
                    'none',

                  finalVerificationOk:
                    true,

                  updatedAt:
                    stale,
                }),
            ),

            NOW,
          );

        assert.equal(
          memory
            .observationCount,
          0,
        );

        assert.equal(
          applyBuildImprovementMemory(
            [
              'model-a',
              'model-b',
            ],

            CONTEXT,

            memory,
          )
            .applied,
          false,
        );
      },
    );

    it(
      'lets repeated verified success produce one bounded candidate reorder',
      () => {
        const memory =
          summarizeBuildImprovementRows(
            repeated(
              MIN_IMPROVEMENT_SAMPLE_SIZE,
              () =>
                row({
                  modelId:
                    'model-b',

                  success:
                    true,

                  failureCategory:
                    'none',

                  finalVerificationOk:
                    true,
                }),
            ),

            NOW,
          );

        const decision =
          applyBuildImprovementMemory(
            [
              'model-a',
              'model-b',
              'model-c',
            ],

            CONTEXT,

            memory,
          );

        assert.equal(
          decision.applied,
          true,
        );

        assert.equal(
          decision
            .preferredModel,
          'model-b',
        );

        assert.deepEqual(
          decision.candidates,
          [
            'model-b',
            'model-a',
            'model-c',
          ],
        );

        assert.equal(
          decision
            .candidates
            .length,
          3,
        );
      },
    );

    it(
      'safely deprioritizes repeated implementation failures without deleting the final fallback',
      () => {
        const memory =
          summarizeBuildImprovementRows(
            repeated(
              MIN_IMPROVEMENT_SAMPLE_SIZE,
              () =>
                row({
                  modelId:
                    'model-a',

                  success:
                    false,

                  failureCategory:
                    'compile',

                  finalVerificationOk:
                    false,
                }),
            ),

            NOW,
          );

        const decision =
          applyBuildImprovementMemory(
            [
              'model-a',
              'model-b',
              'model-c',
            ],

            CONTEXT,

            memory,
          );

        assert.equal(
          decision.applied,
          true,
        );

        assert.deepEqual(
          decision.candidates,
          [
            'model-b',
            'model-c',
            'model-a',
          ],
        );

        assert.deepEqual(
          [
            ...decision.candidates,
          ]
            .sort(),
          [
            'model-a',
            'model-b',
            'model-c',
          ],
        );

        assert.equal(
          decision
            .candidates
            .includes(
              'model-a',
            ),
          true,
        );
      },
    );

    it(
      'does not teach implementation failure from cancellation, publication or deployment outcomes',
      () => {
        const rows =
          [
            ...repeated(
              MIN_IMPROVEMENT_SAMPLE_SIZE,
              () =>
                row({
                  modelId:
                    'model-a',

                  success:
                    false,

                  failureCategory:
                    'user_cancelled',

                  finalVerificationOk:
                    null,
                }),
            ),

            ...repeated(
              MIN_IMPROVEMENT_SAMPLE_SIZE,
              () =>
                row({
                  modelId:
                    'model-a',

                  success:
                    false,

                  failureCategory:
                    'publication',

                  finalVerificationOk:
                    true,
                }),
            ),

            ...repeated(
              MIN_IMPROVEMENT_SAMPLE_SIZE,
              () =>
                row({
                  modelId:
                    'model-a',

                  success:
                    false,

                  failureCategory:
                    'deployment',

                  finalVerificationOk:
                    true,
                }),
            ),
          ];

        const decision =
          applyBuildImprovementMemory(
            [
              'model-a',
              'model-b',
            ],

            CONTEXT,

            summarizeBuildImprovementRows(
              rows,
              NOW,
            ),
          );

        assert.equal(
          decision.applied,
          false,
        );

        assert.deepEqual(
          decision
            .deprioritizedModels,
          [],
        );
      },
    );

    it(
      'requires real current-run verification for positive teaching',
      () => {
        const memory =
          summarizeBuildImprovementRows(
            repeated(
              MIN_IMPROVEMENT_SAMPLE_SIZE,
              () =>
                row({
                  modelId:
                    'model-b',

                  success:
                    true,

                  failureCategory:
                    'none',

                  finalVerificationOk:
                    null,
                }),
            ),

            NOW,
          );

        const decision =
          applyBuildImprovementMemory(
            [
              'model-a',
              'model-b',
            ],

            CONTEXT,

            memory,
          );

        assert.equal(
          decision.applied,
          false,
        );
      },
    );

    it(
      'fails open when improvement-memory loading is unavailable',
      async () => {
        const source:
          BuildImprovementRowSource = {
          async load() {
            throw new Error(
              'database unavailable',
            );
          },
        };

        const memory =
          await loadBuildImprovementMemory(
            'user-1',
            source,
          );

        assert.equal(
          memory.source,
          'unavailable',
        );

        const decision =
          applyBuildImprovementMemory(
            [
              'model-a',
              'model-b',
            ],

            CONTEXT,

            memory,
          );

        assert.equal(
          decision.applied,
          false,
        );

        assert.deepEqual(
          decision.candidates,
          [
            'model-a',
            'model-b',
          ],
        );
      },
    );

    it(
      'is deterministic for identical sanitized evidence',
      () => {
        const rows =
          repeated(
            MIN_IMPROVEMENT_SAMPLE_SIZE,
            () =>
              row({
                modelId:
                  'model-b',

                success:
                  true,

                failureCategory:
                  'none',

                finalVerificationOk:
                  true,
              }),
          );

        const memoryA =
          summarizeBuildImprovementRows(
            rows,
            NOW,
          );

        const memoryB =
          summarizeBuildImprovementRows(
            rows,
            NOW,
          );

        assert.deepEqual(
          applyBuildImprovementMemory(
            [
              'model-a',
              'model-b',
              'model-c',
            ],

            CONTEXT,

            memoryA,
          ),

          applyBuildImprovementMemory(
            [
              'model-a',
              'model-b',
              'model-c',
            ],

            CONTEXT,

            memoryB,
          ),
        );
      },
    );

    it(
      'keeps 7B.1, 7B.2, Step 7A recovery and the authoritative verifier in the production path',
      () => {
        const pipeline =
          readFileSync(
            new URL(
              './pipeline.ts',
              import.meta.url,
            ),

            'utf8',
          );

        const entrypoint =
          readFileSync(
            new URL(
              '../synthesis/universalEntrypoint.ts',
              import.meta.url,
            ),

            'utf8',
          );

        const execution =
          readFileSync(
            new URL(
              '../synthesis/universalExecution.ts',
              import.meta.url,
            ),

            'utf8',
          );

        assert.match(
          pipeline,
          /loadBuildOutcomeRoutingMemory/,
        );

        assert.match(
          pipeline,
          /loadBuildImprovementMemory/,
        );

        assert.match(
          entrypoint,
          /applyBuildOutcomeRoutingMemory/,
        );

        assert.match(
          entrypoint,
          /applyBuildImprovementMemory/,
        );

        assert.match(
          execution,
          /runValidationAsCanonicalTask/,
        );

        assert.match(
          execution,
          /revalidation is what decides whether the repair worked/,
        );

        assert.match(
          pipeline,
          /recoverCanonicalExecutionStateForResume/,
        );

        const improvementIndex =
          entrypoint.indexOf(
            'applyBuildImprovementMemory',
          );

        const executionIndex =
          entrypoint.indexOf(
            'await executeUniversalRun',
          );

        assert.ok(
          improvementIndex >=
            0 &&
          executionIndex >
            improvementIndex,
        );
      },
    );
  },
);
