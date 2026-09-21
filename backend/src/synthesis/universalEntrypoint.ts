/**
 * Production entrypoint for Xroga's universal engineering path.
 *
 * The universal pipeline remains authoritative for planning, security,
 * validation, browser verification, review and the final atomic commit.
 *
 * The implementation phase is now routed through SoftwareAgentRuntime so
 * Xroga can select:
 *   - legacy coherent generation
 *   - Cline-backed Agent V2
 *   - Agent V2 shadow mode
 *
 * No second builder, preview service, sandbox or repository writer is
 * introduced here.
 */

import {
  randomUUID,
} from 'node:crypto';

import type {
  ProjectFile,
} from '../ai/patches.js';

import type {
  SoftwareRunEvent,
} from '../ai/softwareAgent/runEvents.js';

import {
  mayWrite,
  routeProject,
  type UniversalAgentFlags,
} from '../config/universalAgentFlags.js';

import {
  productionAdapters,
  type CommitFn,
} from './productionAdapters.js';


import {
  implementCoherently,
} from './coherentImplementation.js';

import {
  executeUniversalRun,
  type UniversalExecutionResult,
} from './universalExecution.js';

import {
  universalStore,
  type Owner,
  type UniversalStore,
} from './universalPersistence.js';

import {
  getSupabaseAdmin,
} from '../config/supabase.js';

import {
  routeByCapability,
  type RoutingCandidate,
} from '../ai/capabilityRouter.js';

import {
  buildProfile,
} from '../ai/modelCapabilityProfile.js';

import {
  getRuntimeModelRegistry,
} from '../ai/modelCapabilityRegistry.js';

import {
  isCodingModel,
} from '../ai/providerPolicy.js';

import {
  chooseCostAware,
} from '../ai/providerCostTiers.js';

import {
  chooseFromMeasuredEvidence,
  loadMeasuredEvidence,
} from '../ai/measuredEvidence.js';

import {
  MODELS,
  type ModelId,
} from '../ai/models.js';

import type {
  ExecutionStateStore,
} from '../ai/executionRuntime.js';

import {
  assertProjectWriteTarget,
  type ActiveProjectContext,
} from '../ai/universal/projectContext.js';

import {
  goalContractSchema,
  interpretGoalContract,
  type GoalContract,
  type GoalInterpretationInput,
} from '../ai/universal/goalContract.js';

import {
  universalCapabilityRegistry,
} from '../capabilities/index.js';

import {
  planCapabilities,
} from '../ai/universal/planner.js';

import {
  buildContractExecutionText,
  createBuildContract,
  type BuildContract,
} from './buildContract.js';

import {
  runUniversalSoftwareImplementation,
} from './softwareAgentImplementationAdapter.js';

export interface UniversalBuildOutcome {
  readonly ran: true;

  readonly result:
    UniversalExecutionResult;

   readonly goalContract:
    GoalContract | null;

  readonly buildContract:
    BuildContract | null;

  readonly routing: {
    readonly selectedModel:
      string | null;

    readonly fallbacks:
      readonly string[];

    readonly reason:
      string;

    readonly excluded:
      ReadonlyArray<{
        modelId: string;
        reason: string;
      }>;

    /**
     * True when a hand-written prior decided this rather than a
     * measurement.
     */
    readonly selectedOnPrior?: boolean;

    readonly evidenceSource?:
      | 'measured'
      | 'unavailable';
  };
}

/**
 * Build implementation-routing candidates from Xroga's runtime model
 * registry.
 *
 * Research-only models are excluded at the source of the candidate list.
 */
export function capabilityCandidates():
  readonly RoutingCandidate[] {
  return getRuntimeModelRegistry()
    .filter(
      (model) =>
        isCodingModel(
          model.id,
        ),
    )
    .map(
      (model) => ({
        available:
          model.configured &&
          model.enabled &&
          model.health.status !==
            'unavailable' &&
          model.health.status !==
            'circuit_open',

        profile:
          buildProfile({
            modelId:
              model.id,

            providerId:
              model.provider,

            contextWindow:
              model.contextWindow,

            maximumOutput:
              model.maximumSafeRequestTokens,

            toolSupport:
              model.supports
                .toolCalls,

            structuredOutputSupport:
              model.supports
                .structuredOutput,

            visionSupport:
              model.supports
                .images,

            streamingSupport:
              model.supports
                .streaming,

            declaredScores:
              model.strengths as unknown as
                Record<
                  string,
                  number
                >,

            inputUsdPer1M:
              model.inputUsdPer1M,

            outputUsdPer1M:
              model.outputUsdPer1M,
          }),
      }),
    );
}

