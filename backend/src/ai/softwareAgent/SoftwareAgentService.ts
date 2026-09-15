import type {
  SoftwareExecutionContract,
} from './contracts.js';

import type {
  SoftwareRunEventSink,
} from './runEvents.js';

import type {
  SoftwareAgentModelRoute,
} from './agentModelRoute.js';

import type {
  XrogaSoftwareAgentBindings,
} from './xrogaProductionAdapters.js';

import {
  createXrogaProductionDependencies,
} from './xrogaProductionAdapters.js';

import {
  createProductionSoftwareAgentOperations,
} from './productionOperations.js';

import {
  createProductionSoftwareAgentToolHost,
} from './ProductionSoftwareAgentToolHost.js';

import {
  AgentSoftwareExecutor,
  type AgentSoftwareExecutorResult,
} from './AgentSoftwareExecutor.js';

import type {
  SoftwareAgentWorkspace,
} from './SoftwareAgentWorkspace.js';

export interface SoftwareAgentServiceInput {
  contract: SoftwareExecutionContract;

  /**
   * Existing authenticated Xroga infrastructure.
   *
   * Contains no model-visible secrets.
   */
  bindings: XrogaSoftwareAgentBindings;

  /**
   * Xroga-selected coding model route.
   */
  model: SoftwareAgentModelRoute;

  /**
   * Durable event sink.
   */
  events: SoftwareRunEventSink;

  /**
   * Optional authoritative run-start snapshot.
   *
   * The universal builder supplies the same snapshot its planner saw,
   * preventing Agent V2 from re-hydrating a newer/different branch state
   * between planning and implementation.
   */
  initialFiles?: Array<{
    path: string;
    content: string;
  }>;

  /**
   * Caller-owned cancellation boundary.
   */
  signal?: AbortSignal;

  timeoutMs?: number;

  verificationRounds?: number;
}

export interface SoftwareAgentServiceResult
  extends AgentSoftwareExecutorResult {
  /**
   * Final isolated workspace snapshot.
   *
   * Useful for:
   * - Files
   * - Code
   * - Changes
   * - diagnostics
   *
   * This is NOT proof of GitHub persistence.
   */
  workspace: SoftwareAgentWorkspace;
}

/**
 * High-level entry point for the new Xroga software-agent path.
 *
 * One invocation represents one coherent software task.
 */
export class SoftwareAgentService {
  private readonly executor:
    AgentSoftwareExecutor;

  constructor(
    executor =
      new AgentSoftwareExecutor(),
  ) {
    this.executor = executor;
  }

  async execute(
    input: SoftwareAgentServiceInput,
  ): Promise<SoftwareAgentServiceResult> {
    const {
      contract,
      bindings,
      model,
      events,
    } = input;

    /*
     * Convert Xroga's existing infrastructure into the narrow
     * repository/runtime interfaces used by the agent.
     */
    const dependencies =
      createXrogaProductionDependencies(
        bindings,
      );

    /*
     * Create ONE stateful workspace for this entire run.
     *
     * Every read/edit/check/Preview operation must see this
     * same evolving snapshot.
     */
    const {
      operations,
      workspace,
    } =
      await createProductionSoftwareAgentOperations(
        contract,
        dependencies,
        {
          ...(input.initialFiles !==
          undefined
            ? {
                initialFiles:
                  input.initialFiles,
              }
            : {}),
        },
      );

    /*
     * Security boundary between model tools and actual Xroga
     * infrastructure.
     */
    const host =
      createProductionSoftwareAgentToolHost(
        operations,
      );

    /*
     * Cline-style durable tool-using agent loop.
     */
    const result =
      await this.executor.execute({
        contract,
        host,
        events,
        model,

        signal:
          input.signal,

        timeoutMs:
          input.timeoutMs,

        verificationRounds:
          input.verificationRounds,
      });

    return {
      ...result,
      workspace,
    };
  }
}

export async function runSoftwareAgent(
  input: SoftwareAgentServiceInput,
): Promise<SoftwareAgentServiceResult> {
  const service =
    new SoftwareAgentService();

  return service.execute(input);
}
