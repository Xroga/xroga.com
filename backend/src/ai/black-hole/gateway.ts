/**
 * The Black Hole ∞ gateway.
 *
 * §1 asks for one canonical internal entry point so application code stops choosing between
 * K3, K2.7, GLM, DeepSeek and Grok by name. §2 gives the stage order this implements:
 *
 *   normalization → task analysis → complexity → context planning → research requirement →
 *   capability + authority requirements → canonical router → provider adapter →
 *   normalized response → telemetry
 *
 * Authorization sits *above* this gateway in §2's flow and is deliberately not performed here.
 * What the gateway does enforce is that authorization already happened: a request with no
 * `userId` is refused rather than executed as nobody, because a gateway that quietly accepts
 * an unattributed request is one that cannot be rate-limited, billed or audited.
 *
 * ## Privacy is structural, not a filter
 *
 * §30 and §31 forbid exposing provider names, model identifiers, `selectedModel`,
 * `fallbackModels`, reasoning traces and chain-of-thought. Rather than assemble a rich result
 * and strip it — which fails open the moment someone adds a field — `BlackHoleResponse` simply
 * has nowhere to put them. Model identity travels to the server-side `onTrace` sink instead,
 * which is not part of the value returned to a caller. Adding a leak therefore requires
 * changing a type, not forgetting a filter.
 *
 * ## Failover cannot widen authority
 *
 * The chain came from `routeBlackHole`, which filtered on authority before ranking. Walking it
 * on provider failure is therefore safe by construction: there is no member to fall through
 * to that was not already permitted to do the work. When the chain is exhausted the gateway
 * fails rather than reaching further, which is §8's closing rule.
 */

import { randomUUID } from 'node:crypto';

import { analyzeTask, type TaskAttachment, type TaskAnalysis } from './taskClass.js';
import { assessBlackHoleComplexity, type ComplexityAssessment } from './complexity.js';
import {
  nextInChain,
  routeBlackHole,
  type BlackHoleRoute,
  type PublicMode,
} from './router.js';
import {
  planContext,
  type ContextFile,
  type ContextPlan,
  type ConversationTurn,
  type MemoryItem,
} from './contextPlan.js';
import {
  chatCompletion,
  estimateTokens,
  type ChatMessage,
  type ChatResult,
} from '../openaiCompat.js';
import { MODELS, type ModelId } from '../models.js';
import type { RuntimeModelCapability } from '../modelCapabilityRegistry.js';

export type { PublicMode } from './router.js';

export interface BlackHoleMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface ExecutionBudget {
  /** Ceiling on assembled context. Defaults to a conservative share of the model window. */
  readonly maxInputTokens?: number;
  readonly maxOutputTokens?: number;
  /** Refuse any model priced above this per 1M output tokens. */
  readonly maxCostUsdPer1MOutput?: number;
}

export interface BlackHoleRequest {
  readonly requestId?: string;
  readonly userId: string;
  readonly conversationId?: string | null;
  readonly projectId?: string | null;

  readonly messages: readonly BlackHoleMessage[];
  readonly attachments?: readonly TaskAttachment[];

  readonly mode?: PublicMode;

  readonly tools?: readonly string[];
  readonly responseSchema?: unknown;

  readonly executionBudget?: ExecutionBudget;
  readonly signal?: AbortSignal;

  // -- context inputs, consumed by the §9 planner --------------------------------------
  readonly projectState?: string | null;
  readonly files?: readonly ContextFile[];
  readonly memory?: readonly MemoryItem[];
  readonly previousFailures?: readonly string[];
  readonly historySummary?: string | null;

  /** Set when the caller already knows this request will change a repository. */
  readonly repositoryMutationRequested?: boolean;
  readonly framework?: string;

  /**
   * Server-side telemetry sink. Receives the model identity the response deliberately omits.
   *
   * Never wire this to anything that reaches a user; it exists so §38's usage, cost and
   * quality telemetry can be recorded without the response carrying provider identity.
   */
  readonly onTrace?: (trace: BlackHoleTrace) => void;
}

/** Server-side only. Everything §30/§31 forbid a caller from seeing lives here. */
export interface BlackHoleTrace {
  readonly requestId: string;
  readonly userId: string;
  readonly family: BlackHoleRoute['family'];
  readonly chain: readonly string[];
  readonly selectedModel: string | null;
  readonly attemptedModels: readonly string[];
  readonly rationale: string;
  readonly excluded: BlackHoleRoute['excluded'];
  readonly taskClasses: readonly string[];
  readonly complexity: ComplexityAssessment;
  readonly context: { usedTokens: number; budgetTokens: number; dropped: ContextPlan['dropped'] };
  readonly usage: { inputTokens: number; outputTokens: number; costUsd: number };
  readonly latencyMs: number;
}

