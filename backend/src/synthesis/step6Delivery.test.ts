import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  goalContractSchema,
} from '../ai/universal/goalContract.js';

import {
  createBuildContract,
} from './buildContract.js';

import {
  deriveProjectRunState,
} from './projectRunState.js';

describe(
  'Step 6 delivery foundation',
  () => {
    it(
      'does not request publication merely because a repository exists',
      () => {
        const goal =
          goalContractSchema.parse({
            version:
              '1.0',

            goal:
              'Update the homepage',

            desiredOutcome:
              'The homepage is updated',

            semanticIntent:
              'MODIFY',

            projectContext: {
              repo:
                'Xroga/demo',

              branch:
                'main',

              projectRoot:
                '/',
            },

            publicationRequirement:
              'NONE',

            deploymentRequirement:
              'NONE',

            confidence:
              1,
          });

        const contract =
          createBuildContract({
            projectId:
              'project-1',

            runId:
              'run-1',

            sourcePrompt:
              'Update the homepage',

            goal,

            existingFileCount:
              4,
          });

        assert.equal(
          contract
            .delivery
            .publicationRequirement,

          'NONE',
        );
      },
    );

    it(
      'keeps a verified saved build successful when publication is not requested',
      () => {
        const state =
          deriveProjectRunState({
            outcome:
              'completed',

            phaseReached:
              'complete',

            verified:
              true,

            fileCount:
              3,

            commitSha:
              null,

            reason:
              'Verification passed.',

            blockers:
              [],

            publicationRequested:
              false,

            publicationStatus:
              'not_requested',

            publicationReason:
              null,

            deploymentRequested:
              false,
          });

        assert.equal(
          state
            .implementation
            .status,

          'succeeded',
        );

        assert.equal(
          state
            .verification
            .status,

          'succeeded',
        );

        assert.equal(
          state
            .persistence
            .status,

          'succeeded',
        );

        assert.equal(
          state
            .publication
            .status,

          'not_requested',
        );
      },
    );

    it(
      'keeps publication failure independent from verified project persistence',
      () => {
        const state =
          deriveProjectRunState({
            outcome:
              'completed',

            phaseReached:
              'complete',

            verified:
              true,

            fileCount:
              5,

            commitSha:
              null,

            reason:
              'Verification passed.',

            blockers:
              [],

            publicationRequested:
              true,

            publicationStatus:
              'failed',

            publicationReason:
              'GitHub authorization expired.',

            deploymentRequested:
              false,
          });

        assert.equal(
          state
            .implementation
            .status,

          'succeeded',
        );

        assert.equal(
          state
            .verification
            .status,

          'succeeded',
        );

        assert.equal(
          state
            .persistence
            .status,

          'succeeded',
        );

        assert.equal(
          state
            .publication
            .status,

          'failed',
        );

        assert.match(
          state
            .publication
            .detail ??
            '',

          /GitHub authorization expired/i,
        );
      },
    );
  },
);
