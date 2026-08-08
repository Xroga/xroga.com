/**
 * Choosing a model from evidence.
 *
 * §22's requirement is architectural rather than algorithmic: adding a provider or a model
 * must need only a `ProviderAdapter` and a `ModelCapabilityProfile`, not edits scattered
 * through the pipeline. So this module has no model names in it. It ranks whatever
 * profiles it is handed, and a new model becomes routable by having a profile — which is
 * asserted by a test that routes a model this file has never heard of.
 *
 * Ranking is deliberately explicit about *why* a model won, because a route that cannot
 * explain itself cannot be debugged when it starts sending Rust work to a model that has
 * never compiled anything.
 *
 * Two rules do most of the work.
 *
 * **Evidence beats assertion.** A score confidence-weighted by provenance means a measured
 * 7 can outrank a hand-written 9. Without that, the priors in `STRENGTHS` would keep
 * winning forever and no amount of observation would change routing — which is the failure
 * §20 and §22 describe between them.
 *
 * **A hard requirement is a filter, not a penalty.** A task needing tool calls cannot use
 * a model without them at any score. Scoring it low instead would let a sufficiently
 * strong model win a route it will fail at the first tool call.
 */

import {
  capabilityScore,
  languageScore,
  needsRevalidation,
  type ModelCapabilityProfile,
} from './modelCapabilityProfile.js';
import type { ModelCapability } from './modelCapabilityRegistry.js';

export interface RoutingRequest {
  readonly capability: ModelCapability;
  readonly language?: string | null;
  readonly framework?: string | null;
  /** Tokens the prompt will need; a model whose window is smaller is excluded. */
  readonly requiredContextTokens?: number;
  readonly needsToolCalls?: boolean;
  readonly needsStructuredOutput?: boolean;
  readonly needsVision?: boolean;
  /** Security-sensitive work prefers measured models and refuses unmeasured ones. */
  readonly securitySensitive?: boolean;
  /** Caller's ceiling. A model above it is excluded rather than ranked down. */
  readonly maxCostUsdPer1MOutput?: number;
  readonly preferLowLatency?: boolean;
}

export interface RoutingCandidate {
  readonly profile: ModelCapabilityProfile;
  readonly available: boolean;
}

export interface RankedModel {
  readonly modelId: string;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly provenance: string;
  readonly confidence: number;
}

export interface RoutingDecision {
  readonly selected: RankedModel | null;
  readonly fallbacks: readonly RankedModel[];
  readonly excluded: ReadonlyArray<{ modelId: string; reason: string }>;
  readonly reason: string;
}

/** A hard requirement a candidate fails, or null when it satisfies all of them. */
function disqualify(
  request: RoutingRequest,
  candidate: RoutingCandidate,
): string | null {
  const { profile } = candidate;

  if (!candidate.available) return 'the provider is unavailable or unconfigured';
  if (request.needsToolCalls && !profile.toolSupport) return 'the task needs tool calls and this model does not support them';
  if (request.needsStructuredOutput && !profile.structuredOutputSupport) return 'the task needs structured output and this model does not support it';
  if (request.needsVision && !profile.visionSupport) return 'the task needs vision and this model does not support it';

  if (request.requiredContextTokens && profile.contextWindow < request.requiredContextTokens) {
    return `the task needs ${request.requiredContextTokens} tokens of context and this model has ${profile.contextWindow}`;
  }
  if (
    typeof request.maxCostUsdPer1MOutput === 'number' &&
    profile.outputUsdPer1M > request.maxCostUsdPer1MOutput
  ) {
    return `output cost ${profile.outputUsdPer1M} exceeds the ceiling of ${request.maxCostUsdPer1MOutput}`;
  }

  // Security work must not be routed on a guess. An unmeasured model may be excellent;
  // the point is that nobody knows, and a security review is the wrong place to find out.
  if (request.securitySensitive) {
    const revalidation = needsRevalidation(profile);
    if (revalidation.needed) return `security-sensitive work needs a measured profile: ${revalidation.reason}`;
  }

  return null;
}

