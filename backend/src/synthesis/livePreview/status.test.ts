import assert from 'node:assert/strict';

import {
  describe,
  it,
} from 'node:test';

import {
  livePreviewStatusFromFacts,
  previewSourceState,
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

it('previewSourceState: only a recorded matching fingerprint is current; a different one is stale; a missing one is unknown, never assumed current', () => {
  assert.equal(previewSourceState('a'.repeat(64), 'a'.repeat(64)), 'current');
  assert.equal(previewSourceState('a'.repeat(64), 'b'.repeat(64)), 'stale');
  assert.equal(previewSourceState(undefined, 'b'.repeat(64)), 'unknown', 'a runtime bound before the fingerprint was recorded');
  assert.equal(previewSourceState('a'.repeat(64), undefined), 'unknown');
  assert.equal(previewSourceState('', ''), 'unknown', 'empty values prove nothing');
  assert.equal(previewSourceState(null, null), 'unknown');
});
