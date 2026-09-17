import {
  Agent,
} from '@cline/sdk';

import type {
  SoftwareExecutionContract,
  SoftwareRunEvidence,
} from './contracts.js';

import type {
  SoftwareRunEvent,
  SoftwareRunEventSink,
} from './runEvents.js';

import type {
  SoftwareAgentToolHost,
} from './toolHost.js';

import type {
  SoftwareAgentModelRoute,
} from './agentModelRoute.js';

import {
  assertSoftwareAgentModelRoute,
} from './agentModelRoute.js';

import {
  buildSoftwareAgentPrompt,
} from './softwareAgentPrompt.js';

import {
  createAgentEvidence,
} from './createAgentEvidence.js';

import {
  createXrogaSoftwareTools,
} from './xrogaTools.js';

import {
  evaluateSoftwareCompletion,
} from './completionGate.js';

import {
  VerificationContinuationTracker,
} from './verificationContinuationPolicy.js';

export type AgentSoftwareExecutionStatus =
  | 'verified'
  | 'incomplete'
  | 'failed'
  | 'cancelled';

export interface AgentSoftwareExecutorInput {
  contract:
    SoftwareExecutionContract;

  host:
    SoftwareAgentToolHost;

  events:
    SoftwareRunEventSink;

  model:
    SoftwareAgentModelRoute;

  signal?:
    AbortSignal;

  /**
   * Evidence recovered from a durable workspace checkpoint.
   */
  initialEvidence?:
    SoftwareRunEvidence;

  /**
   * Tells the agent that the working tree already contains prior work
   * from this exact run.
   */
  resumedFromCheckpoint?:
    boolean;

  /**
   * Durable checkpoint callback.
   *
   * Called after evidence-affecting Xroga tool events.
   */
  checkpoint?: (
    evidence:
      SoftwareRunEvidence,
  ) =>
    Promise<void> |
    void;
}

export interface AgentSoftwareExecutorResult {
  status:
    AgentSoftwareExecutionStatus;

  evidence:
    SoftwareRunEvidence;

  blockers:
    string[];

  outputText:
    string;

  iterations:
    number;

  usage?:
    unknown;

  failureCode?:
    | 'AGENT_FAILED'
    | 'AGENT_ABORTED'
    | 'VERIFICATION_INCOMPLETE';

  failureMessage?:
    string;
}

function buildVerificationContinuation(
  blockers:
    string[],
): string {
  return `
The software task is not verified yet.

Xroga's deterministic completion gate reports:

${blockers.map((blocker) => `- ${blocker}`).join('\n')}

Continue working on the SAME project and SAME task.

Use the available Xroga tools to inspect the actual evidence, diagnose the remaining problem, apply the smallest safe correction, rerun the applicable checks, and verify Preview when required.

Do not merely explain the blockers.
Do not claim completion until the tools produce the required evidence.
Do not restart or regenerate unrelated project work.

There is no arbitrary total build-time deadline and no fixed total verification-round limit. Continue while you can make real verifiable progress.
`.trim();
}

function buildInitialGoal(
  goal:
    string,

  resumed:
    boolean,
): string {
  if (
    !resumed
  ) {
    return goal;
  }

  return `
${goal}

Xroga recovery context:

This is the SAME software task resumed from a durable Agent V2 checkpoint.

The current project files already include work produced earlier in this run.

Inspect the current workspace before changing anything.
Preserve correct existing checkpointed work.
Continue from the current state instead of regenerating the product from scratch.
Rerun deterministic checks and Preview when their evidence is missing or invalidated.
`.trim();
}

function nonConvergenceBlocker(
  stagnantContinuations:
    number,
): string {
  return (
    'Agent V2 stopped because ' +
    `${stagnantContinuations} consecutive verification continuation ` +
    `attempt${stagnantContinuations === 1 ? '' : 's'} produced no new ` +
    'verifiable project evidence. This is a convergence blocker, not a time limit.'
  );
}

/**
 * Any code mutation invalidates verification evidence produced for the
 * previous snapshot.
 *
 * Without this, the agent could:
 *
 * checks pass
 * → Preview passes
 * → edit a file
 * → reuse the old evidence
 * → incorrectly complete
 */
function invalidateVerificationAfterMutation(
  evidence:
    SoftwareRunEvidence,
): void {
  evidence.checks.splice(
    0,
    evidence.checks.length,
  );

  delete evidence.preview;
  delete evidence.commitSha;
  delete evidence.branch;
}

function isMutationEvent(
  type:
    SoftwareRunEvent[
      'type'
    ],
): boolean {
  return (
    type ===
      'file.created' ||
    type ===
      'file.updated' ||
    type ===
      'file.deleted'
  );
}

