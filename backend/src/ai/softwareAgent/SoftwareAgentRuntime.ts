import { randomUUID } from 'node:crypto';

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
  type SoftwareExecutorKind,
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

export interface SoftwareAgentRuntimeInput<
  TLegacyResult,
> {
  /**
   * Server-owned contract input.
   *
   * Do not construct authorization fields directly from
   * arbitrary frontend/model output.
   */
  contract:
    SoftwareAgentContractInput;

  /**
   * Existing Builder execution.
   *
   * During migration this remains the fallback and the
   * authoritative result in shadow mode.
   */
  runLegacy(
    contract: SoftwareExecutionContract,
  ): Promise<TLegacyResult>;

  /**
   * Required only when Agent V2 is actually selected.
   */
  agentV2?:
    SoftwareAgentRuntimeV2Context;

  /**
   * Internal/testing controls only.
   *
   * Never expose these as normal client-controlled fields.
   */
  forceLegacy?: boolean;

  forceAgentV2?: boolean;
}

export interface SoftwareAgentShadowResult {
  status:
    | 'completed'
    | 'failed'
    | 'not_configured';

  result?: SoftwareAgentServiceResult;

  error?: string;
}

export type SoftwareAgentRuntimeResult<
  TLegacyResult,
> =
  | {
      executor: 'legacy';

      contract:
        SoftwareExecutionContract;

      result:
        TLegacyResult;
    }
  | {
      executor: 'agent_v2';

      contract:
        SoftwareExecutionContract;

      result:
        SoftwareAgentServiceResult;
    }
  | {
      executor: 'agent_v2_shadow';

      contract:
        SoftwareExecutionContract;

      result:
        TLegacyResult;

      shadow:
        SoftwareAgentShadowResult;
    };

function requireAgentV2Context(
  context:
    | SoftwareAgentRuntimeV2Context
    | undefined,
): SoftwareAgentRuntimeV2Context {
  if (!context) {
    throw new Error(
      'SOFTWARE_AGENT_V2_CONTEXT_REQUIRED',
    );
  }

  return context;
}

/**
 * Shadow execution must NEVER persist, merge or deploy.
 *
 * It may:
 * - read repository state
 * - modify its isolated workspace
 * - run sandbox commands
 * - run checks
 * - generate/verify Preview
 *
 * It may NOT mutate the user's repository.
 */
function createShadowContract(
  contract: SoftwareExecutionContract,
): SoftwareExecutionContract {
  return {
    ...contract,

    runId: randomUUID(),

    persistence: 'none',

    deployment: 'forbidden',
  };
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
 * Migration-safe software executor boundary.
 *
 * LEGACY
 *   Existing Builder owns the result.
 *
 * AGENT V2
 *   New software agent owns the result.
 *
 * SHADOW
 *   Existing Builder owns the result.
 *   Agent V2 executes with persistence/deployment disabled.
 */
export async function runSoftwareAgentRuntime<
  TLegacyResult,
>(
  input:
    SoftwareAgentRuntimeInput<
      TLegacyResult
    >,
): Promise<
  SoftwareAgentRuntimeResult<
    TLegacyResult
  >
> {
  const contract =
    createSoftwareExecutionContract(
      input.contract,
    );

  const executor:
    SoftwareExecutorKind =
    selectSoftwareExecutor({
      forceLegacy:
        input.forceLegacy,

      forceAgentV2:
        input.forceAgentV2,
    });

  if (executor === 'legacy') {
    const result =
      await input.runLegacy(
        contract,
      );

    return {
      executor:
        'legacy',

      contract,

      result,
    };
  }

  const agentV2 =
    requireAgentV2Context(
      input.agentV2,
    );

  if (executor === 'agent_v2') {
    const result =
      await runSoftwareAgent(
        softwareAgentServiceInput(
          contract,
          agentV2,
        ),
      );

    return {
      executor:
        'agent_v2',

      contract,

      result,
    };
  }

  /*
   * SHADOW MODE
   *
   * Legacy remains authoritative.
   *
   * Both executions receive the same authoritative initial snapshot.
   * The shadow contract removes persistence/deployment authority.
   */
  const shadowContract =
    createShadowContract(
      contract,
    );

  const [
    legacyOutcome,
    shadowOutcome,
  ] =
    await Promise.allSettled([
      input.runLegacy(
        contract,
      ),

      runSoftwareAgent(
        softwareAgentServiceInput(
          shadowContract,
          agentV2,
        ),
      ),
    ]);

  /*
   * Shadow failures must never replace or invalidate the
   * legacy result.
   *
   * Legacy failure remains a real request failure.
   */
  if (
    legacyOutcome.status ===
    'rejected'
  ) {
    throw legacyOutcome.reason;
  }

  const shadow:
    SoftwareAgentShadowResult =
    shadowOutcome.status ===
    'fulfilled'
      ? {
          status:
            'completed',

          result:
            shadowOutcome.value,
        }
      : {
          status:
            'failed',

          error:
            shadowOutcome.reason instanceof
            Error
              ? shadowOutcome.reason
                  .message
              : String(
                  shadowOutcome.reason,
                ),
        };

  return {
    executor:
      'agent_v2_shadow',

    contract,

    result:
      legacyOutcome.value,

    shadow,
  };
}
