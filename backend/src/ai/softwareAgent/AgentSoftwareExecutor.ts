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
   * Overall safety ceiling for one software-agent session.
   *
   * This is NOT a provider timeout.
   * Provider/network timeout policy will remain Xroga-owned.
   */
  timeoutMs?: number;

  /**
   * Number of times Xroga may tell the SAME durable agent:
   *
   * "You are not verified yet; here are the blockers."
   *
   * This is deliberately small.
   */
  verificationRounds?: number;
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
   * The exact SDK usage object may evolve, so keep this
   * opaque at this Xroga boundary for now.
   */
  usage?: unknown;

  failureCode?:
    | 'AGENT_FAILED'
    | 'AGENT_ABORTED'
    | 'AGENT_TIMEOUT'
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
`.trim();
}

function normalizeTimeout(
  timeoutMs: number | undefined,
): number {
  if (
    typeof timeoutMs !== 'number' ||
    !Number.isFinite(timeoutMs)
  ) {
    return 6 * 60 * 1000;
  }

  return Math.min(
    Math.max(timeoutMs, 30_000),
    10 * 60 * 1000,
  );
}

function normalizeVerificationRounds(
  rounds: number | undefined,
): number {
  if (
    typeof rounds !== 'number' ||
    !Number.isFinite(rounds)
  ) {
    return 2;
  }

  return Math.min(
    Math.max(Math.floor(rounds), 0),
    3,
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

    assertSoftwareAgentModelRoute(model);

    const evidence =
      createAgentEvidence();

    const {
      tools,
    } = createXrogaSoftwareTools({
      contract,
      host,
      events,
      evidence,
    });

    /*
     * IMPORTANT:
     *
     * We deliberately DO NOT give the model complete_task yet.
     *
     * Xroga remains the authority that decides whether a run is
     * actually complete.
     *
     * If evidence is incomplete, we call agent.continue(...)
     * on the SAME conversation instead of terminating and
     * starting another model/project generation.
     */
    const agent = new Agent({
      providerId: model.providerId,
      modelId: model.modelId,

      ...(model.apiKey
        ? {
            apiKey: model.apiKey,
          }
        : {}),

      ...(model.baseUrl
        ? {
            baseUrl: model.baseUrl,
          }
        : {}),

      ...(model.headers
        ? {
            headers: model.headers,
          }
        : {}),

      systemPrompt:
        buildSoftwareAgentPrompt(contract),

      tools,
    });

    const timeoutMs =
      normalizeTimeout(input.timeoutMs);

    const maximumVerificationRounds =
      normalizeVerificationRounds(
        input.verificationRounds,
      );

    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;

      try {
        agent.abort(
          'Xroga software-agent execution deadline reached.',
        );
      } catch {
        /*
         * Abort itself must never turn into another failure.
         */
      }
    }, timeoutMs);

    let outputText = '';
    let totalIterations = 0;
    let usage: unknown;

    try {
      /*
       * Do not forward assistant-text-delta directly into the
       * public Workspace.
       *
       * Public execution evidence comes from Xroga tool events.
       *
       * We can later subscribe here for internal usage/latency
       * telemetry without exposing model reasoning.
       */

      let result =
        await agent.run(contract.goal);

      outputText =
        result.outputText ?? '';

      totalIterations +=
        result.iterations ?? 0;

      usage = result.usage;

      if (timedOut) {
        return {
          status: 'cancelled',
          evidence,
          blockers: [],
          outputText,
          iterations: totalIterations,
          usage,
          failureCode: 'AGENT_TIMEOUT',
          failureMessage:
            'The software-agent execution deadline was reached.',
        };
      }

      if (result.status === 'aborted') {
        return {
          status: 'cancelled',
          evidence,
          blockers: [],
          outputText,
          iterations: totalIterations,
          usage,
          failureCode: 'AGENT_ABORTED',
          failureMessage:
            'The software-agent run was cancelled.',
        };
      }

      if (result.status === 'failed') {
        return {
          status: 'failed',
          evidence,
          blockers: [],
          outputText,
          iterations: totalIterations,
          usage,
          failureCode: 'AGENT_FAILED',
          failureMessage:
            result.error?.message ??
            'The software agent failed.',
        };
      }

      let completion =
        evaluateSoftwareCompletion({
          previewRequirement:
            contract.preview,

          evidence,

          requireSuccessfulChecks: true,

          requireRepositoryPersistence:
            Boolean(contract.repository),
        });

      let verificationRound = 0;

      /*
       * Critical architectural difference from the old Builder:
       *
       * DO NOT restart the model and regenerate the project.
       *
       * Continue the SAME agent conversation with the SAME
       * workspace and the real verification blockers.
       */
      while (
        !completion.complete &&
        verificationRound <
          maximumVerificationRounds &&
        !timedOut
      ) {
        verificationRound += 1;

        result = await agent.continue(
          buildVerificationContinuation(
            completion.blockers,
          ),
        );

        outputText =
          result.outputText ??
          outputText;

        totalIterations +=
          result.iterations ?? 0;

        usage = result.usage ?? usage;

        if (
          result.status === 'failed' ||
          result.status === 'aborted'
        ) {
          break;
        }

        completion =
          evaluateSoftwareCompletion({
            previewRequirement:
              contract.preview,

            evidence,

            requireSuccessfulChecks: true,

            requireRepositoryPersistence:
              Boolean(
                contract.repository,
              ),
          });
      }

      if (timedOut) {
        return {
          status: 'cancelled',
          evidence,
          blockers:
            completion.blockers,
          outputText,
          iterations: totalIterations,
          usage,
          failureCode: 'AGENT_TIMEOUT',
          failureMessage:
            'The software-agent execution deadline was reached.',
        };
      }

      if (!completion.complete) {
        return {
          status: 'incomplete',
          evidence,
          blockers:
            completion.blockers,
          outputText,
          iterations: totalIterations,
          usage,
          failureCode:
            'VERIFICATION_INCOMPLETE',
          failureMessage:
            'The software agent stopped before Xroga verification proved the task complete.',
        };
      }

      return {
        status: 'verified',
        evidence,
        blockers: [],
        outputText,
        iterations: totalIterations,
        usage,
      };
    } catch (error) {
      if (timedOut) {
        return {
          status: 'cancelled',
          evidence,
          blockers: [],
          outputText,
          iterations: totalIterations,
          usage,
          failureCode: 'AGENT_TIMEOUT',
          failureMessage:
            'The software-agent execution deadline was reached.',
        };
      }

      return {
        status: 'failed',
        evidence,
        blockers: [],
        outputText,
        iterations: totalIterations,
        usage,
        failureCode: 'AGENT_FAILED',
        failureMessage:
          error instanceof Error
            ? error.message
            : 'The software agent failed unexpectedly.',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