function shouldCheckpointAfter(
  type:
    SoftwareRunEvent[
      'type'
    ],
): boolean {
  return (
    isMutationEvent(
      type,
    ) ||
    type ===
      'check.completed' ||
    type ===
      'preview.ready' ||
    type ===
      'preview.failed' ||
    type ===
      'browser.verification.completed' ||
    type ===
      'git.branch.created' ||
    type ===
      'git.commit.created'
  );
}

export class AgentSoftwareExecutor {
  async execute(
    input:
      AgentSoftwareExecutorInput,
  ): Promise<
    AgentSoftwareExecutorResult
  > {
    const {
      contract,
      host,
      events,
      model,
    } = input;

    assertSoftwareAgentModelRoute(
      model,
    );

    const evidence =
      input.initialEvidence
        ? structuredClone(
            input.initialEvidence,
          )
        : createAgentEvidence();

    const checkpointSafely =
      async () => {
        if (
          !input.checkpoint
        ) {
          return;
        }

        try {
          await input.checkpoint(
            structuredClone(
              evidence,
            ),
          );
        } catch (
          error
        ) {
          console.warn(
            '[software_agent_checkpoint_write_failed]',
            error instanceof
            Error
              ? error.message
              : String(
                  error,
                ),
          );
        }
      };

    /*
     * Tool events are the exact boundary where we know a real Xroga
     * operation has completed.
     *
     * Persist the resulting evidence/workspace before publishing the
     * event outward. A process dying immediately after the event can
     * therefore never leave the UI claiming work that was not durable.
     */
    const checkpointingEvents:
      SoftwareRunEventSink = {
      emit:
        async (
          event,
        ) => {
          if (
            isMutationEvent(
              event.type,
            )
          ) {
            invalidateVerificationAfterMutation(
              evidence,
            );
          }

          if (
            shouldCheckpointAfter(
              event.type,
            )
          ) {
            await checkpointSafely();
          }

          await events.emit(
            event,
          );
        },
    };

    const {
      tools,
      completionTool,
    } =
      createXrogaSoftwareTools({
        contract,
        host,

        events:
          checkpointingEvents,

        evidence,
      });

    const systemPrompt =
      buildSoftwareAgentPrompt(
        contract,
      );

    const registeredTools = [
      ...tools,
      completionTool,
    ];

    const agent =
      model.model
        ? new Agent({
            model:
              model.model,

            systemPrompt,

            tools:
              registeredTools,
          })
        : new Agent({
            providerId:
              model.providerId!,

            modelId:
              model.modelId!,

            ...(
              model.apiKey
                ? {
                    apiKey:
                      model.apiKey,
                  }
                : {}
            ),

            ...(
              model.baseUrl
                ? {
                    baseUrl:
                      model.baseUrl,
                  }
                : {}
            ),

            ...(
              model.headers
                ? {
                    headers:
                      model.headers,
                  }
                : {}
            ),

            systemPrompt,

            tools:
              registeredTools,
          });

    let externallyAborted =
      input.signal
        ?.aborted ===
      true;

    const abortFromCaller =
      () => {
        externallyAborted =
          true;

        try {
          agent.abort(
            'Xroga software-agent execution was cancelled by the caller.',
          );
        } catch {
          /*
           * Caller cancellation remains authoritative.
           */
        }
      };

    if (
      externallyAborted
    ) {
      return {
        status:
          'cancelled',

        evidence,

        blockers:
          [],

        outputText:
          '',

        iterations:
          0,

        failureCode:
          'AGENT_ABORTED',

        failureMessage:
          'The software-agent run was cancelled.',
      };
    }

    input.signal
      ?.addEventListener(
        'abort',
        abortFromCaller,
        {
          once:
            true,
        },
      );

    let outputText =
      '';

    let totalIterations =
      0;

    let usage:
      unknown;

    const completion =
      () =>
        evaluateSoftwareCompletion({
          previewRequirement:
            contract.preview,

          evidence,

          requireSuccessfulChecks:
            true,

          requireRepositoryPersistence:
            contract.persistence ===
            'review_branch',
        });

    const cancelledResult =
      (
        blockers:
          string[],
      ):
        AgentSoftwareExecutorResult => ({
        status:
          'cancelled',

        evidence,

        blockers,

        outputText,

        iterations:
          totalIterations,

        usage,

        failureCode:
          'AGENT_ABORTED',

        failureMessage:
          'The software-agent run was cancelled.',
      });

    const failedResult =
      (
        blockers:
          string[],

        message:
          string,
      ):
        AgentSoftwareExecutorResult => ({
        status:
          'failed',

        evidence,

        blockers,

        outputText,

        iterations:
          totalIterations,

        usage,

        failureCode:
          'AGENT_FAILED',

        failureMessage:
          message,
      });

    try {
      /*
       * A restored checkpoint may already contain complete deterministic
       * evidence. Do not spend another model turn simply to rediscover
       * that fact.
       */
      const restoredCompletion =
        completion();

      if (
        input
          .resumedFromCheckpoint &&
        restoredCompletion
          .complete
      ) {
        return {
          status:
            'verified',

          evidence,

          blockers:
            [],

          outputText:
            '',

          iterations:
            0,
        };
      }

      let result =
        await agent.run(
          buildInitialGoal(
            contract.goal,

            input
              .resumedFromCheckpoint ===
              true,
          ),
        );

      outputText =
        result.outputText ??
        '';

      totalIterations +=
        result.iterations ??
        0;

      usage =
        result.usage;

      let currentCompletion =
        completion();

      if (
        currentCompletion
          .complete
      ) {
        return {
          status:
            'verified',

          evidence,

          blockers:
            [],

          outputText,

          iterations:
            totalIterations,

          usage,
        };
      }

      if (
        externallyAborted
      ) {
        return cancelledResult(
          currentCompletion
            .blockers,
        );
      }

      if (
        result.status ===
        'aborted'
      ) {
        return cancelledResult(
          currentCompletion
            .blockers,
        );
      }

      if (
        result.status ===
        'failed'
      ) {
        return failedResult(
          currentCompletion
            .blockers,

          result.error
            ?.message ??
            'The software agent failed.',
        );
      }

      const continuationTracker =
        new VerificationContinuationTracker({
          evidence,

          blockers:
            currentCompletion
              .blockers,
        });

      while (
        !currentCompletion
          .complete &&
        !externallyAborted
      ) {
        result =
          await agent.continue(
            buildVerificationContinuation(
              currentCompletion
                .blockers,
            ),
          );

        outputText =
          result.outputText ??
          outputText;

        totalIterations +=
          result.iterations ??
          0;

        usage =
          result.usage ??
          usage;

        currentCompletion =
          completion();

        if (
          currentCompletion
            .complete
        ) {
          return {
            status:
              'verified',

            evidence,

            blockers:
              [],

            outputText,

            iterations:
              totalIterations,

            usage,
          };
        }

        if (
          externallyAborted
        ) {
          return cancelledResult(
            currentCompletion
              .blockers,
          );
        }

        if (
          result.status ===
          'aborted'
        ) {
          return cancelledResult(
            currentCompletion
              .blockers,
          );
        }

        if (
          result.status ===
          'failed'
        ) {
          return failedResult(
            currentCompletion
              .blockers,

            result.error
              ?.message ??
              'The software agent failed.',
          );
        }

        const observation =
          continuationTracker
            .observe({
              evidence,

              blockers:
                currentCompletion
                  .blockers,
            });

        if (
          observation
            .shouldStop
        ) {
          const blocker =
            nonConvergenceBlocker(
              observation
                .stagnantContinuations,
            );

          return {
            status:
              'incomplete',

            evidence,

            blockers: [
              ...currentCompletion
                .blockers,

              blocker,
            ],

            outputText,

            iterations:
              totalIterations,

            usage,

            failureCode:
              'VERIFICATION_INCOMPLETE',

            failureMessage:
              blocker,
          };
        }
      }

      currentCompletion =
        completion();

      if (
        externallyAborted
      ) {
        return cancelledResult(
          currentCompletion
            .blockers,
        );
      }

      if (
        currentCompletion
          .complete
      ) {
        return {
          status:
            'verified',

          evidence,

          blockers:
            [],

          outputText,

          iterations:
            totalIterations,

          usage,
        };
      }

      return {
        status:
          'incomplete',

        evidence,

        blockers:
          currentCompletion
            .blockers,

        outputText,

        iterations:
          totalIterations,

        usage,

        failureCode:
          'VERIFICATION_INCOMPLETE',

        failureMessage:
          'The software agent stopped before Xroga verification proved the task complete.',
      };
    } catch (
      error
    ) {
      const currentCompletion =
        completion();

      if (
        currentCompletion
          .complete
      ) {
        return {
          status:
            'verified',

          evidence,

          blockers:
            [],

          outputText,

          iterations:
            totalIterations,

          usage,
        };
      }

      if (
        externallyAborted
      ) {
        return cancelledResult(
          currentCompletion
            .blockers,
        );
      }

      return failedResult(
        currentCompletion
          .blockers,

        error instanceof
        Error
          ? error.message
          : 'The software agent failed unexpectedly.',
      );
    } finally {
      /*
       * Last best-effort evidence checkpoint even when the SDK/provider
       * exits between public tool events.
       */
      await checkpointSafely();

      input.signal
        ?.removeEventListener(
          'abort',
          abortFromCaller,
        );
    }
  }
}
