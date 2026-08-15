/**
 * The canonical Black Hole ∞ router.
 *
 * §3 is explicit that this must not become a fourth router sitting beside `router.ts`,
 * `intelligentRouter.ts` and `capabilityRouter.ts`. It is the one production decisions move
 * toward; the existing three become compatibility wrappers over it and are deleted under the
 * conditions §3 lists, not before.
 *
 * ## What this file decides, and what it refuses to decide
 *
 * It decides an *ordered chain* of internal model ids, already filtered so every member is
 * permitted to do the work. It does not open a connection, does not know a base URL and does
 * not hold a credential. Selection and transport stay separate because the transport binding
 * enforced in `openaiCompat.ts` — Kimi to Moonshot, GLM to Zhipu, DeepSeek to OpenRouter,
 * Grok to xAI — must remain the single place a model id becomes a destination.
 *
 * ## Authority is a filter, never a penalty
 *
 * §8's closing line is the load-bearing one: *never cross authority boundaries simply because
 * a provider failed*. That is not a scoring preference, so it is not implemented as one.
 * Candidates that lack the authority a task requires are removed before ranking, which means
 * no amount of provider failure, admin misconfiguration, complexity escalation or FAST-mode
 * cost pressure can surface them — there is no code path in which an excluded model re-enters
 * a chain. §12's requirement that Grok never appear in a coding chain falls out of that
 * structurally, rather than being a rule this file has to remember to apply.
 *
 * ## Public modes
 *
 * §7 permits exactly AUTO, FAST and DEEP, and forbids exposing provider or model selectors.
 * `PublicMode` is therefore the only mode type crossing this boundary; the internal
 * `RoutingMode` used by `routerConfig` is derived from it and never travels outward.
 */

import {
  BLACK_HOLE_MODELS,
  blackHoleAvailability,
  blackHoleModel,
  mayPerform,
  type BlackHoleAuthority,
} from './registry.js';
import type { ComplexityAssessment } from './complexity.js';
import type { BlackHoleTaskClass, TaskAnalysis } from './taskClass.js';
import {
  getRuntimeModelRegistry,
  type RuntimeModelCapability,
} from '../modelCapabilityRegistry.js';
import { historicalModelQuality } from '../routingOutcomes.js';
import type { ModelId } from '../models.js';
import type { RoutingMode } from '../routerConfig.js';

/** §7: the only modes that may be exposed. */
export type PublicMode = 'auto' | 'fast' | 'deep';

/**
 * The route families §8 gives starting chains for.
 *
 * A family is a chain shape, not a task class — several classes share one. Keeping them
 * separate from `BlackHoleTaskClass` means adding a class does not require inventing a chain
 * for it, only choosing which existing shape it belongs to.
 */
export type RouteFamily =
  | 'routine'
  | 'reasoning'
  | 'coding'
  | 'long_horizon'
  | 'vision'
  | 'research';

/**
 * §8's suggested starting chains, transcribed.
 *
 * These are the *preference order*, not the outcome: every chain is filtered by authority,
 * availability and health before use, so the delivered chain is frequently shorter. K2.7
 * heading the coding chain is §6's "normal software implementation" assignment, and it stays
 * at the head even while the model is configuration-gated — the gate is reported honestly at
 * selection time rather than by quietly reordering the policy.
 */
const STARTING_CHAINS: Record<RouteFamily, readonly string[]> = {
  routine: ['deepseek_v4_flash', 'deepseek_v4_pro', 'kimi_k3'],
  reasoning: ['deepseek_v4_pro', 'kimi_k3', 'glm_5_2'],
  coding: ['kimi_k2_7', 'glm_5_2', 'kimi_k3', 'deepseek_v4_pro'],
  long_horizon: ['glm_5_2', 'kimi_k3', 'kimi_k2_7', 'deepseek_v4_pro'],
  // §8: "K3 → only another genuinely supported visual route".
  //
  // The Grok models are exactly that for *reading* an image: they genuinely accept one, and
  // they hold `inspectMedia` authority. They are safe to list because the authority filter
  // removes them the moment the task also needs to write — so "describe this screenshot"
  // reaches a working route, while "implement this mockup" never reaches a research model.
  //
  // Listing them is what stops an image request producing no route at all when K3's vision
  // support has not been verified by an operator.
  vision: ['kimi_k3', 'grok_4_5', 'grok_4_3'],
  research: ['grok_4_5', 'grok_4_3'],
};