/**
 * What a caller may see.
 *
 * There is intentionally no model id, no provider, no fallback list and no reasoning trace.
 * `intelligence` describes the shape of the work done, which is what a user interface actually
 * needs, without naming who did it.
 */
export interface BlackHoleResponse {
  readonly requestId: string;
  readonly text: string;
  readonly mode: PublicMode;
  readonly finishReason: string | null;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  };
  readonly intelligence: {
    readonly taskClass: string;
    readonly complexity: 'low' | 'medium' | 'high' | 'critical';
    readonly researchRequired: boolean;
    /** True when the first choice failed and the request was served by a later one. */
    readonly degraded: boolean;
  };
  readonly context: {
    readonly usedTokens: number;
    readonly budgetTokens: number;
    readonly droppedSegments: number;
  };
}

export class BlackHoleRoutingError extends Error {
  readonly code = 'BLACK_HOLE_NO_ROUTE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'BlackHoleRoutingError';
  }
}

export class BlackHoleExhaustedError extends Error {
  readonly code = 'BLACK_HOLE_CHAIN_EXHAUSTED' as const;
  constructor(message: string, readonly lastError: unknown) {
    super(message);
    this.name = 'BlackHoleExhaustedError';
  }
}

const DEFAULT_MAX_OUTPUT_TOKENS = 4_096;

/**
 * The provider adapter the gateway drives.
 *
 * Injected rather than imported directly so the gateway's own logic — authority-safe failover,
 * cancellation, privacy of the response shape — can be tested without credentials or network.
 * A test-only mutable binding would work too, but it leaves production code able to be
 * reconfigured at runtime by anything that can import the module, which is a worse trade for
 * the same benefit.
 */
export type ProviderComplete = (
  modelId: ModelId,
  messages: ChatMessage[],
  opts: { maxTokens?: number; signal?: AbortSignal; json?: boolean },
) => Promise<ChatResult>;

export interface GatewayDependencies {
  readonly complete: ProviderComplete;
  /**
   * Runtime model registry override.
   *
   * Sits in the dependencies rather than on `BlackHoleRequest` on purpose: which models exist
   * and how healthy they are is infrastructure, not something a caller asking for intelligence
   * should be able to state. Exposing it on the request would let any caller widen its own
   * candidate set, which is the authority boundary this whole subsystem exists to hold.
   */
  readonly registry?: readonly RuntimeModelCapability[];
  readonly env?: NodeJS.ProcessEnv;
}

/** The prompt text used for analysis: the newest user turn, which is what was actually asked. */
function newestUserText(messages: readonly BlackHoleMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return messages[index].content;
  }
  return '';
}

function toConversation(messages: readonly BlackHoleMessage[]): ConversationTurn[] {
  return messages
    .filter((message): message is BlackHoleMessage & { role: 'user' | 'assistant' } =>
      message.role !== 'system')
    .map((message) => ({ role: message.role, content: message.content }));
}

function costUsd(modelId: string, inputTokens: number, outputTokens: number): number {
  const def = MODELS[modelId as ModelId];
  if (!def) return 0;
  return (
    (inputTokens / 1_000_000) * def.inputUsdPer1M +
    (outputTokens / 1_000_000) * def.outputUsdPer1M
  );
}

/**
 * The canonical intelligence entry point.
 *
 * Normal callers ask this for intelligence and never name a model. Everything §2 lists happens
 * in order, and each stage's output is the next one's input rather than a shared mutable bag —
 * which is what makes the whole flow testable a stage at a time.
 */