/**
 * Extract a generated file map from a JSON model reply.
 *
 * Kept exported for compatibility with existing tests/callers even though
 * the production implementation path now uses the coherent/agent runtime
 * rather than this parser directly.
 */
export function parseGeneratedFiles(
  text: string,
): readonly ProjectFile[] {
  const fenced =
    text.match(
      /```(?:json)?\s*([\s\S]*?)```/i,
    );

  const raw =
    (
      fenced
        ? fenced[1]
        : text
    )
      ?.trim() ??
    '';

  try {
    const parsed =
      JSON.parse(
        raw,
      ) as {
        files?: Array<{
          path?: unknown;
          content?: unknown;
        }>;
      };

    if (
      !Array.isArray(
        parsed.files,
      )
    ) {
      return [];
    }

    return parsed.files
      .filter(
        (
          file,
        ): file is {
          path: string;
          content: string;
        } =>
          typeof file?.path ===
            'string' &&
          typeof file?.content ===
            'string',
      )
      .filter(
        (file) => {
          const path =
            file.path;

          return (
            path.length > 0 &&
            !path.startsWith(
              '/',
            ) &&
            !path.includes(
              '..',
            )
          );
        },
      )
      .map(
        (file) => ({
          path:
            file.path,

          content:
            file.content,
        }),
      );
  } catch {
    return [];
  }
}

/**
 * Preserved for compatibility with the older structured implementation
 * tests/documentation. The live implementation path now delegates to
 * SoftwareAgentRuntime.
 */
export const IMPLEMENT_SYSTEM =
  `You are the implementation agent on Xroga's universal engineering path.
You receive a brief containing decisions that are already settled. Do not change the language,
framework, package manager or architecture the brief states.

Return JSON only, with no prose and no markdown fence:
{"files":[{"path":"relative/path","content":"complete file contents"}]}

Rules:
- Every file must be complete and syntactically valid. No placeholders, no TODO stubs.
- Include the project manifest, sources, tests and a README.
- Paths are relative. Never absolute, never containing "..".
- Include the tests the acceptance criteria and security requirements call for, including
  the negative tests that prove a refusal actually happens.`;

export async function tryUniversalBuild(
  input: {
    runId?: string;

    userId: string;

    projectId?:
      | string
      | null;

    prompt: string;

    existingFiles?:
      readonly ProjectFile[];

    commit:
      CommitFn;

    flags?:
      UniversalAgentFlags;

    store?:
      UniversalStore;

    /**
     * Durable store for the canonical task graph.
     */
    executionStore?:
      ExecutionStateStore;
        /**
     * Public Software Agent V2 execution events.
     *
     * Used by the outer build pipeline for live delivery.
     */
    onEvent?: (
      event: SoftwareRunEvent,
    ) => void;

    /**
     * Canonical project identity visible to the user and the
     * independently constructed repository write target.
     */
    activeProjectContext?:
      ActiveProjectContext;

    writeTarget?:
      ActiveProjectContext;

    goalContext?:
      Pick<
        GoalInterpretationInput,
        | 'history'
        | 'attachments'
        | 'projectState'
      >;

    goalInterpreter?: (
      input:
        GoalInterpretationInput & {
          availableCapabilityIds:
            readonly string[];

          modelId:
            ModelId;
        },
    ) => Promise<unknown>;
  },
): Promise<
  UniversalBuildOutcome |
  null