/**
 * Scores one candidate.
 *
 * The capability score is weighted by its confidence, so a measured 7 (confidence ~0.6)
 * and a declared 9 (confidence 0.3) come out at 4.2 against 2.7 — evidence wins, which is
 * the whole point. A language score, when it exists, is blended in at equal weight because
 * "good at coding" and "good at Rust" are genuinely different claims and the narrower one
 * is more relevant when it is available.
 */
function score(request: RoutingRequest, profile: ModelCapabilityProfile): RankedModel | null {
  const capability = capabilityScore(profile, request.capability);
  if (!capability) return null;

  const reasons: string[] = [];
  let total = capability.score * capability.confidence;
  reasons.push(
    `${request.capability}: ${capability.score}/10 (${capability.provenance}, confidence ${capability.confidence.toFixed(2)})`,
  );

  if (request.language) {
    const language = languageScore(profile, request.language);
    if (language) {
      total = (total + language.score * language.confidence) / 2;
      reasons.push(`${request.language}: ${language.score}/10 from ${language.observations} outcomes`);
    } else {
      reasons.push(`${request.language}: no measured evidence, using the general capability score`);
    }
  }

  if (profile.successRate !== null) {
    // A small nudge rather than a term of its own: overall success is real information and
    // a weak signal about any particular task.
    total *= 0.9 + profile.successRate * 0.1;
    reasons.push(`overall success rate ${Math.round(profile.successRate * 100)}%`);
  }

  if (request.preferLowLatency && profile.latencyMsP50 !== null) {
    // Under 5s is treated as fast; the multiplier is bounded so latency can break a tie
    // without overturning a capability gap.
    const factor = profile.latencyMsP50 <= 5000 ? 1.1 : 0.95;
    total *= factor;
    reasons.push(`median latency ${profile.latencyMsP50}ms`);
  }

  return {
    modelId: profile.modelId,
    score: Math.round(total * 100) / 100,
    reasons,
    provenance: capability.provenance,
    confidence: capability.confidence,
  };
}

/**
 * Ranks candidates and picks one.
 *
 * Returns fallbacks rather than a single answer, because §22 requires evidence-based
 * failover: when a provider fails mid-run the next choice must already be justified rather
 * than picked arbitrarily at the moment things are going wrong.
 */
export function routeByCapability(
  request: RoutingRequest,
  candidates: readonly RoutingCandidate[],
): RoutingDecision {
  const excluded: Array<{ modelId: string; reason: string }> = [];
  const ranked: RankedModel[] = [];

  for (const candidate of candidates) {
    const reason = disqualify(request, candidate);
    if (reason) {
      excluded.push({ modelId: candidate.profile.modelId, reason });
      continue;
    }
    const result = score(request, candidate.profile);
    if (!result) {
      excluded.push({
        modelId: candidate.profile.modelId,
        reason: `no score recorded for ${request.capability}`,
      });
      continue;
    }
    ranked.push(result);
  }

  ranked.sort((a, b) => b.score - a.score || a.modelId.localeCompare(b.modelId));

  if (!ranked.length) {
    return {
      selected: null,
      fallbacks: [],
      excluded,
      // Naming every exclusion matters: "no model available" without them is unactionable,
      // and the usual cause is one requirement nobody realised was being applied.
      reason:
        `No model satisfies this request. Tried ${candidates.length}: ` +
        (excluded.map((entry) => `${entry.modelId} (${entry.reason})`).join('; ') || 'none registered'),
    };
  }

  const [selected, ...fallbacks] = ranked;
  return {
    selected,
    fallbacks: fallbacks.slice(0, 3),
    excluded,
    reason: `${selected.modelId} scored ${selected.score} — ${selected.reasons.join('; ')}`,
  };
}

/**
 * The next model after one fails.
 *
 * Takes the failed id rather than an index so a caller can call it repeatedly without
 * tracking position, and so a model that failed cannot be returned again by an off-by-one.
 */
export function failoverFrom(
  decision: RoutingDecision,
  failedModelId: string,
): RankedModel | null {
  const remaining = [decision.selected, ...decision.fallbacks].filter(
    (model): model is RankedModel => Boolean(model) && model!.modelId !== failedModelId,
  );
  return remaining[0] ?? null;
}
