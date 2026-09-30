import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  applyBuildOutcomeRoutingMemory,
  MIN_ROUTING_SAMPLE_SIZE,
  summarizeBuildOutcomeRows,
} from './buildOutcomeRoutingMemory.js';

describe(
  'Step 7B build outcome routing memory',
  () => {
    it(
      'raises retry pressure from recent implementation failures and resets after success',
      () => {
        const failures =
          summarizeBuildOutcomeRows([
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
                '2026-09-30T12:00:00.000Z',
            },

            {
              success:
                false,

              failure_category:
                'verification',

              model_telemetry: [
                {
                  modelId:
                    'model-a',
                },
              ],

              updated_at:
                '2026-09-30T11:00:00.000Z',
            },
          ],

          Date.parse(
            '2026-09-30T13:00:00.000Z',
          ),
        );

        assert.equal(
          failures
            .consecutiveFailures,
          2,
        );

        assert.deepEqual(
          failures
            .deprioritizedModels,
          [
            'model-a',
          ],
        );

        const recovered =
          summarizeBuildOutcomeRows([
            {
              success:
                true,

              failure_category:
                'none',

              model_telemetry: [
                {
                  modelId:
                    'model-a',
                },
              ],

              updated_at:
                '2026-09-30T12:30:00.000Z',
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
                '2026-09-30T12:00:00.000Z',
            },
          ],

          Date.parse(
            '2026-09-30T13:00:00.000Z',
          ),
        );

        assert.equal(
          recovered
            .consecutiveFailures,
          0,
        );

        assert.deepEqual(
          recovered
            .deprioritizedModels,
          [],
        );
      },
    );

    it(
      'does not blame implementation routing for cancellation or external delivery failures',
      () => {
        const memory =
          summarizeBuildOutcomeRows([
            {
              success:
                false,

              failure_category:
                'user_cancelled',

              model_telemetry: [
                {
                  modelId:
                    'model-a',
                },
              ],

              updated_at:
                '2026-09-30T12:00:00.000Z',
            },

            {
              success:
                false,

              failure_category:
                'deployment',

              model_telemetry: [
                {
                  modelId:
                    'model-a',
                },
              ],

              updated_at:
                '2026-09-30T11:00:00.000Z',
            },
          ],

          Date.parse(
            '2026-09-30T13:00:00.000Z',
          ),
        );

        assert.equal(
          memory
            .consecutiveFailures,
          0,
        );

        assert.deepEqual(
          memory
            .deprioritizedModels,
          [],
        );
      },
    );

    it(
      'deprioritizes repeatedly failing models without removing the fallback',
      () => {
        const memory =
          summarizeBuildOutcomeRows(
            Array.from(
              {
                length:
                  MIN_ROUTING_SAMPLE_SIZE,
              },

              (
                _,
                index,
              ) => ({
                success:
                  false,

                failure_category:
                  index % 2 === 0
                    ? 'compile'
                    : 'test',

                model_telemetry: [
                  {
                    modelId:
                      'model-a',
                  },
                ],

                updated_at:
                  new Date(
                    Date.parse(
                      '2026-09-30T12:00:00.000Z',
                    ) -
                    index *
                      60_000,
                  ).toISOString(),
              }),
            ),

            Date.parse(
              '2026-09-30T13:00:00.000Z',
            ),
          );

        const adjusted =
          applyBuildOutcomeRoutingMemory(
            [
              'model-a',
              'model-b',
              'model-c',
            ],

            memory,
          );

        assert.equal(
          adjusted.applied,
          true,
        );

        assert.deepEqual(
          adjusted.candidates,
          [
            'model-b',
            'model-c',
            'model-a',
          ],
        );

        assert.equal(
          adjusted
            .candidates
            .includes(
              'model-a',
            ),
          true,
        );
      },
    );
  },
);
