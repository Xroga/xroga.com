import assert from 'node:assert/strict';

import {
  describe,
  it,
} from 'node:test';

import {
  livePreviewStatusFromFacts,
} from './status.js';

const ready = {
  runnable:
    true,

  runtimeRunning:
    true,

  processRequired:
    true,

  processRunning:
    true,

  publicGrantRequired:
    true,

  publicGrantAvailable:
    true,
} as const;

describe(
  'live Preview status truth',
  () => {
    it(
      'does not report ready from a stale runtime binding',
      () => {
        assert.equal(
          livePreviewStatusFromFacts({
            ...ready,

            runtimeRunning:
              false,
          }),
          'stopped',
        );
      },
    );

    it(
      'does not report ready when the Preview process stopped',
      () => {
        assert.equal(
          livePreviewStatusFromFacts({
            ...ready,

            processRunning:
              false,
          }),
          'stopped',
        );
      },
    );

    it(
      'does not report ready with an expired or revoked public grant',
      () => {
        assert.equal(
          livePreviewStatusFromFacts({
            ...ready,

            publicGrantAvailable:
              false,
          }),
          'stopped',
        );
      },
    );

    it(
      'keeps unsupported product surfaces truthful',
      () => {
        assert.equal(
          livePreviewStatusFromFacts({
            ...ready,

            runnable:
              false,
          }),
          'not_applicable',
        );
      },
    );

    it(
      'allows a completed terminal command without a persistent process or public grant',
      () => {
        assert.equal(
          livePreviewStatusFromFacts({
            ...ready,

            processRequired:
              false,

            processRunning:
              false,

            publicGrantRequired:
              false,

            publicGrantAvailable:
              false,
          }),
          'ready',
        );
      },
    );
  },
);