> {
  const decision =
    routeProject(
      input.projectId ??
        null,
      input.flags,
    );

  if (
    !mayWrite(
      decision,
    )
  ) {
    return null;
  }

  if (
    input.activeProjectContext ||
    input.writeTarget
  ) {
    if (
      !input.activeProjectContext ||
      !input.writeTarget
    ) {
      throw new Error(
        'A universal repository write requires both active context and write target.',
      );
    }

    assertProjectWriteTarget(
      input.activeProjectContext,
      input.writeTarget,
    );
  }

  /*
   * One run id is shared by universal execution, Agent V2 events and
   * canonical task evidence. Previously a generated id existed only
   * inside executeUniversalRun, which made it impossible for an inner
   * implementation runtime to bind its evidence to the same run.
   */
  const runId =
    input.runId ??
    randomUUID();

  const owner:
    Owner = {
    userId:
      input.userId,

    projectId:
      input.projectId ??
      `run:${runId}`,
  };

  const route =
    routeByCapability(
      {
        capability:
          'coding',

        requiredContextTokens:
          32_000,

        needsStructuredOutput:
          true,
      },

      capabilityCandidates(),
    );

  if (
    !route.selected
  ) {
    return {
      ran:
        true,

            goalContract:
        null,

      buildContract:
        null,

      routing: {
        selectedModel:
          null,

        fallbacks:
          [],

        reason:
          route.reason,

        excluded:
          route.excluded,
      },

      result: {
        outcome:
          'blocked',

        phaseReached:
          'routing',

        plan:
          null,

        securityControls:
          [],

        files:
          [],

        commitSha:
          null,

        evidence:
          [],

        blockers: [
          route.reason,
        ],

        mutationBegan:
          false,

        verified:
          false,

        reason:
          route.reason,
      },
    };
  }

  let goalContract:
    GoalContract;

  try {
    const interpretationInput:
      GoalInterpretationInput = {
      message:
        input.prompt,

      history:
        input.goalContext
          ?.history ??
        [],

      projectContext:
        input.activeProjectContext ??
        null,

      attachments:
        input.goalContext
          ?.attachments ??
        [],

      projectState:
        input.goalContext
          ?.projectState ??
        (
          input.existingFiles
            ?.length
            ? {
                fileCount:
                  input
                    .existingFiles
                    .length,
              }
            : undefined
        ),
    };

    goalContract =
      input.goalInterpreter
        ? await interpretGoalContract(
            interpretationInput,
            (
              goalInput,
            ) =>
              input.goalInterpreter!(
                {
                  ...goalInput,

                  availableCapabilityIds:
                    universalCapabilityRegistry
                      .list()
                      .map(
                        (
                          item,
                        ) =>
                          item.id,
                      ),

                  modelId:
                    route.selected!
                      .modelId as
                      ModelId,
                },
              ),
          )
        : goalContractSchema.parse(
            {
              version:
                '1.0',

              goal:
                input.prompt,

              desiredOutcome:
                input.prompt,

              semanticIntent:
                'MODIFY',

              constraints:
                [],

              acceptance:
                [],

              historyContext:
                [],

              projectContext:
                input.activeProjectContext ??
                null,

              deliverables:
                [],

              requiredCapabilities: [
                'software.implement',
                'validation.run',

                ...(input.activeProjectContext
                  ? [
                      'repository.read',
                      'repository.write',
                    ]
                  : []),
              ],

              requiredAuthorities:
                [],

              risks:
                [],

              confidence:
                0.5,

              blockers:
                [],

              contextComplexity:
                'unknown',
            },
          );

    const authorities =
      new Set([
        'model:execute',
        'sandbox:execute',

        ...(input.activeProjectContext
          ? [
              'repository:read',
              'repository:write',
            ]
          : []),
      ]);

    const capabilityPlan =
      await planCapabilities({
        goal:
          goalContract,

        registry:
          universalCapabilityRegistry,

        authorities,

        select:
          async () => ({
            capabilityIds:
              goalContract
                .requiredCapabilities,

            rationale:
              'Capabilities requested by the validated semantic goal contract.',
          }),
      });

    if (
      capabilityPlan
        .rejected
        .length
    ) {
      const reason =
        `Goal requires unavailable or unauthorized capabilities: ${
          capabilityPlan.rejected
            .map(
              (item) =>
                `${item.id} (${item.reason})`,
            )
            .join(', ')
        }`;

      return {
        ran:
          true,

                goalContract,

        buildContract:
          null,

        routing: {
          selectedModel:
            route.selected
              .modelId,

          fallbacks:
            [],

          reason,

          excluded:
            route.excluded,
        },

        result: {
          outcome:
            'blocked',

          phaseReached:
            'routing',

          plan:
            null,

          securityControls:
            [],

          files:
            [],

          commitSha:
            null,

          evidence:
            [],

          blockers: [
            reason,
          ],

          mutationBegan:
            false,

          verified:
            false,

          reason,
        },
      };
    }
  } catch (
    error
  ) {
    const reason =
      `Semantic goal interpretation failed: ${
        error instanceof
        Error
          ? error.message
          : String(error)
      }`;

    return {
      ran:
        true,

           goalContract:
        null,

      buildContract:
        null,

      routing: {
        selectedModel:
          route.selected
            .modelId,

        fallbacks:
          [],

        reason,

        excluded:
          route.excluded,
      },

      result: {
        outcome:
          'blocked',

        phaseReached:
          'routing',

        plan:
          null,

        securityControls:
          [],

        files:
          [],

        commitSha:
          null,

        evidence:
          [],

        blockers: [
          reason,
        ],

        mutationBegan:
          false,

        verified:
          false,

        reason,
      },
    };
  }

  /*
 * Everything downstream must consume the validated semantic request,
 * not reparsed conversational shorthand from the latest message.
 *
 * This is the boundary that resolves:
 *
 * "build a landing page"
 * → "finish that"
 *
 * into one stable engineering goal.
 */
const buildContract =
  createBuildContract({
    projectId:
      owner.projectId,

    runId,

    sourcePrompt:
      input.prompt,

    goal:
      goalContract,

    existingFileCount:
      input.existingFiles
        ?.length ??
      0,

    continuation:
      Boolean(
        (
          input.existingFiles
            ?.length ??
          0
        ) >
          0 &&
        (
          input.goalContext
            ?.history
            ?.length ??
          0
        ) >
          0,
      ),
  });

const executionPrompt =
  buildContractExecutionText(
    buildContract,
  );

const measuredEvidence =
  await loadMeasuredEvidence();

  const measured =
    chooseFromMeasuredEvidence({
      role:
        'implementation',

      candidates: [
        route.selected
          .modelId,

        ...route.fallbacks
          .map(
            (model) =>
              model.modelId,
          ),
      ],

      evidence:
        measuredEvidence,

      chooser:
        (
          choice,
        ) =>
          chooseCostAware(
            choice,
          ),
    });

  const orderedCandidates:
    readonly string[] =
    measured.modelId
      ? [
          measured.modelId,

          ...[
            route.selected
              .modelId,

            ...route.fallbacks
              .map(
                (
                  model,
                ) =>
                  model.modelId,
              ),
          ].filter(
            (
              modelId,
            ) =>
              modelId !==
              measured.modelId,
          ),
        ]
      : [
          route.selected
            .modelId,

          ...route.fallbacks
            .map(
              (
                model,
              ) =>
                model.modelId,
            ),
        ];

  const primaryModelId =
    orderedCandidates[0] as
      ModelId;

  const fallbackModelIds =
    orderedCandidates.slice(
      1,
    ) as ModelId[];

    const result =
    await executeUniversalRun({
      prompt:
        executionPrompt,

      buildContract,

      owner,

      runId,

      existingFiles:
        input.existingFiles ??
        [],

      flags:
        input.flags,

      store:
        input.store ??
        universalStore(
          getSupabaseAdmin(),
        ),

      adapters:
        productionAdapters({
          implement:
            async ({
              brief,
              plan,
              existingFiles,
              signal,
            }) =>
              runUniversalSoftwareImplementation(
                {
                  userId:
                    input.userId,

                  runId,

                  buildContract,

                  projectId:
                    input.projectId,

                  prompt:
                  executionPrompt,

                  brief,

                  plan,

                  existingFiles,

                  primaryModelId,

                  fallbackModelIds,

                  activeProjectContext:
                    input.activeProjectContext,

                  signal,

                  onEvent:
                    input.onEvent,

                  /*
                   * The legacy implementation is still present, but it is
                   * now behind SoftwareAgentRuntime's selector rather than
                   * being hard-wired as the production implementation.
                   */
                  runLegacy:
                    () =>
                      implementCoherently(
                        {
                          brief,

                          originalRequest:
                          executionPrompt,

                          candidates:
                            orderedCandidates.map(
                              (
                                modelId,
                              ) => ({
                                modelId,
                              }),
                            ),

                          existingFiles,

                          signal,

                          onTelemetry:
                            (
                              record,
                            ) => {
                              console.info(
                                '[builder_model_call]',
                                JSON.stringify(
                                  record,
                                ),
                              );
                            },
                        },
                      ),
                },
              ),

          

          /*
           * Outer deterministic validation remains authoritative.
           * Agent V2 already gets bounded same-agent repair rounds during
           * implementation; this existing repair adapter remains the
           * universal pipeline's final bounded repair after independent
           * validation/browser evidence.
           */
 /*
 * Authoritative verification failures re-enter the SAME
 * Agent V2 run.
 *
 * Important:
 *
 * - runId stays identical;
 * - existingFiles stays the original run-start repository base;
 * - workingFiles is the exact snapshot rejected by the verifier;
 * - the durable checkpoint is therefore still valid;
 * - verifier diagnostics are supplied verbatim as repair evidence.
 */

          implementationResultMode:
  'snapshot',
repair:
  async ({
    brief,
    plan,
    failures,
    files,
  }) => {
    const repairBrief =
      [
        brief,

        '',

        'AUTHORITATIVE XROGA VERIFICATION FAILURE',

        'The outer deterministic verifier rejected the current workspace.',

        'Continue from the CURRENT workspace. Do not regenerate correct unrelated work.',

        'Repair the smallest coherent set of files that addresses the exact evidence below.',

        '',

        ...failures.map(
          (
            failure,
            index,
          ) =>
            `Failure ${index + 1}:\n${failure}`,
        ),
      ].join(
        '\n',
      );

    return runUniversalSoftwareImplementation(
      {
        userId:
          input.userId,

        runId,

        buildContract,

        projectId:
          input.projectId,

        prompt:
          executionPrompt,

        brief:
          repairBrief,

        plan,

        /*
         * Keep the immutable run-start base so the existing
         * durable checkpoint fingerprint still matches.
         */
        existingFiles:
          input.existingFiles ??
          [],

        /*
         * If durable checkpoint restoration is unavailable,
         * this prevents repair from falling back to an old base.
         */
        workingFiles:
          files,

        forceContinueFromCheckpoint:
          true,

        primaryModelId,

        fallbackModelIds,

        activeProjectContext:
          input.activeProjectContext,

        onEvent:
          input.onEvent,
      },
    );
  },
repairResultMode:
  'snapshot',
          commit:
            input.commit,
        }),

      implementationRouting: {
        selectedModel:
          primaryModelId,

        provider:
          MODELS[
            primaryModelId
          ]?.provider ??
          null,

        fallbackModels:
          fallbackModelIds,
      },

      executionStore:
        input.executionStore,
    });

  return {
    ran:
      true,

    goalContract,

    buildContract,

    result,

    routing: {
      selectedModel:
        primaryModelId,

      fallbacks:
        fallbackModelIds,

      reason:
        measured.measured
          ? `selected on measured evidence — ${measured.reason}`
          : `selected on prior — ${route.reason} (${measured.reason})`,

      excluded:
        route.excluded,

      selectedOnPrior:
        !measured.measured,

      evidenceSource:
        measuredEvidence.source,
    },
  };
}

/**
 * A commit function that refuses rather than inventing a repository.
 */
export function refusingCommit(
  reason: string,
): CommitFn {
  return async () => {
    throw new Error(
      `Refusing to commit: ${reason}. A universal run must write through the atomic GitHub ` +
        'path against a connected repository; reporting success without a commit would be a false result.',
    );
  };
}