export async function generateWith(
  deps: GatewayDependencies,
  request: BlackHoleRequest,
): Promise<BlackHoleResponse> {
  const startedAt = Date.now();
  const requestId = request.requestId ?? randomUUID();

  // -- Normalization ---------------------------------------------------------------------

  if (!request.userId?.trim()) {
    throw new BlackHoleRoutingError(
      'A Black Hole request must carry the authorized user. Authorization happens above the ' +
        'gateway, and an unattributed request cannot be rate-limited, billed or audited.',
    );
  }
  if (!request.messages?.length) {
    throw new BlackHoleRoutingError('A Black Hole request must carry at least one message.');
  }

  const mode: PublicMode = request.mode ?? 'auto';
  const prompt = newestUserText(request.messages);
  const systemMessages = request.messages.filter((message) => message.role === 'system');

  // -- Task analysis ---------------------------------------------------------------------

  const analysis: TaskAnalysis = analyzeTask({
    prompt,
    attachments: request.attachments,
    repositoryMutationRequested: request.repositoryMutationRequested,
    projectId: request.projectId,
    toolsOffered: request.tools,
    responseSchemaRequested: request.responseSchema !== undefined,
    previousFailures: request.previousFailures?.length,
  });

  // -- Complexity ------------------------------------------------------------------------

  const complexity = assessBlackHoleComplexity({
    prompt,
    analysis,
    repositoryFileCount: request.files?.length,
    affectedFileCount: request.files?.length,
    estimatedContextTokens: request.files?.reduce(
      (total, file) => total + estimateTokens(file.content),
      0,
    ),
    toolCount: request.tools?.length,
    previousFailures: request.previousFailures?.length,
    requestedDepth: mode,
  });

  // -- Context planning ------------------------------------------------------------------

  const inputBudget = request.executionBudget?.maxInputTokens ?? 32_000;
  const contextPlan = planContext({
    request: prompt,
    budgetTokens: inputBudget,
    projectState: request.projectState,
    files: request.files,
    conversation: toConversation(request.messages.slice(0, -1)),
    memory: request.memory,
    previousFailures: request.previousFailures,
    historySummary: request.historySummary,
  });

  // -- Routing (capability + authority already derived by the analysis) --------------------

  const route = routeBlackHole({
    analysis,
    complexity,
    mode,
    estimatedContextTokens: contextPlan.usedTokens,
    maximumTaskTokens: request.executionBudget?.maxInputTokens,
    maxCostUsdPer1MOutput: request.executionBudget?.maxCostUsdPer1MOutput,
    framework: request.framework,
    registry: deps.registry,
    env: deps.env,
  });

  if (!route.selected) {
    throw new BlackHoleRoutingError(route.rationale);
  }

  // -- Provider adapter, walking the pre-authorized chain ---------------------------------

  const messages: ChatMessage[] = [
    ...systemMessages.map((message) => ({ role: 'system' as const, content: message.content })),
    ...(contextPlan.contextText
      ? [{ role: 'system' as const, content: contextPlan.contextText }]
      : []),
    { role: 'user' as const, content: prompt },
  ];

  const attempted: string[] = [];
  let current: string | null = route.selected;
  let result: ChatResult | null = null;
  let lastError: unknown = null;

  while (current) {
    attempted.push(current);
    try {
      result = await deps.complete(current as ModelId, messages, {
        maxTokens: request.executionBudget?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        signal: request.signal,
        json: request.responseSchema !== undefined,
      });
      break;
    } catch (error) {
      // An aborted request is the caller's decision, not a provider failure. Walking the chain
      // after a cancellation would spend budget on work already known to be unwanted.
      if (request.signal?.aborted) throw error;
      lastError = error;
      current = nextInChain(route, current);
    }
  }

  if (!result) {
    throw new BlackHoleExhaustedError(
      `Every model authorized for this ${route.family} request failed. ` +
        `Attempted ${attempted.length}. The chain was not widened, because doing so would ` +
        'cross an authority boundary this request is not permitted to cross.',
      lastError,
    );
  }

  const trace: BlackHoleTrace = {
    requestId,
    userId: request.userId,
    family: route.family,
    chain: route.chain,
    selectedModel: result.modelId,
    attemptedModels: attempted,
    rationale: route.rationale,
    excluded: route.excluded,
    taskClasses: analysis.classes,
    complexity,
    context: {
      usedTokens: contextPlan.usedTokens,
      budgetTokens: contextPlan.budgetTokens,
      dropped: contextPlan.dropped,
    },
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: costUsd(result.modelId, result.inputTokens, result.outputTokens),
    },
    latencyMs: Date.now() - startedAt,
  };
  request.onTrace?.(trace);

  return {
    requestId,
    text: result.text,
    mode,
    finishReason: result.finishReason ?? null,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
    },
    intelligence: {
      taskClass: analysis.primary,
      complexity: complexity.level,
      researchRequired: analysis.requiresResearch,
      degraded: attempted.length > 1,
    },
    context: {
      usedTokens: contextPlan.usedTokens,
      budgetTokens: contextPlan.budgetTokens,
      droppedSegments: contextPlan.dropped.length,
    },
  };
}

/** The production gateway, bound to the real provider adapter. §1's `blackHole.generate({…})`. */
export function generate(request: BlackHoleRequest): Promise<BlackHoleResponse> {
  return generateWith({ complete: chatCompletion }, request);
}

export const blackHole = { generate };
