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

import type {
  SoftwareAgentContractInput,
} from './softwareAgentContractFactory.js';

import {
  createSoftwareExecutionContract,
} from './softwareAgentContractFactory.js';

import {
  selectSoftwareExecutor,
} from './softwareExecutorSelector.js';

import {
  runSoftwareAgent,
  type SoftwareAgentServiceResult,
} from './SoftwareAgentService.js';

export interface SoftwareAgentRuntimeV2Context {
  bindings: XrogaSoftwareAgentBindings;

  model: SoftwareAgentModelRoute;

  events: SoftwareRunEventSink;

  /**
   * Authoritative snapshot supplied by the caller.
   *
   * This lets the universal builder hand Agent V2 the exact files its
   * planner saw instead of re-reading repository state mid-run.
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

export interface SoftwareAgentRuntimeInput {
  /**
   * Server-owned contract input.
   *
   * Do not construct authorization fields directly from arbitrary
   * frontend/model output.
   */
  contract: SoftwareAgentContractInput;

  /**
   * Agent V2 production context is mandatory because Agent V2 is now the
   * authoritative implementation engine for software tasks.
   */
  agentV2: SoftwareAgentRuntimeV2Context;
}

export interface SoftwareAgentRuntimeResult {
  executor: 'agent_v2';

  contract: SoftwareExecutionContract;

  result: SoftwareAgentServiceResult;
}

function softwareAgentServiceInput(
  contract: SoftwareExecutionContract,
  context: SoftwareAgentRuntimeV2Context,
) {
  return {
    contract,

    bindings:
      context.bindings,

    model:
      context.model,

    events:
      context.events,

    ...(context.initialFiles !==
    undefined
      ? {
          initialFiles:
            context.initialFiles,
        }
      : {}),

    signal:
      context.signal,

    timeoutMs:
      context.timeoutMs,

    verificationRounds:
      context.verificationRounds,
  };
}

/**
 * Authoritative software implementation runtime.
 *
 * Agent V2 is the only executable path. The previous legacy and shadow
 * branches have been removed from this runtime so neither environment flags
 * nor internal migration controls can route a production software task back
 * to the old builder.
 */
export async function runSoftwareAgentRuntime(
  input: SoftwareAgentRuntimeInput,
): Promise<SoftwareAgentRuntimeResult> {
  const contract =
    createSoftwareExecutionContract(
      input.contract,
    );

  const executor =
    selectSoftwareExecutor();

  const result =
    await runSoftwareAgent(
      softwareAgentServiceInput(
        contract,
        input.agentV2,
      ),
    );

  return {
    executor,
    contract,
    result,
  };
}
