import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  readFileSync,
} from 'node:fs';

import type {
  SoftwareRunEvidence,
} from './contracts.js';

import {
  DEFAULT_MAX_STAGNANT_CONTINUATIONS,
  VerificationContinuationTracker,
  verificationProgressFingerprint,
} from './verificationContinuationPolicy.js';

function evidence(
  revision:
    string,
): SoftwareRunEvidence {
  return {
    changedFiles: [
      {
        path:
          'src/app/page.tsx',

        revision,

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
    ],
  };
}

describe(
  'Agent V2 continuation policy',
  () => {
    it(
      'does not impose a total productive continuation limit',
      () => {
        let currentEvidence =
          evidence(
            'revision-0',
          );

        const tracker =
          new VerificationContinuationTracker({
            evidence:
              currentEvidence,

            blockers: [
              'Preview still required.',
            ],
          });

        /*
         * A deliberately large number.
         *
         * If someone reintroduces a hidden "maximum verification rounds"
         * policy into this tracker, this regression should expose it.
         */
        for (
          let index =
            1;
          index <=
          500;
          index +=
            1
        ) {
          currentEvidence =
            evidence(
              `revision-${index}`,
            );

          const observation =
            tracker.observe({
              evidence:
                currentEvidence,

              blockers: [
                'Preview still required.',
              ],
            });

          assert.equal(
            observation.progressed,
            true,
          );

          assert.equal(
            observation.stagnantContinuations,
            0,
          );

          assert.equal(
            observation.shouldStop,
            false,
          );
        }
      },
    );

    it(
      'stops only after repeated completed continuations produce no new verifiable evidence',
      () => {
        const currentEvidence =
          evidence(
            'revision-1',
          );

        const tracker =
          new VerificationContinuationTracker({
            evidence:
              currentEvidence,

            blockers: [
              'Preview still required.',
            ],
          });

        const first =
          tracker.observe({
            evidence:
              currentEvidence,

            blockers: [
              'Preview still required.',
            ],
          });

        assert.equal(
          first.progressed,
          false,
        );

        assert.equal(
          first.stagnantContinuations,
          1,
        );

        assert.equal(
          first.shouldStop,
          false,
        );

        const second =
          tracker.observe({
            evidence:
              currentEvidence,

            blockers: [
              'Preview still required.',
            ],
          });

        assert.equal(
          second.progressed,
          false,
        );

        assert.equal(
          second.stagnantContinuations,
          DEFAULT_MAX_STAGNANT_CONTINUATIONS,
        );

        assert.equal(
          second.shouldStop,
          true,
        );
      },
    );

    it(
      'resets non-convergence immediately when real evidence changes',
      () => {
        const firstEvidence =
          evidence(
            'revision-1',
          );

        const tracker =
          new VerificationContinuationTracker({
            evidence:
              firstEvidence,

            blockers: [
              'Preview still required.',
            ],
          });

        const stagnant =
          tracker.observe({
            evidence:
              firstEvidence,

            blockers: [
              'Preview still required.',
            ],
          });

        assert.equal(
          stagnant.stagnantContinuations,
          1,
        );

        const progressed =
          tracker.observe({
            evidence:
              evidence(
                'revision-2',
              ),

            blockers: [
              'Preview still required.',
            ],
          });

        assert.equal(
          progressed.progressed,
          true,
        );

        assert.equal(
          progressed.stagnantContinuations,
          0,
        );

        assert.equal(
          progressed.shouldStop,
          false,
        );
      },
    );

    it(
      'counts changed deterministic blockers as progress',
      () => {
        const currentEvidence =
          evidence(
            'revision-1',
          );

        const tracker =
          new VerificationContinuationTracker({
            evidence:
              currentEvidence,

            blockers: [
              'Build failed.',
            ],
          });

        const observation =
          tracker.observe({
            evidence:
              currentEvidence,

            blockers: [
              'Build passed; Preview remains.',
            ],
          });

        assert.equal(
          observation.progressed,
          true,
        );

        assert.equal(
          observation.shouldStop,
          false,
        );
      },
    );

    it(
      'produces the same fingerprint when evidence ordering changes',
      () => {
        const first:
          SoftwareRunEvidence = {
          changedFiles: [
            {
              path:
                'b.ts',

              revision:
                '2',
            },

            {
              path:
                'a.ts',

              revision:
                '1',
            },
          ],

          checks: [
            {
              id:
                'check-b',

              name:
                'B',

              status:
                'passed',
            },

            {
              id:
                'check-a',

              name:
                'A',

              status:
                'passed',
            },
          ],
        };

        const second:
          SoftwareRunEvidence = {
          changedFiles: [
            {
              path:
                'a.ts',

              revision:
                '1',
            },

            {
              path:
                'b.ts',

              revision:
                '2',
            },
          ],

          checks: [
            {
              id:
                'check-a',

              name:
                'A',

              status:
                'passed',
            },

            {
              id:
                'check-b',

              name:
                'B',

              status:
                'passed',
            },
          ],
        };

        assert.equal(
          verificationProgressFingerprint({
            evidence:
              first,

            blockers: [
              'second',
              'first',
            ],
          }),

          verificationProgressFingerprint({
            evidence:
              second,

            blockers: [
              'first',
              'second',
            ],
          }),
        );
      },
    );

    it(
      'keeps the Agent V2 executor free of a whole-run wall-clock timer',
      () => {
        const source =
          readFileSync(
            new URL(
              './AgentSoftwareExecutor.ts',
              import.meta.url,
            ),

            'utf8',
          );

        assert.doesNotMatch(
          source,
          /\bsetTimeout\s*\(/,
        );

        assert.doesNotMatch(
          source,
          /execution deadline reached/i,
        );

        assert.doesNotMatch(
          source,
          /\bAGENT_TIMEOUT\b/,
        );
      },
    );

    it(
      'keeps the production implementation adapter free of total timeout and fixed verification-round configuration',
      () => {
        const source =
          readFileSync(
            new URL(
              '../../synthesis/softwareAgentImplementationAdapter.ts',
              import.meta.url,
            ),

            'utf8',
          );

        assert.doesNotMatch(
          source,
          /\btimeoutMs\s*:/,
        );

        assert.doesNotMatch(
          source,
          /\bverificationRounds\s*:/,
        );
      },
    );

    it(
      'does not expose whole-run timeout knobs through the service or runtime layers',
      () => {
        const service =
          readFileSync(
            new URL(
              './SoftwareAgentService.ts',
              import.meta.url,
            ),

            'utf8',
          );

        const runtime =
          readFileSync(
            new URL(
              './SoftwareAgentRuntime.ts',
              import.meta.url,
            ),

            'utf8',
          );

        assert.doesNotMatch(
          service,
          /\btimeoutMs\b/,
        );

        assert.doesNotMatch(
          service,
          /\bverificationRounds\b/,
        );

        assert.doesNotMatch(
          runtime,
          /\btimeoutMs\b/,
        );

        assert.doesNotMatch(
          runtime,
          /\bverificationRounds\b/,
        );
      },
    );
  },
);