const CLASS_TO_FAMILY: Record<BlackHoleTaskClass, RouteFamily> = {
  simple_chat: 'routine',
  rewrite: 'routine',
  summarize: 'routine',
  classification: 'routine',
  extraction: 'routine',
  structured_extraction: 'routine',
  analysis: 'reasoning',
  reasoning: 'reasoning',
  deep_reasoning: 'reasoning',
  research: 'research',
  coding: 'coding',
  repository_coding: 'coding',
  architecture: 'reasoning',
  debugging: 'coding',
  refactoring: 'coding',
  long_horizon_engineering: 'long_horizon',
  vision: 'vision',
  multimodal: 'vision',
  agentic: 'coding',
  tool_workflow: 'coding',
  security_review: 'reasoning',
  deployment_debugging: 'coding',
};

export interface BlackHoleRouteRequest {
  readonly analysis: TaskAnalysis;
  readonly complexity: ComplexityAssessment;
  readonly mode: PublicMode;
  readonly estimatedContextTokens?: number;
  /** Ceiling on tokens for this request, from the caller's compute budget. */
  readonly maximumTaskTokens?: number;
  /** Ceiling on output price. A model above it is excluded, not ranked down. */
  readonly maxCostUsdPer1MOutput?: number;
  /** Models already tried and failed in this run. */
  readonly exclude?: readonly string[];
  readonly framework?: string;
  /** Injected in tests so ranking can be exercised without process-wide provider state. */
  readonly registry?: readonly RuntimeModelCapability[];
  readonly env?: NodeJS.ProcessEnv;
}

export interface RouteExclusion {
  readonly modelId: string;
  readonly reason: string;
}

export interface BlackHoleRoute {
  readonly family: RouteFamily;
  readonly mode: PublicMode;
  /** Ordered, authority-safe, callable. Empty when nothing satisfies the request. */
  readonly chain: readonly string[];
  readonly selected: string | null;
  readonly requiredAuthority: readonly (keyof BlackHoleAuthority)[];
  readonly excluded: readonly RouteExclusion[];
  readonly rationale: string;
}

/** §7's public mode mapped onto the internal mode `routerConfig` already understands. */
export function internalRoutingMode(mode: PublicMode): RoutingMode {
  if (mode === 'fast') return 'cost';
  if (mode === 'deep') return 'intelligence';
  return 'balanced';
}

export function routeFamilyFor(analysis: TaskAnalysis): RouteFamily {
  // The primary class decides, with one exception: a task that must write files is routed as
  // engineering even when its most specific class is research. Research is a *step* in such a
  // request, performed by the research router in its own authority domain; it must not choose
  // the model that then writes the user's files.
  if (analysis.requiredAuthority.includes('writeProjectFiles')) return 'coding';
  return CLASS_TO_FAMILY[analysis.primary];
}

/**
 * Models that can genuinely accept an image.
 *
 * This used to reconcile two disagreeing registries. It no longer has to: `models.ts` owns
 * modality, `modelCapabilityRegistry` reads it, and the Black Hole registry derives it. The
 * function survives as the place that would catch a regression reintroducing a second claim.
 */
function visionCapableCandidates(registry: readonly RuntimeModelCapability[]): Set<string> {
  const capable = new Set<string>();
  for (const model of BLACK_HOLE_MODELS) {
    // Both registries now derive image support from `models.ts`, so this is a single fact
    // read twice rather than two claims that can disagree. The intersection is kept because
    // it costs nothing and it is the assertion that would catch a future divergence.
    const runtime = registry.find((entry) => entry.id === model.id);
    if (runtime?.supports.images) capable.add(model.id);
  }
  return capable;
}

