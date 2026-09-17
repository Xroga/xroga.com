import {
  Agent,
} from '@cline/sdk';

import type {
  SoftwareExecutionContract,
  SoftwareRunEvidence,
} from './contracts.js';

import type {
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
  contract: SoftwareExecutionContract;

  host: SoftwareAgentToolHost;

  events: SoftwareRunEventSink;

  model: SoftwareAgentModelRoute;

  /**
   * Caller-owned cancellation boundary.
   *
   * There is intentionally no Xroga-owned total execution deadline.
   *
   * A software product may legitimately require many model turns,
   * builds, tests, repairs and browser-verification cycles.
   *
   * Individual provider/tool/sandbox operations retain their own
   * bounded safety deadlines.
   */
  signal?: AbortSignal;
}

export interface AgentSoftwareExecutorResult {
  status: AgentSoftwareExecutionStatus;

  evidence: SoftwareRunEvidence;

  blockers: string[];

  outputText: string;

  iterations: number;

  /**
   * Keep provider usage available internally.
   *
   * The exact SDK usage object may evolve, so keep this opaque at
   * the Xroga boundary.
   */
  usage?: unknown;

  failureCode?:
    | 'AGENT_FAILED'
    | 'AGENT_ABORTED'
    | 'VERIFICATION_INCOMPLETE';

  failureMessage?: string;
}

function buildVerificationContinuation(
  blockers: string[],
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

function nonConvergenceBlocker(
  stagnantContinuations: number,
): string {
  return (
    'Agent V2 stopped because ' +
    `${stagnantContinuations} consecutive verification continuation ` +
    `attempt${stagnantContinuations === 1 ? '' : 's'} produced no new ` +
    'verifiable project evidence. This is a convergence blocker, not a time limit.'
  );
}

export class AgentSoftwareExecutor {
  async execute(
    input: AgentSoftwareExecutorInput,
  ): Promise<AgentSoftwareExecutorResult> {
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
      createAgentEvidence();

    /*
     * createXrogaSoftwareTools deliberately exposes the completion
     * tool separately because it has lifecycle.completesRun = true.
     *
     * The completion tool still MUST be registered with Cline.
     */
    const {
      tools,
      completionTool,
    } =
      createXrogaSoftwareTools({
        contract,
        host,
        events,
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

    /*
     * Production Xroga supplies a pre-built AgentModel whose provider
     * calls stay behind Xroga quota/budget/health controls.
     *
     * The direct provider configuration path remains for isolated tests
     * and controlled non-production callers only.
     */
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
           * Abort is best-effort.
           *
           * The caller-owned cancellation flag remains authoritative.
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
      ): AgentSoftwareExecutorResult => ({
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
      ): AgentSoftwareExecutorResult => ({
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
      let result =
        await agent.run(
          contract.goal,
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

      /*
       * Deterministic Xroga evidence remains the strongest source of
       * truth.
       *
       * If the tools already proved the task complete, do not throw the
       * work away because the SDK happened to end its turn awkwardly.
       */
      if (
        currentCompletion.complete
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
          currentCompletion.blockers,
        );
      }

      if (
        result.status ===
        'aborted'
      ) {
        return cancelledResult(
          currentCompletion.blockers,
        );
      }

      if (
        result.status ===
        'failed'
      ) {
        return failedResult(
          currentCompletion.blockers,

          result.error
            ?.message ??
            'The software agent failed.',
        );
      }

      /*
       * There is intentionally no maximum total continuation count.
       *
       * As long as deterministic evidence keeps changing, Agent V2 can
       * continue working for as many verification/repair cycles as the
       * task genuinely requires.
       *
       * Only repeated identical verification states trigger the
       * non-convergence guard.
       */
      const continuationTracker =
        new VerificationContinuationTracker({
          evidence,

          blockers:
            currentCompletion
              .blockers,
        });

      while (
        !currentCompletion.complete &&
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

        /*
         * Tool evidence wins over model/SDK status.
         *
         * A continuation may successfully finish its final check or
         * Preview immediately before the SDK reports its terminal turn.
         */
        if (
          currentCompletion.complete
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
            currentCompletion.blockers,
          );
        }

        if (
          result.status ===
          'aborted'
        ) {
          return cancelledResult(
            currentCompletion.blockers,
          );
        }

        if (
          result.status ===
          'failed'
        ) {
          return failedResult(
            currentCompletion.blockers,

            result.error
              ?.message ??
              'The software agent failed.',
          );
        }

        const observation =
          continuationTracker.observe({
            evidence,

            blockers:
              currentCompletion
                .blockers,
          });

        if (
          observation.shouldStop
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
          currentCompletion.blockers,
        );
      }

      if (
        currentCompletion.complete
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
          currentCompletion.blockers,

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

      /*
       * A thrown SDK/provider error after deterministic completion must
       * not erase verified work.
       */
      if (
        currentCompletion.complete
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
          currentCompletion.blockers,
        );
      }

      return failedResult(
        currentCompletion.blockers,

        error instanceof
        Error
          ? error.message
          : 'The software agent failed unexpectedly.',
      );
    } finally {
      input.signal
        ?.removeEventListener(
          'abort',
          abortFromCaller,
        );
    }
  }
}
