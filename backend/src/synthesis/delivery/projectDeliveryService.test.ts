import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import type {
  ProjectDeliveryState,
} from './projectDelivery.js';

import {
  mergeProjectDeliveryState,
} from './projectDeliveryService.js';

function base():
  ProjectDeliveryState {
  return {
    schemaVersion:
      '1.0.0',

    projectId:
      'project-1',

    runId:
      'run-1',

    status:
      'ready',

    verification: {
      status:
        'ready',

      verified:
        true,

      reason:
        'Verification passed.',
    },

    savedProject: {
      status:
        'ready',

      revision:
        1,

      fileCount:
        4,
    },

    archive: {
      status:
        'ready',

      filename:
        'project-1.zip',

      href:
        '/api/delivery/project-1/download.zip',
    },

    publication: {
      requested:
        false,

      status:
        'not_requested',

      repository:
        null,

      branch:
        null,

      commitSha:
        null,

      reason:
        null,
    },

    deployment: {
      requested:
        false,

      status:
        'not_requested',

      provider:
        null,

      deploymentId:
        null,

      url:
        null,

      reason:
        null,
    },

    updatedAt:
      '2026-09-23T00:00:00.000Z',
  };
}

describe(
  'Step 6 delivery evidence',
  () => {
    it(
      'keeps GitHub and deployment optional before the user requests them',
      () => {
        const result =
          mergeProjectDeliveryState(
            base(),

            {
              publication:
                null,

              deployment:
                null,
            },
          );

        assert.equal(
          result.status,
          'ready',
        );

        assert.equal(
          result.publication
            .status,
          'not_requested',
        );

        assert.equal(
          result.deployment
            .status,
          'not_requested',
        );
      },
    );

    it(
      'records manual GitHub publication without making GitHub a project prerequisite',
      () => {
        const result =
          mergeProjectDeliveryState(
            base(),

            {
              publication: {
                status:
                  'ready',

                repository:
                  'Xroga/demo',

                repoUrl:
                  'https://github.com/Xroga/demo',

                branch:
                  'xroga/run-1',

                commitSha:
                  'abcdef1234567890',

                pullRequestUrl:
                  'https://github.com/Xroga/demo/pull/1',

                reason:
                  null,

                updatedAt:
                  '2026-09-23T01:00:00.000Z',
              },

              deployment:
                null,
            },
          );

        assert.equal(
          result.status,
          'ready',
        );

        assert.equal(
          result.publication
            .requested,
          true,
        );

        assert.equal(
          result.publication
            .status,
          'ready',
        );

        assert.equal(
          result.savedProject
            .status,
          'ready',
        );
      },
    );

    it(
      'keeps the Xroga project downloadable when an optional deployment fails',
      () => {
        const result =
          mergeProjectDeliveryState(
            base(),

            {
              publication:
                null,

              deployment: {
                status:
                  'failed',

                provider:
                  'vercel',

                deploymentId:
                  null,

                url:
                  null,

                verified:
                  false,

                reason:
                  'Vercel authorization expired.',

                updatedAt:
                  '2026-09-23T02:00:00.000Z',
              },
            },
          );

        assert.equal(
          result.status,
          'partial',
        );

        assert.equal(
          result.savedProject
            .status,
          'ready',
        );

        assert.equal(
          result.archive
            .status,
          'ready',
        );

        assert.equal(
          result.deployment
            .status,
          'failed',
        );
      },
    );

    it(
      'requires real verified deployment evidence before marking deployment ready',
      () => {
        const result =
          mergeProjectDeliveryState(
            base(),

            {
              publication:
                null,

              deployment: {
                status:
                  'ready',

                provider:
                  'vercel',

                deploymentId:
                  'dpl_123',

                url:
                  'https://demo.vercel.app',

                verified:
                  true,

                reason:
                  null,

                updatedAt:
                  '2026-09-23T03:00:00.000Z',
              },
            },
          );

        assert.equal(
          result.status,
          'ready',
        );

        assert.equal(
          result.deployment
            .provider,
          'vercel',
        );

        assert.equal(
          result.deployment
            .deploymentId,
          'dpl_123',
        );

        assert.equal(
          result.deployment
            .url,
          'https://demo.vercel.app',
        );
      },
    );
  },
);