/**
 * Why a candidate cannot serve this request, or null when it can.
 *
 * Every branch returns a reason naming the specific failed requirement. "No model available"
 * with no explanation is the single least actionable message a router can emit, and the cause
 * is almost always one requirement nobody realised was being applied.
 */
function disqualify(
  modelId: string,
  request: BlackHoleRouteRequest,
  registry: readonly RuntimeModelCapability[],
  visionCapable: Set<string>,
): string | null {
  const definition = blackHoleModel(modelId);
  if (!definition) return 'not present in the canonical registry';

  if (request.exclude?.includes(modelId)) return 'already attempted and failed in this run';

  // Authority first — before availability, health or cost. A model that may not do the work
  // should be reported as forbidden rather than as unhealthy, and the ordering guarantees the
  // reason a reader sees is the disqualifying one rather than whichever check ran first.
  for (const authority of request.analysis.requiredAuthority) {
    if (!mayPerform(modelId, authority)) {
      return `not authorized to ${authority}`;
    }
  }

  const availability = blackHoleAvailability(modelId, request.env);
  if (availability !== 'available') return availability;

  const runtime = registry.find((entry) => entry.id === modelId);
  if (!runtime) {
    // Registered and configured, but with no transport entry to reach it. K2.7 is exactly
    // this: `providerCostTiers` gates it on a verified identifier, and even once that is
    // supplied it has no `models.ts` entry carrying a base URL and verified pricing. Saying so
    // is the honest answer; silently treating it as available would produce a chain whose head
    // fails at the first call.
    return 'registered but has no runtime transport entry yet';
  }

  if (!runtime.enabled) return 'disabled by administrator configuration';
  if (!runtime.configured) return 'no credential configured';
  if (runtime.health.status === 'circuit_open') return 'circuit breaker is open';
  if (runtime.configuredMonthlyBudgetUsd <= 0) return 'no monthly budget allocated';

  if (request.analysis.hasImageAttachment && !visionCapable.has(modelId)) {
    return 'the request carries an image and this model has no confirmed vision support';
  }

  const requiredTokens = request.estimatedContextTokens ?? 0;
  if (requiredTokens > runtime.maximumSafeRequestTokens) {
    return `needs ${requiredTokens} context tokens, safe limit is ${runtime.maximumSafeRequestTokens}`;
  }
  if (
    typeof request.maximumTaskTokens === 'number' &&
    requiredTokens > request.maximumTaskTokens
  ) {
    return `needs ${requiredTokens} context tokens, the compute budget allows ${request.maximumTaskTokens}`;
  }
  if (
    typeof request.maxCostUsdPer1MOutput === 'number' &&
    runtime.outputUsdPer1M > request.maxCostUsdPer1MOutput
  ) {
    return `output price ${runtime.outputUsdPer1M} exceeds the ceiling of ${request.maxCostUsdPer1MOutput}`;
  }

  return null;
}

/**
 * Ranks a qualified candidate.
 *
 * The chain order from §8 is the prior; this adjusts it with the runtime facts §6 requires the
 * router to consider. The prior is weighted heavily enough that health and cost reorder a
 * chain rather than rewrite it — a policy chain that any short latency blip can invert is not
 * a policy.
 */
