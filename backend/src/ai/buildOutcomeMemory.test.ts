import {
  readFileSync,
} from 'node:fs';

import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createTenantContext } from '../security/tenantContext.js';
import { persistOwnedUniversalRecord } from '../security/ownedRunPersistence.js';

import type {
  RoutingOutcome,
} from './routingOutcomes.js';

import {
  buildOutcomeFromTerminalRun,
  classifyBuildFailure,
  recordBuildOutcomeFailOpen,
  type BuildOutcomeRecord,
  type BuildOutcomeStore,
} from './buildOutcomeMemory.js';

class MemoryStore
implements BuildOutcomeStore {
  readonly rows =
    new Map<
      string,
      BuildOutcomeRecord
    >();

  async upsert(
    outcome:
      BuildOutcomeRecord,
  ): Promise<void> {
    this.rows.set(
      outcome.runId,
      outcome,
    );
  }
}

describe(
  'Step 7B.1 BuildOutcome memory',
  () => {
    it(
      'classifies terminal failures deterministically from stable evidence',
      () => {
        assert.deepEqual(
          classifyBuildFailure({
            terminalStatus:
              'error',

            output: {
              type:
                'error',

              code:
                'BUILD_INTERRUPTED',

              error:
                'raw text must not control classification',
            },
          }),

          {
            category:
              'interrupted',

            code:
              'BUILD_INTERRUPTED',
          },
        );

        assert.equal(
          classifyBuildFailure({
            terminalStatus:
              'error',

            output: {
              compile: {
                ok:
                  false,
              },
            },
          })
            .category,

          'compile',
        );

        assert.equal(
          classifyBuildFailure({
            terminalStatus:
              'error',

            output: {
              qa: {
                ok:
                  false,
              },
            },
          })
            .category,

          'verification',
        );

        assert.equal(
          classifyBuildFailure({
            terminalStatus:
              'cancelled',

            output:
              null,
          })
            .category,

          'user_cancelled',
        );
      },
    );

    it(
      'stores sanitized model telemetry without user prompt, source, messages or repository contents',
      () => {
        const routing:
          RoutingOutcome[] = [
            {
              runId:
                'run-1',

              userId:
                'user-secret-id',

              taskClass:
                'multi_file_implementation',

              modelId:
                'deepseek_v4_flash',

              mode:
                'balanced',

              latencyMs:
                321,

              inputTokens:
                1200,

              outputTokens:
                400,

              estimatedCostUsd:
                0.02,

              patchApplied:
                true,

              repairLoops:
                1,

              modelSwitches:
                0,

              provider:
                'deepseek',

              framework:
                'nextjs',

              requiredCapabilities: [
                'software.implement',
              ],

              finalVerificationOk:
                true,
            },
          ];

        const outcome =
          buildOutcomeFromTerminalRun({
            runId:
              'run-1',

            userId:
              'user-1',

            terminalStatus:
              'complete',

            featureCategory:
              'universal',

            iterationCount:
              1,

            createdAt:
              '2026-09-30T10:00:00.000Z',

            completedAt:
              '2026-09-30T10:00:05.000Z',

            output: {
              type:
                'engineering',

              prompt:
                'THIS MUST NOT BE STORED',

              source:
                'PRIVATE SOURCE MUST NOT BE STORED',

              messages: [
                'PRIVATE MESSAGE',
              ],
            },

            routingOutcomes:
              routing,

            recordedAt:
              '2026-09-30T10:00:05.000Z',
          });

        assert.equal(
          outcome.success,
          true,
        );

        assert.equal(
          outcome.failureCategory,
          'none',
        );

        assert.equal(
          outcome.durationMs,
          5000,
        );

        assert.equal(
          outcome.modelTelemetry
            .length,
          1,
        );

        const serialized =
          JSON.stringify(
            outcome,
          );

        assert.doesNotMatch(
          serialized,

          /THIS MUST NOT BE STORED/,
        );

        assert.doesNotMatch(
          serialized,

          /PRIVATE SOURCE/,
        );

        assert.doesNotMatch(
          serialized,

          /PRIVATE MESSAGE/,
        );

        assert.doesNotMatch(
          serialized,

          /user-secret-id/,
        );
      },
    );

    it(
      'is idempotent by run id when the same run receives a later authoritative outcome',
      async () => {
        const store =
          new MemoryStore();

        const first =
          buildOutcomeFromTerminalRun({
            runId:
              'same-run',

            userId:
              'user-1',

            terminalStatus:
              'error',

            iterationCount:
              1,

            output: {
              code:
                'BUILD_INTERRUPTED',
            },

            routingOutcomes:
              [],
          });

        const final =
          buildOutcomeFromTerminalRun({
            runId:
              'same-run',

            userId:
              'user-1',

            terminalStatus:
              'complete',

            iterationCount:
              2,

            output: {
              type:
                'engineering',
            },

            routingOutcomes:
              [],
          });

        assert.equal(
          await recordBuildOutcomeFailOpen(
            first,
            store,
          ),
          true,
        );

        assert.equal(
          await recordBuildOutcomeFailOpen(
            final,
            store,
          ),
          true,
        );

        assert.equal(
          store.rows.size,
          1,
        );

        assert.equal(
          store.rows
            .get(
              'same-run',
            )
            ?.success,
          true,
        );
      },
    );

    it(
      'fails open when learning-memory persistence is unavailable',
      async () => {
        const outcome =
          buildOutcomeFromTerminalRun({
            runId:
              'run-fail-open',

            userId:
              'user-1',

            terminalStatus:
              'complete',

            iterationCount:
              1,

            output:
              null,

            routingOutcomes:
              [],
          });

        const store:
          BuildOutcomeStore = {
          async upsert() {
            throw new Error(
              'database offline',
            );
          },
        };

        const recorded =
          await recordBuildOutcomeFailOpen(
            outcome,
            store,
          );

        assert.equal(
          recorded,
          false,
        );
      },
    );

    it(
      'uses collision-safe primary-key persistence for production idempotence without owner transfer',
      async () => {
        const implementation =
          readFileSync(
            new URL(
              './buildOutcomeMemory.ts',
              import.meta.url,
            ),

            'utf8',
          );

        const migration =
          readFileSync(
            new URL(
              '../../../supabase/migrations/20260930152000_step7b_build_outcomes.sql',
              import.meta.url,
            ),

            'utf8',
          );

        assert.match(
          implementation,

          /persistOwnedUniversalRecord\(supabase,context,'build_outcome'/,
          'Production learning store must use the canonical owner-bound writer',
        );

        const requests:{url:URL;method:string;headers:Headers}[]=[];
        const client=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
          requests.push({url:new URL(String(input)),method:init?.method??'GET',headers:new Headers(init?.headers)});
          return new Response(JSON.stringify(init?.method==='PATCH'?[{run_id:'fixture-run'}]:[]),{headers:{'Content-Type':'application/json'}});
        }}});
        const userId='11111111-1111-4111-8111-111111111111';
        await persistOwnedUniversalRecord(client,createTenantContext({userId,via:'persisted_owner'}),'build_outcome',{run_id:'fixture-run',user_id:userId});
        assert.equal(requests[0].url.searchParams.get('on_conflict'),'run_id');
        assert.match(requests[0].headers.get('Prefer')??'',/ignore-duplicates/);
        assert.equal(requests[1].method,'PATCH');
        assert.equal(requests[1].url.searchParams.get('run_id'),'eq.fixture-run');
        assert.equal(requests[1].url.searchParams.get('user_id'),`eq.${userId}`);

        assert.match(
          migration,

          /run_id\s+TEXT\s+PRIMARY KEY/i,
        );
      },
    );

    it(
      'explicitly limits BuildOutcome reuse to evaluation and routing rather than fine-tuning',
      () => {
        const outcome =
          buildOutcomeFromTerminalRun({
            runId:
              'run-scope',

            userId:
              'user-1',

            terminalStatus:
              'complete',

            iterationCount:
              1,

            output:
              null,

            routingOutcomes:
              [],
          });

        assert.equal(
          outcome.reuseScope,
          'evaluation_and_routing',
        );

        assert.notEqual(
          outcome.reuseScope as string,
          'fine_tuning',
        );
      },
    );
  },
);
