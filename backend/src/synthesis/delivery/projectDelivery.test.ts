import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  goalContractSchema,
} from '../../ai/universal/goalContract.js';

import {
  createBuildContract,
} from '../buildContract.js';

import {
  deriveProjectRunState,
} from '../projectRunState.js';

import {
  createSoftwareProject,
  type SoftwareProjectRepository,
} from '../softwareProject.js';

import {
  buildProjectArchive,
  deliveryStateForProject,
  projectArchiveDownloadPath,
} from './projectDelivery.js';

function fixture(
  input: {
    publication?:
      'NONE' |
      'REQUESTED';

    publicationStatus?:
      | 'not_requested'
      | 'succeeded'
      | 'blocked'
      | 'failed';

    publicationReason?:
      string | null;

    repository?:
      SoftwareProjectRepository | null;
  } =
    {},
) {
  const publication =
    input.publication ??
    'NONE';

  const files = [
    {
      path:
        'src/index.ts',

      content:
        'console.log("hello");',
    },

    {
      path:
        'package-lock.json',

      content:
        '{"lockfileVersion":3}',
    },

    {
      path:
        '.env.example',

      content:
        'API_KEY=replace-me',
    },

    {
      path:
        '.env.local',

      content:
        'API_KEY=secret',
    },

    {
      path:
        'node_modules/private.txt',

      content:
        'never export me',
    },
  ];

  const goal =
    goalContractSchema.parse({
      version:
        '1.0',

      goal:
        'Build a project',

      desiredOutcome:
        'A working project',

      semanticIntent:
        'BUILD',

      previewRequirement:
        'PREFERRED',

      publicationRequirement:
        publication,

      deploymentRequirement:
        'NONE',

      confidence:
        1,
    });

  const contract =
    createBuildContract({
      projectId:
        'project-delivery-test',

      runId:
        'run-delivery-test',

      sourcePrompt:
        'Build a project',

      goal,

      existingFileCount:
        0,

      now:
        new Date(
          '2026-09-22T00:00:00.000Z',
        ),
    });

  const lifecycle =
    deriveProjectRunState({
      outcome:
        'completed',

      phaseReached:
        'complete',

      verified:
        true,

      fileCount:
        files.length,

      commitSha:
        input.repository
          ?.commitSha ??
        null,

      reason:
        'Verification passed.',

      blockers:
        [],

      publicationRequested:
        publication ===
        'REQUESTED',

      publicationStatus:
        input.publicationStatus ??
        (
          publication ===
          'REQUESTED'
            ? 'blocked'
            : 'not_requested'
        ),

      publicationReason:
        input.publicationReason ??
        null,

      deploymentRequested:
        false,
    });

  return createSoftwareProject({
    contract,

    files,

    fileTrail:
      [],

    lifecycle,

    verified:
      true,

    reason:
      'Verification passed.',

    blockers:
      [],

    repository:
      input.repository ??
      null,

    now:
      new Date(
        '2026-09-22T00:00:00.000Z',
      ),
  });
}

describe(
  'Step 6 project delivery',
  () => {
    it(
      'makes a verified Xroga-saved project ready without GitHub or deployment',
      () => {
        const project =
          fixture();

        const delivery =
          deliveryStateForProject(
            project,
          );

        assert.equal(
          delivery.status,
          'ready',
        );

        assert.equal(
          delivery
            .savedProject
            .status,
          'ready',
        );

        assert.equal(
          delivery
            .archive
            .status,
          'ready',
        );

        assert.equal(
          delivery
            .publication
            .status,
          'not_requested',
        );

        assert.equal(
          delivery
            .deployment
            .status,
          'not_requested',
        );

        assert.equal(
          delivery
            .archive
            .href,

          projectArchiveDownloadPath(
            project.projectId,
          ),
        );
      },
    );

    it(
      'keeps the saved project and archive ready when optional GitHub publication fails',
      () => {
        const project =
          fixture({
            publication:
              'REQUESTED',

            publicationStatus:
              'failed',

            publicationReason:
              'GitHub authorization expired.',
          });

        const delivery =
          deliveryStateForProject(
            project,
          );

        assert.equal(
          delivery.status,
          'partial',
        );

        assert.equal(
          delivery
            .savedProject
            .status,
          'ready',
        );

        assert.equal(
          delivery
            .archive
            .status,
          'ready',
        );

        assert.equal(
          delivery
            .publication
            .status,
          'failed',
        );

        assert.match(
          delivery
            .publication
            .reason ??
            '',

          /GitHub authorization expired/i,
        );
      },
    );

    it(
      'marks publication ready only from real repository commit evidence',
      () => {
        const project =
          fixture({
            publication:
              'REQUESTED',

            publicationStatus:
              'succeeded',

            repository: {
              owner:
                'Xroga',

              repo:
                'demo',

              branch:
                'xroga/run-1',

              baseBranch:
                'main',

              commitSha:
                'abcdef1234567890',
            },
          });

        const delivery =
          deliveryStateForProject(
            project,
          );

        assert.equal(
          delivery
            .publication
            .status,
          'ready',
        );

        assert.equal(
          delivery
            .publication
            .repository,
          'Xroga/demo',
        );

        assert.equal(
          delivery
            .publication
            .commitSha,
          'abcdef1234567890',
        );
      },
    );

    it(
      'exports the full project including lockfiles while excluding likely secrets and build noise',
      () => {
        const project =
          fixture();

        const archive =
          buildProjectArchive(
            project,
          );

        assert.equal(
          archive.contentType,
          'application/zip',
        );

        assert.ok(
          archive.buffer
            .subarray(
              0,
              2,
            )
            .equals(
              Buffer.from([
                0x50,
                0x4b,
              ]),
            ),
        );

        assert.equal(
          archive.buffer.includes(
            Buffer.from(
              'src/index.ts',
            ),
          ),
          true,
        );

        assert.equal(
          archive.buffer.includes(
            Buffer.from(
              'package-lock.json',
            ),
          ),
          true,
        );

        assert.equal(
          archive.buffer.includes(
            Buffer.from(
              '.env.example',
            ),
          ),
          true,
        );

        assert.equal(
          archive.buffer.includes(
            Buffer.from(
              '.env.local',
            ),
          ),
          false,
        );

        assert.equal(
          archive.buffer.includes(
            Buffer.from(
              'node_modules/private.txt',
            ),
          ),
          false,
        );
      },
    );
  },
);
