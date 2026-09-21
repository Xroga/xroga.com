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

import type {
  SoftwareAgentCheckpointStore,
} from './softwareAgentCheckpoint.js';

export interface SoftwareAgentRuntimeV2Context {
  bindings:
    XrogaSoftwareAgentBindings;

  model:
    SoftwareAgentModelRoute;

  events:
    SoftwareRunEventSink;

  initialFiles?: Array<{
    path: string;
    content: string;
  }>;

  workingFiles?: Array<{
  path: string;
  content: string;
}>;

forceContinueFromCheckpoint?:
  boolean;
  
  signal?:
    AbortSignal;

  /**
   * Durable Agent V2 workspace/evidence checkpoints.
   */
  checkpointStore?:
    SoftwareAgentCheckpointStore;
}

export interface SoftwareAgentRuntimeInput {
  contract:
    SoftwareAgentContractInput;

  agentV2:
    SoftwareAgentRuntimeV2Context;
}

export interface SoftwareAgentRuntimeResult {
  executor:
    'agent_v2';

  contract:
    SoftwareExecutionContract;

  result:
    SoftwareAgentServiceResult;
}

function softwareAgentServiceInput(
  contract:
    SoftwareExecutionContract,

  context:
    SoftwareAgentRuntimeV2Context,
) {
  return {
    contract,

    bindings:
      context.bindings,

    model:
      context.model,

    events:
      context.events,

    ...(
      context.initialFiles !==
      undefined
        ? {
            initialFiles:
              context.initialFiles,
          }
        : {}
    ),

    ...(
  context.workingFiles !==
  undefined
    ? {
        workingFiles:
          context.workingFiles,
      }
    : {}
),

...(
  context
    .forceContinueFromCheckpoint !==
  undefined
    ? {
        forceContinueFromCheckpoint:
          context
            .forceContinueFromCheckpoint,
      }
    : {}
),
    
    signal:
      context.signal,

    checkpointStore:
      context.checkpointStore,
  };
}

export async function runSoftwareAgentRuntime(
  input:
    SoftwareAgentRuntimeInput,
): Promise<
  SoftwareAgentRuntimeResult
> {
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
