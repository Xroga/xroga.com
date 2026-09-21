import {
  readFileSync,
} from 'node:fs';

import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import type {
  ProjectFile,
} from '../ai/patches.js';

import {
  createAgentEvidence,
} from '../ai/softwareAgent/createAgentEvidence.js';

import {
  evaluateSoftwareCompletion,
} from '../ai/softwareAgent/completionGate.js';

import {
  productionAdapters,
} from './productionAdapters.js';

import {
  planUniversalRun,
} from './universalFlow.js';

function file(
  path:
    string,

  content:
    string,
): ProjectFile {
  return {
    path,
    content,
  };
}

function source(
  path:
    string,
): string {
  return readFileSync(
    new URL(
      path,
      import.meta.url,
    ),

    'utf8',
  );
}

describe(
  'Step 5 universal verification authority',
  () => {
    it(
      'lets universal Agent V2 hand off after implementation evidence without self-verifying',
      () => {
        const evidence =
          createAgentEvidence();

        evidence
          .changedFiles
          .push({
            path:
              'src/app.ts',
          });

        const result =
          evaluateSoftwareCompletion({
            previewRequirement:
              'required',

            verificationAuthority:
              'universal',

            evidence,

            /*
             * These deliberately remain true.
             *
             * Universal authority must return before Agent-owned
             * verification requirements are considered.
             */
            requireSuccessfulChecks:
              true,

            requireRepositoryPersistence:
              true,
          });

        assert.deepEqual(
          result,

          {
            complete:
              true,

            blockers:
              [],
          },
        );
      },
    );

    it(
      'keeps standalone Agent verification strict',
      () => {
        const evidence =
          createAgentEvidence();

        evidence
          .changedFiles
          .push({
            path:
              'src/app.ts',
          });

        const result =
          evaluateSoftwareCompletion({
            previewRequirement:
              'required',

            verificationAuthority:
              'agent',

            evidence,

            requireSuccessfulChecks:
              true,

            requireRepositoryPersistence:
              false,
          });

        assert.equal(
          result.complete,
          false,
        );

        assert.match(
          result
            .blockers
            .join(
              ' ',
            ),

          /check|Preview/i,
        );
      },
    );

    it(
      'treats Agent V2 implementation output as a full workspace snapshot',
      async () => {
        const plan =
          planUniversalRun({
            prompt:
              'Build a small TypeScript CLI',

            files:
              [],
          });

        const existing = [
          file(
            'old.ts',
            'remove me',
          ),

          file(
            'keep.ts',
            'keep me',
          ),
        ];

        const snapshot = [
          file(
            'keep.ts',
            'keep me',
          ),
        ];

        const adapters =
          productionAdapters({
            implement:
              async () =>
                snapshot,

            implementationResultMode:
              'snapshot',

            commit:
              async () => ({
                commitSha:
                  'test',
              }),
          });

        const result =
          await adapters
            .implement({
              plan,

              securityControls:
                [],

              existingFiles:
                existing,
            });

        assert.deepEqual(
          result,
          snapshot,
        );

        assert.equal(
          result.some(
            (
              item,
            ) =>
              item.path ===
              'old.ts',
          ),

          false,
        );
      },
    );

    it(
      'treats Agent V2 repair output as a full workspace snapshot',
      async () => {
        const plan =
          planUniversalRun({
            prompt:
              'Build a Rust CLI',

            files:
              [],
          });

        const rejectedWorkspace = [
          file(
            'old.rs',
            'remove me',
          ),

          file(
            'src/main.rs',
            'fn main() {}',
          ),
        ];

        const repairedSnapshot = [
          file(
            'src/main.rs',
            'fn main() { println!("fixed"); }',
          ),
        ];

        const adapters =
          productionAdapters({
            implement:
              async () =>
                [],

            repair:
              async ({
                failures,
              }) => {
                assert.deepEqual(
                  failures,

                  [
                    'cargo test: compiler failure',
                  ],
                );

                return repairedSnapshot;
              },

            repairResultMode:
              'snapshot',

            commit:
              async () => ({
                commitSha:
                  'test',
              }),
          });

        assert.ok(
          adapters.repair,
        );

        const result =
          await adapters
            .repair!({
              plan,

              failures: [
                'cargo test: compiler failure',
              ],

              files:
                rejectedWorkspace,
            });

        assert.deepEqual(
          result,
          repairedSnapshot,
        );

        assert.equal(
          result?.some(
            (
              item,
            ) =>
              item.path ===
              'old.rs',
          ),

          false,
        );
      },
    );

    it(
      'locks Universal mode to implementation tools rather than Agent-owned verification tools',
      () => {
        const tools =
          source(
            '../ai/softwareAgent/xrogaTools.ts',
          );

        const implementationBlock =
          tools.match(
            /const implementationTools\s*=\s*\[([\s\S]*?)\];/,
          )?.[1] ??
          '';

        assert.match(
          implementationBlock,
          /writeFile/,
        );

        assert.match(
          implementationBlock,
          /deleteFile/,
        );

        assert.match(
          implementationBlock,
          /renameFile/,
        );

        assert.doesNotMatch(
          implementationBlock,
          /runChecks/,
        );

        assert.doesNotMatch(
          implementationBlock,
          /verifyPreview/,
        );

        assert.doesNotMatch(
          implementationBlock,
          /createReviewBranch/,
        );

        assert.match(
          tools,

          /verificationAuthority\s*===\s*['"]universal['"][\s\S]{0,160}\?\s*implementationTools[\s\S]{0,80}:\s*agentVerifiedTools/,
        );
      },
    );

    it(
      'locks the Universal implementation adapter to outer verification authority',
      () => {
        const adapter =
          source(
            './softwareAgentImplementationAdapter.ts',
          );

        assert.match(
          adapter,

          /verificationAuthority\s*:\s*['"]universal['"]/,
        );

        assert.match(
          adapter,

          /status\s*!==\s*['"]implemented['"]/,
        );

        assert.doesNotMatch(
          adapter,

          /status\s*!==\s*['"]verified['"]/,
        );
      },
    );

    it(
      'locks verifier failures to same-run Agent V2 repair instead of legacy repair',
      () => {
        const entrypoint =
          source(
            './universalEntrypoint.ts',
          );

        assert.doesNotMatch(
          entrypoint,

          /repairIncrementally/,
        );

        assert.match(
          entrypoint,

          /forceContinueFromCheckpoint\s*:\s*true/,
        );

        assert.match(
          entrypoint,

          /workingFiles\s*:\s*files/,
        );

        assert.match(
          entrypoint,

          /implementationResultMode\s*:\s*['"]snapshot['"]/,
        );

        assert.match(
          entrypoint,

          /repairResultMode\s*:\s*['"]snapshot['"]/,
        );

        assert.match(
          entrypoint,

          /AUTHORITATIVE XROGA VERIFICATION FAILURE/,
        );
      },
    );

    it(
      'keeps completed universal checkpoints resumable for outer-verifier repair',
      () => {
        const service =
          source(
            '../ai/softwareAgent/SoftwareAgentService.ts',
          );

        assert.match(
          service,

          /case\s*['"]implemented['"]\s*:[\s\S]{0,320}return\s*['"]active['"]/,
        );
      },
    );

    it(
      'forces a repair turn even when restored implementation evidence is already complete',
      () => {
        const executor =
          source(
            '../ai/softwareAgent/AgentSoftwareExecutor.ts',
          );

        assert.match(
          executor,

          /resumedFromCheckpoint[\s\S]{0,160}!input[\s\S]{0,120}forceContinueFromCheckpoint[\s\S]{0,160}restoredCompletion/,
        );

        assert.match(
          executor,

          /verificationAuthority\s*===\s*['"]universal['"]/,
        );
      },
    );

    it(
      'preserves the same Agent conversation request across provider fallback routes',
      () => {
        const model =
          source(
            '../ai/softwareAgent/xrogaAgentModel.ts',
          );

        assert.match(
          model,

          /executeWithProviderFallback/,
        );

        assert.match(
          model,

          /request\s*:\s*input\.request/,
        );

        assert.match(
          model,

          /runSingleModelTurn\([\s\S]{0,500}request\s*:\s*input\.request/,
        );
      },
    );
  },
);
