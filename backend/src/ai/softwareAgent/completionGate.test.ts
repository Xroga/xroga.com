import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import type {
  SoftwareRunEvidence,
} from './contracts.js';

import {
  evaluateSoftwareCompletion,
} from './completionGate.js';

function previewPassedEvidence():
  SoftwareRunEvidence {
  return {
    changedFiles: [
      {
        path:
          'src/app/page.tsx',

        created:
          true,
      },
    ],

    checks: [
      {
        id:
          'validation:0:build:node:root',

        name:
          'build · node',

        status:
          'passed',

        command:
          'npm run build',

        exitCode:
          0,
      },

      {
        id:
          'xroga:verification-gate',

        name:
          'Xroga deterministic verification gate',

        status:
          'failed',

        summary:
          'no test command ran, so passing proves only that the toolchain executed',
      },
    ],

    preview: {
      status:
        'passed',

      attempted:
        true,

      url:
        'http://127.0.0.1:3000',

      criteriaNotChecked:
        [],

      screenshots:
        [],
    },
  };
}

describe(
  'Agent V2 completion gate — preview-backed web verification',
  () => {
    it(
      'allows a preview-required web task when real deterministic checks pass and only the no-test policy gate is deferred',
      () => {
        const result =
          evaluateSoftwareCompletion(
            {
              previewRequirement:
                'required',

              evidence:
                previewPassedEvidence(),

              requireSuccessfulChecks:
                true,

              requireRepositoryPersistence:
                false,
            },
          );

        assert.equal(
          result.complete,
          true,
        );

        assert.deepEqual(
          result.blockers,
          [],
        );
      },
    );

    it(
      'still requires the real browser Preview after deferring the no-test policy gate',
      () => {
        const evidence =
          previewPassedEvidence();

        delete evidence.preview;

        const result =
          evaluateSoftwareCompletion(
            {
              previewRequirement:
                'required',

              evidence,

              requireSuccessfulChecks:
                true,

              requireRepositoryPersistence:
                false,
            },
          );

        assert.equal(
          result.complete,
          false,
        );

        assert.ok(
          result.blockers.some(
            (blocker) =>
              blocker.includes(
                'verified Preview is required',
              ),
          ),
        );
      },
    );

    it(
      'does not defer the missing-test policy for non-preview software',
      () => {
        const result =
          evaluateSoftwareCompletion(
            {
              previewRequirement:
                'not_applicable',

              evidence:
                previewPassedEvidence(),

              requireSuccessfulChecks:
                true,

              requireRepositoryPersistence:
                false,
            },
          );

        assert.equal(
          result.complete,
          false,
        );

        assert.ok(
          result.blockers.some(
            (blocker) =>
              blocker.includes(
                'required check',
              ) &&
              blocker.includes(
                'failed',
              ),
          ),
        );
      },
    );

    it(
      'does not hide a different Xroga verification-gate failure on a web project',
      () => {
        const evidence =
          previewPassedEvidence();

        evidence.checks = [
          {
            id:
              'validation:0:build:node:root',

            name:
              'build · node',

            status:
              'passed',

            command:
              'npm run build',

            exitCode:
              0,
          },

          {
            id:
              'xroga:verification-gate',

            name:
              'Xroga deterministic verification gate',

            status:
              'failed',

            summary:
              'blockers remain: architecture validation failed',
          },
        ];

        const result =
          evaluateSoftwareCompletion(
            {
              previewRequirement:
                'required',

              evidence,

              requireSuccessfulChecks:
                true,

              requireRepositoryPersistence:
                false,
            },
          );

        assert.equal(
          result.complete,
          false,
        );

        assert.ok(
          result.blockers.some(
            (blocker) =>
              blocker.includes(
                'required check',
              ) &&
              blocker.includes(
                'failed',
              ),
          ),
        );
      },
    );

    it(
      'does not allow the synthetic Xroga gate to replace real executable project checks',
      () => {
        const evidence =
          previewPassedEvidence();

        evidence.checks = [
          {
            id:
              'xroga:verification-gate',

            name:
              'Xroga deterministic verification gate',

            status:
              'failed',

            summary:
              'no test command ran, so passing proves only that the toolchain executed',
          },
        ];

        const result =
          evaluateSoftwareCompletion(
            {
              previewRequirement:
                'required',

              evidence,

              requireSuccessfulChecks:
                true,

              requireRepositoryPersistence:
                false,
            },
          );

        assert.equal(
          result.complete,
          false,
        );

        assert.ok(
          result.blockers.includes(
            'No required project check produced successful verification evidence.',
          ),
        );
      },
    );

    it(
      'still blocks completion when browser verification fails',
      () => {
        const evidence =
          previewPassedEvidence();

        evidence.preview = {
          status:
            'failed',

          attempted:
            true,

          url:
            'http://127.0.0.1:3000',

          blocker:
            'The generated page returned an application error.',

          criteriaNotChecked:
            [],

          screenshots:
            [],
        };

        const result =
          evaluateSoftwareCompletion(
            {
              previewRequirement:
                'required',

              evidence,

              requireSuccessfulChecks:
                true,

              requireRepositoryPersistence:
                false,
            },
          );

        assert.equal(
          result.complete,
          false,
        );

        assert.ok(
          result.blockers.includes(
            'The generated page returned an application error.',
          ),
        );
      },
    );

    it(
      'still enforces repository persistence when persistence is part of the execution contract',
      () => {
        const result =
          evaluateSoftwareCompletion(
            {
              previewRequirement:
                'required',

              evidence:
                previewPassedEvidence(),

              requireSuccessfulChecks:
                true,

              requireRepositoryPersistence:
                true,
            },
          );

        assert.equal(
          result.complete,
          false,
        );

        assert.ok(
          result.blockers.includes(
            'Repository persistence was required but no verified commit exists.',
          ),
        );
      },
    );
  },
);
