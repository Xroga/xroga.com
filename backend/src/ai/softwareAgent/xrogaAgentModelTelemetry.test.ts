import assert from 'node:assert/strict';

import {
  test,
} from 'node:test';

import {
  buildSoftwareAgentModelTelemetry,
} from './xrogaAgentModel.js';

test(
  'records primary model execution without fallback',
  () => {
    const telemetry =
      buildSoftwareAgentModelTelemetry({
        runId:
          'run-primary',

        requestedModelId:
          'kimi_k3',

        actualModelId:
          'kimi_k3',

        failures:
          [],
      });

    assert.equal(
      telemetry.runId,
      'run-primary',
    );

    assert.equal(
      telemetry.builderVersion,
      'agent-v2',
    );

    assert.equal(
      telemetry.requestedModelId,
      'kimi_k3',
    );

    assert.equal(
      telemetry.actualModelId,
      'kimi_k3',
    );

    assert.equal(
      telemetry.requestedProvider,
      'moonshot',
    );

    assert.equal(
      telemetry.actualProvider,
      'moonshot',
    );

    assert.equal(
      telemetry.fallbackUsed,
      false,
    );

    assert.equal(
      telemetry.fallbackReason,
      null,
    );

    assert.equal(
      telemetry.fallbackFailureCount,
      0,
    );
  },
);

test(
  'records the model that actually succeeded after fallback',
  () => {
    const telemetry =
      buildSoftwareAgentModelTelemetry({
        runId:
          'run-fallback',

        requestedModelId:
          'kimi_k3',

        actualModelId:
          'glm_5_3',

        failures: [
          {
            kind:
              'timeout',

            retryable:
              true,

            status:
              504,

            code:
              'ETIMEDOUT',

            safeMessage:
              'Provider request timed out.',
          },
        ],
      });

    assert.equal(
      telemetry.runId,
      'run-fallback',
    );

    assert.equal(
      telemetry.builderVersion,
      'agent-v2',
    );

    assert.equal(
      telemetry.requestedModelId,
      'kimi_k3',
    );

    assert.equal(
      telemetry.requestedProvider,
      'moonshot',
    );

    assert.equal(
      telemetry.actualModelId,
      'glm_5_3',
    );

    assert.equal(
      telemetry.actualProvider,
      'zhipu',
    );

    assert.equal(
      telemetry.fallbackUsed,
      true,
    );

    assert.equal(
      telemetry.fallbackFailureCount,
      1,
    );

    assert.match(
      telemetry.fallbackReason ??
        '',
      /timeout/,
    );

    assert.match(
      telemetry.fallbackReason ??
        '',
      /ETIMEDOUT/,
    );

    assert.match(
      telemetry.fallbackReason ??
        '',
      /504/,
    );
  },
);

test(
  'fallback without a recorded failure still reports an operational reason',
  () => {
    const telemetry =
      buildSoftwareAgentModelTelemetry({
        requestedModelId:
          'kimi_k3',

        actualModelId:
          'glm_5_3',

        failures:
          [],
      });

    assert.equal(
      telemetry.fallbackUsed,
      true,
    );

    assert.equal(
      telemetry.fallbackReason,
      'primary_route_unavailable',
    );
  },
);

test(
  'telemetry reason never copies provider safeMessage content',
  () => {
    const telemetry =
      buildSoftwareAgentModelTelemetry({
        requestedModelId:
          'kimi_k3',

        actualModelId:
          'glm_5_3',

        failures: [
          {
            kind:
              'transient',

            retryable:
              true,

            status:
              503,

            code:
              'UPSTREAM_DOWN',

            safeMessage:
              'Sensitive upstream diagnostic that must not be copied.',
          },
        ],
      });

    assert.doesNotMatch(
      telemetry.fallbackReason ??
        '',
      /Sensitive upstream diagnostic/,
    );

    assert.match(
      telemetry.fallbackReason ??
        '',
      /transient/,
    );

    assert.match(
      telemetry.fallbackReason ??
        '',
      /UPSTREAM_DOWN/,
    );
  },
);