function scoreCandidate(
  modelId: string,
  chainIndex: number,
  request: BlackHoleRouteRequest,
  runtime: RuntimeModelCapability,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  // 20 points per chain position, so the declared order dominates unless evidence is strong.
  let score = 100 - chainIndex * 20;
  reasons.push(`chain position ${chainIndex + 1}`);

  score += runtime.health.validationSuccessRate * 12;
  score -= runtime.health.recentFailureRate * 30;
  if (runtime.health.status === 'healthy') score += 6;
  if (runtime.health.status === 'degraded') score -= 14;
  reasons.push(`health ${runtime.health.status}`);

  // Measured quality outranks the declared chain order when it exists — the same
  // evidence-beats-assertion rule `capabilityRouter` applies to capability scores.
  const measured = historicalModelQuality({
    modelId: modelId as ModelId,
    taskClass: request.analysis.primary,
    framework: request.framework,
  });
  if (measured !== null) {
    score += (measured - 0.5) * 40;
    reasons.push(`measured quality ${Math.round(measured * 100)}% on ${request.analysis.primary}`);
  }

  const blendedCost = runtime.inputUsdPer1M + runtime.outputUsdPer1M;
  if (request.mode === 'fast') {
    // §7: FAST prefers efficient *compatible* intelligence. Compatibility was already settled
    // by `disqualify`, so cost and latency may reorder freely here without risking a model
    // that cannot do the work.
    score -= blendedCost * 2.5;
    score += runtime.typicalLatency === 'fast' ? 14 : runtime.typicalLatency === 'medium' ? 5 : 0;
    reasons.push(`FAST: ${runtime.typicalLatency} latency, blended cost ${blendedCost}`);
  } else if (request.mode === 'deep') {
    score += runtime.strengths.architecture + runtime.strengths.review;
    reasons.push('DEEP: reasoning strength weighted');
  } else {
    score -= blendedCost * 0.6;
  }

  if (request.complexity.level === 'critical' || request.complexity.level === 'high') {
    score += runtime.strengths.repository_analysis * 1.5;
    reasons.push(`complexity ${request.complexity.level}`);
  }

  return { score, reasons };
}

/**
 * The canonical routing entry point.
 *
 * Returns a chain rather than a single model because §8 requires failover to be decided in
 * advance: the moment a provider fails is the worst possible time to start deciding what
 * should happen next, and a chain computed up front is one that was subject to the same
 * authority filter as the head.
 */
export function routeBlackHole(request: BlackHoleRouteRequest): BlackHoleRoute {
  const registry = request.registry ?? getRuntimeModelRegistry();
  const family = routeFamilyFor(request.analysis);
  const visionCapable = visionCapableCandidates(registry);
  const excluded: RouteExclusion[] = [];

  const qualified: Array<{ modelId: string; score: number; reasons: string[] }> = [];

  STARTING_CHAINS[family].forEach((modelId, index) => {
    const reason = disqualify(modelId, request, registry, visionCapable);
    if (reason) {
      excluded.push({ modelId, reason });
      return;
    }
    const runtime = registry.find((entry) => entry.id === modelId)!;
    const { score, reasons } = scoreCandidate(modelId, index, request, runtime);
    qualified.push({ modelId, score, reasons });
  });

  qualified.sort((a, b) => b.score - a.score || a.modelId.localeCompare(b.modelId));

  const chain = qualified.map((entry) => entry.modelId);
  const selected = chain[0] ?? null;

  const rationale = selected
    ? `${family} route in ${request.mode.toUpperCase()} mode: ${selected} — ` +
      `${qualified[0].reasons.join('; ')}. ` +
      `Failover order: ${chain.slice(1).join(' → ') || 'none available'}.`
    : `No model can serve this ${family} request. Considered ${STARTING_CHAINS[family].length}: ` +
      excluded.map((entry) => `${entry.modelId} (${entry.reason})`).join('; ');

  return {
    family,
    mode: request.mode,
    chain,
    selected,
    requiredAuthority: request.analysis.requiredAuthority,
    excluded,
    rationale,
  };
}

/**
 * The next model after one fails.
 *
 * Takes the failed id rather than an index so repeated calls cannot walk off the end or return
 * the failed model again through an off-by-one. Because the chain was authority-filtered when
 * it was built, this cannot cross an authority boundary no matter how many times it is called.
 */
export function nextInChain(route: BlackHoleRoute, failedModelId: string): string | null {
  const position = route.chain.indexOf(failedModelId);
  if (position === -1) return null;
  return route.chain[position + 1] ?? null;
}
