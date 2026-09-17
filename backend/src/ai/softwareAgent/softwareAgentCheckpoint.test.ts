import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import type {
  SoftwareExecutionContract,
} from './contracts.js';

import {
  InMemorySoftwareAgentCheckpointStore,
  checkpointMatchesExecution,
  softwareAgentBaseFingerprint,
  workingFilesFromCheckpoint,
  type SoftwareAgentCheckpoint,
} from './softwareAgentCheckpoint.js';

const baseFiles = [
  {
    path:
      'a.txt',

    content:
      'before',
  },

  {
    path:
      'keep.txt',

    content:
      'keep',
  },
];

function contract():
  SoftwareExecutionContract {
  return {
    runId:
      'run-1',

    projectId:
      'project-1',

    taskKind:
      'web_app',

    goal:
      'Build the project',

    repository: {
      owner:
        'Xroga',

      repo:
        'demo',

      branch:
        'main',
    },

    writePolicy: {
      allowedPaths:
        [],

      deniedPaths:
        [],

      allowCreate:
        true,

      allowDelete:
        false,

      allowRename:
        false,
    },

    preview:
      'required',

    persistence:
      'none',

    deployment:
      'forbidden',

    acceptanceCriteria:
      [],

    constraints:
      [],
  };
}

function checkpoint():
  SoftwareAgentCheckpoint {
  return {
    schemaVersion:
      '1.0.0',

    runId:
      'run-1',

    projectId:
      'project-1',

    repository: {
      owner:
        'Xroga',

      repo:
        'demo',

      branch:
        'main',
    },

    baseFingerprint:
      softwareAgentBaseFingerprint(
        baseFiles,
      ),

    changes: [
      {
        path:
          'a.txt',

        kind:
          'modified',

        content:
          'after',
      },

      {
        path:
          'new.txt',

        kind:
          'created',

        content:
          'created',
      },

      {
        path:
          'keep.txt',

        kind:
          'deleted',
      },
    ],

    evidence: {
      changedFiles: [
        {
          path:
            'a.txt',
        },
      ],

      checks:
        [],
    },

    status:
      'active',

    blockers:
      [],

    failureCode:
      null,

    updatedAt:
      '2026-09-17T00:00:00.000Z',
  };
}

describe(
  'Software Agent V2 durable checkpoints',
  () => {
    it(
      'fingerprints the base independently of file ordering',
      () => {
        assert.equal(
          softwareAgentBaseFingerprint(
            baseFiles,
          ),

          softwareAgentBaseFingerprint([
            baseFiles[1]!,
            baseFiles[0]!,
          ]),
        );
      },
    );

    it(
      'changes the base fingerprint when repository content changes',
      () => {
        assert.notEqual(
          softwareAgentBaseFingerprint(
            baseFiles,
          ),

          softwareAgentBaseFingerprint([
            {
              path:
                'a.txt',

              content:
                'different',
            },

            baseFiles[1]!,
          ]),
        );
      },
    );

    it(
      'reconstructs modified created and deleted checkpoint files',
      () => {
        assert.deepEqual(
          workingFilesFromCheckpoint(
            baseFiles,
            checkpoint(),
          ),

          [
            {
              path:
                'a.txt',

              content:
                'after',
            },

            {
              path:
                'new.txt',

              content:
                'created',
            },
          ],
        );
      },
    );

    it(
      'accepts a checkpoint only for the exact original execution base',
      () => {
        assert.equal(
          checkpointMatchesExecution(
            checkpoint(),

            {
              contract:
                contract(),

              baseFiles,
            },
          ),

          true,
        );

        assert.equal(
          checkpointMatchesExecution(
            checkpoint(),

            {
              contract:
                contract(),

              baseFiles: [
                {
                  path:
                    'a.txt',

                  content:
                    'repository changed',
                },

                baseFiles[1]!,
              ],
            },
          ),

          false,
        );
      },
    );

    it(
      'stores independent durable copies instead of mutable object references',
      async () => {
        const store =
          new InMemorySoftwareAgentCheckpointStore();

        const original =
          checkpoint();

        await store.save(
          original,
        );

        original.changes[0]!
          .content =
          'mutated outside store';

        const loaded =
          await store.load(
            'run-1',
          );

        assert.equal(
          loaded
            ?.changes[0]
            ?.content,

          'after',
        );
      },
    );
  },
);
