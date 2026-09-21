import test from 'node:test';
import assert from 'node:assert/strict';

import {
  goalContractSchema,
} from '../ai/universal/goalContract.js';

import {
  buildContractPlanningText,
  createBuildContract,
} from './buildContract.js';

import {
  deriveProjectRunState,
  projectRunTransportSucceeded,
} from './projectRunState.js';

import {
  createSoftwareProject,
} from './softwareProject.js';

const goal =
  goalContractSchema.parse({
    version: '1.0',

    goal:
      'Build a photography portfolio',

    desiredOutcome:
      'A working photography portfolio with a visible gallery and contact section',

    semanticIntent:
      'MODIFY',

    constraints: [
      'Responsive layout',
    ],

    acceptance: [
      'Gallery is visible',
      'Contact section is present',
    ],

    previewRequirement:
      'REQUIRED',

    confidence: 1,
  });

test(
  'BuildContract makes a semantic greenfield engineering request canonical',
  () => {
    const contract =
      createBuildContract({
        projectId:
          'project-1',

        runId:
          'run-1',

        sourcePrompt:
          'build this for me',

        goal,

        existingFileCount:
          0,
      });

    assert.equal(
      contract.operation,
      'build',
    );

    assert.equal(
      contract.projectMode,
      'greenfield',
    );

    assert.equal(
      contract.projectId,
      'project-1',
    );

    assert.equal(
      contract.delivery
        .previewRequirement,
      'REQUIRED',
    );

    const planning =
      buildContractPlanningText(
        contract,
      );

    assert.match(
      planning,
      /photography portfolio/i,
    );

    assert.match(
      planning,
      /Gallery is visible/,
    );
  },
);

test(
  'existing project continuation becomes modify + follow_up',
  () => {
    const contract =
      createBuildContract({
        projectId:
          'project-2',

        runId:
          'run-2',

        sourcePrompt:
          'make the hero darker',

        goal,

        existingFileCount:
          12,

        continuation:
          true,
      });

    assert.equal(
      contract.operation,
      'modify',
    );

    assert.equal(
      contract.projectMode,
      'follow_up',
    );
  },
);

test(
  'completed but unverified is a completed transport with blocked verification',
  () => {
    const state =
      deriveProjectRunState({
        outcome:
          'completed',

        phaseReached:
          'complete',

        verified:
          false,

        fileCount:
          4,

        commitSha:
          'abc123',

        reason:
          'browser verification was unavailable',

        blockers: [
          'browser verification was unavailable',
        ],

        publicationRequested:
          true,

        deploymentRequested:
          false,
      });

    assert.equal(
      projectRunTransportSucceeded(
        'completed',
      ),
      true,
    );

    assert.equal(
      state.implementation
        .status,
      'succeeded',
    );

    assert.equal(
      state.verification
        .status,
      'blocked',
    );

    assert.equal(
      state.publication
        .status,
      'succeeded',
    );
  },
);

test(
  'SoftwareProject keeps the complete workspace separate from its diff',
  () => {
    const contract =
      createBuildContract({
        projectId:
          'project-3',

        runId:
          'run-3',

        sourcePrompt:
          'change the header',

        goal,

        existingFileCount:
          3,

        continuation:
          true,
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
          3,

        commitSha:
          'def456',

        reason:
          'verified',

        blockers: [],

        publicationRequested:
          true,

        deploymentRequested:
          false,
      });

    const project =
      createSoftwareProject({
        contract,

        files: [
          {
            path:
              'package.json',

            content:
              '{}',
          },

          {
            path:
              'src/App.tsx',

            content:
              'export default function App() {}',
          },

          {
            path:
              'src/Header.tsx',

            content:
              'export const Header = () => null;',
          },
        ],

        fileTrail: [
          {
            path:
              'src/Header.tsx',

            before:
              'old',

            after:
              'new',

            added: 1,
            removed: 1,
            action:
              'modified',
          },
        ],

        lifecycle,

        verified:
          true,

        reason:
          'verified',

        blockers: [],

        repository: {
          owner:
            'xroga',

          repo:
            'demo',

          branch:
            'xroga/run-3',

          baseBranch:
            'main',

          commitSha:
            'def456',
        },
      });

    assert.equal(
      project.workspace
        .files.length,
      3,
    );

    assert.deepEqual(
      project.changeSet
        .modified,
      [
        'src/Header.tsx',
      ],
    );

    assert.deepEqual(
      project.changeSet
        .deleted,
      [],
    );
  },
);
