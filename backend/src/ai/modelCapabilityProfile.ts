/**
 * What a model is actually good at, as opposed to what someone typed.
 *
 * `modelCapabilityRegistry.ts` carries a `STRENGTHS` table: `kimi_k3` scores 10 for
 * architecture, `deepseek_v4_flash` scores 4. Nobody measured those numbers. They were
 * written down once, from model cards and impressions, and they have been the basis of
 * routing ever since — which §20 rules out directly: capability claims must not come from
 * marketing descriptions.
 *
 * The problem is not that the numbers are wrong. It is that nothing can tell whether they
 * are. A hand-written score and a score derived from two hundred completed tasks are
 * indistinguishable once both are integers in a table, so a wrong one never gets corrected
 * and a right one can never be trusted.
 *
 * So every score here carries its provenance and an expiry.
 *
 * A `declared` score is a *prior*: usable, clearly labelled as unmeasured, and it expires.
 * When it does, the profile reports `needsRevalidation` rather than silently continuing to
 * be trusted — the same reasoning Command 1 applied to sandbox probes, where the failure
 * was a value that looked authoritative because nothing recorded where it came from.
 *
 * An `observed` score is computed from outcomes this system recorded: builds that
 * succeeded, tests that passed, patches that applied, repairs that worked. It outranks a
 * declared score as soon as there is enough of it, and `MIN_OBSERVATIONS` is what "enough"
 * means — below that the sample is noise and the prior is the better estimate.
 */

import type { ModelCapability } from './modelCapabilityRegistry.js';
import type { ModelId } from './models.js';

export const MODEL_CAPABILITY_PROFILE_SCHEMA_VERSION = '1.0.0' as const;

/** Where a score came from, which is what decides whether to believe it. */
export type ScoreProvenance = 'declared' | 'observed' | 'provider_metadata';

/**
 * How long a declared score stays usable.
 *
 * Thirty days because model endpoints change under a fixed name — a provider ships a new
 * checkpoint behind the same id and a score written against the old one is now describing
 * something that no longer exists. Expiry does not delete the score; it stops it being
 * quoted as though it were current.
 */
export const DECLARED_SCORE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Observed scores expire more slowly: they were measured, and measurements age better. */
export const OBSERVED_SCORE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Observations needed before evidence outranks the prior.
 *
 * Five, because one success is indistinguishable from luck and routing that swings on a
 * single outcome oscillates. Low enough that evidence starts mattering quickly.
 */
export const MIN_OBSERVATIONS = 5;

export interface CapabilityScore {
  readonly capability: ModelCapability;
  /** 0–10, comparable with the legacy STRENGTHS table. */
  readonly score: number;
  readonly provenance: ScoreProvenance;
  readonly observations: number;
  readonly recordedAt: string;
  /** What produced this score, in terms a person can check. */
  readonly evidence: readonly string[];
}

/** A capability score narrowed to one language, since models are not uniform across them. */
export interface LanguageScore {
  readonly language: string;
  readonly score: number;
  readonly provenance: ScoreProvenance;
  readonly observations: number;
  readonly recordedAt: string;
}

export interface ModelCapabilityProfile {
  readonly schemaVersion: string;
  readonly modelId: ModelId;
  readonly providerId: string;
  /** The provider's own version string, when it exposes one. */
  readonly modelVersion: string | null;
  readonly contextWindow: number;
  readonly maximumOutput: number;
  readonly toolSupport: boolean;
  readonly structuredOutputSupport: boolean;
  readonly visionSupport: boolean;
  readonly streamingSupport: boolean;
  readonly capabilityScores: readonly CapabilityScore[];
  readonly languageScores: readonly LanguageScore[];
  readonly latencyMsP50: number | null;
  readonly successRate: number | null;
  readonly inputUsdPer1M: number;
  readonly outputUsdPer1M: number;
  readonly lastVerifiedAt: string;
  readonly expiresAt: string;
}

/** One completed piece of work, which is the only thing that produces an observed score. */
export interface TaskOutcome {
  readonly modelId: ModelId;
  readonly capability: ModelCapability;
  readonly language?: string;
  readonly succeeded: boolean;
  /** What settled it. A model asserting success is not an outcome. */
  readonly evidence: 'build_passed' | 'tests_passed' | 'patch_applied' | 'review_accepted' | 'repair_succeeded' | 'build_failed' | 'tests_failed' | 'patch_rejected' | 'repair_failed';
  readonly latencyMs?: number;
  readonly at?: Date;
}

/**
 * The running tally behind an observed score.
 *
 * Kept separate from the profile because a profile is a snapshot that gets persisted and
 * read, while this accumulates. Merging them would mean rewriting the whole profile on
 * every task.
 */
export interface ObservationLedger {
  readonly byCapability: Map<string, { successes: number; total: number; latencies: number[] }>;
  readonly byLanguage: Map<string, { successes: number; total: number }>;
}

export function createObservationLedger(): ObservationLedger {
  return { byCapability: new Map(), byLanguage: new Map() };
}

const key = (modelId: string, dimension: string) => `${modelId}::${dimension}`;

/**
 * Records one outcome.
 *
 * Only these nine evidence kinds are accepted, and every one of them is something that
 * either happened or did not. §49's rule — a model message cannot complete a task — has a
 * direct consequence here: if a model's own claim could feed this ledger, a model that
 * says "done" often enough would route itself more work.
 */
export function recordOutcome(ledger: ObservationLedger, outcome: TaskOutcome): ObservationLedger {
  const capabilityKey = key(outcome.modelId, outcome.capability);
  const capability = ledger.byCapability.get(capabilityKey) ?? { successes: 0, total: 0, latencies: [] };
  capability.total += 1;
  if (outcome.succeeded) capability.successes += 1;
  if (typeof outcome.latencyMs === 'number') capability.latencies.push(outcome.latencyMs);
  ledger.byCapability.set(capabilityKey, capability);

  if (outcome.language) {
    const languageKey = key(outcome.modelId, outcome.language);
    const language = ledger.byLanguage.get(languageKey) ?? { successes: 0, total: 0 };
    language.total += 1;
    if (outcome.succeeded) language.successes += 1;
    ledger.byLanguage.set(languageKey, language);
  }
  return ledger;
}

/** Success rate mapped onto the 0–10 scale the rest of the system speaks. */
function rateToScore(successes: number, total: number): number {
  if (!total) return 0;
  return Math.round((successes / total) * 10 * 10) / 10;
}

export function medianLatency(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * Builds a profile from declared priors plus whatever has been observed.
 *
 * A capability crosses from `declared` to `observed` at `MIN_OBSERVATIONS`. Below it the
 * prior is kept and the observation count is still reported, so a profile shows how close
 * a dimension is to having real evidence rather than hiding a thin sample behind a number.
 */
export function buildProfile(input: {
  modelId: ModelId;
  providerId: string;
  modelVersion?: string | null;
  contextWindow: number;
  maximumOutput: number;
  toolSupport: boolean;
  structuredOutputSupport: boolean;
  visionSupport: boolean;
  streamingSupport: boolean;
  declaredScores: Readonly<Record<string, number>>;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  ledger?: ObservationLedger;
  now?: Date;
}): ModelCapabilityProfile {
  const now = input.now ?? new Date();
  const ledger = input.ledger ?? createObservationLedger();
  const capabilityScores: CapabilityScore[] = [];
  let allLatencies: number[] = [];
  let totalSuccesses = 0;
  let totalObservations = 0;

  for (const [capability, declared] of Object.entries(input.declaredScores)) {
    const observed = ledger.byCapability.get(key(input.modelId, capability));
    const observations = observed?.total ?? 0;
    if (observed) {
      allLatencies = allLatencies.concat(observed.latencies);
      totalSuccesses += observed.successes;
      totalObservations += observed.total;
    }

    const useObserved = observations >= MIN_OBSERVATIONS;
    capabilityScores.push({
      capability: capability as ModelCapability,
      score: useObserved ? rateToScore(observed!.successes, observed!.total) : declared,
      provenance: useObserved ? 'observed' : 'declared',
      observations,
      recordedAt: now.toISOString(),
      evidence: useObserved
        ? [`${observed!.successes}/${observed!.total} recorded outcomes succeeded`]
        : [
            observations
              ? `hand-written prior; ${observations} outcome(s) recorded, ${MIN_OBSERVATIONS} needed before evidence replaces it`
              : 'hand-written prior, never measured',
          ],
    });
  }

  const languageScores: LanguageScore[] = [];
  for (const [ledgerKey, value] of ledger.byLanguage) {
    const [modelId, language] = ledgerKey.split('::');
    if (modelId !== input.modelId) continue;
    languageScores.push({
      language,
      score: rateToScore(value.successes, value.total),
      // Language scores have no prior at all. Nobody wrote down how good each model is at
      // Rust, so an unmeasured language is absent rather than guessed — and a router
      // treating absence as "unknown" is correct where treating it as a number is not.
      provenance: value.total >= MIN_OBSERVATIONS ? 'observed' : 'declared',
      observations: value.total,
      recordedAt: now.toISOString(),
    });
  }

  // The profile expires on its weakest evidence. One measured dimension does not make a
  // profile fresh when everything else in it is a year-old guess.
  const anyObserved = capabilityScores.some((score) => score.provenance === 'observed');
  const ttl = anyObserved && capabilityScores.every((score) => score.provenance === 'observed')
    ? OBSERVED_SCORE_TTL_MS
    : DECLARED_SCORE_TTL_MS;

  return {
    schemaVersion: MODEL_CAPABILITY_PROFILE_SCHEMA_VERSION,
    modelId: input.modelId,
    providerId: input.providerId,
    modelVersion: input.modelVersion ?? null,
    contextWindow: input.contextWindow,
    maximumOutput: input.maximumOutput,
    toolSupport: input.toolSupport,
    structuredOutputSupport: input.structuredOutputSupport,
    visionSupport: input.visionSupport,
    streamingSupport: input.streamingSupport,
    capabilityScores,
    languageScores: languageScores.sort((a, b) => a.language.localeCompare(b.language)),
    latencyMsP50: medianLatency(allLatencies),
    successRate: totalObservations ? Math.round((totalSuccesses / totalObservations) * 100) / 100 : null,
    inputUsdPer1M: input.inputUsdPer1M,
    outputUsdPer1M: input.outputUsdPer1M,
    lastVerifiedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
  };
}

export function isExpired(profile: ModelCapabilityProfile, now: Date = new Date()): boolean {
  return new Date(profile.expiresAt).getTime() <= now.getTime();
}

/**
 * Whether a profile should be re-measured before being used to route.
 *
 * Expiry is one reason. The other is a profile with no observed dimension at all, which is
 * the state every profile starts in and the state §20 is written against — it is usable,
 * and it should not go on being usable indefinitely without anybody checking.
 */
export function needsRevalidation(profile: ModelCapabilityProfile, now: Date = new Date()): {
  needed: boolean;
  reason: string | null;
} {
  if (isExpired(profile, now)) {
    return { needed: true, reason: `profile expired at ${profile.expiresAt} and must be re-measured before it is trusted` };
  }
  if (!profile.capabilityScores.some((score) => score.provenance === 'observed')) {
    return { needed: true, reason: 'every score is a hand-written prior; no outcome has ever been recorded for this model' };
  }
  return { needed: false, reason: null };
}

/**
 * A model's score for a capability, with how much to trust it.
 *
 * Returns confidence alongside the score because a router needs both. A 9 from a prior and
 * a 9 from two hundred tasks should not break a tie the same way, and collapsing them to a
 * single number is what made the original table impossible to correct.
 */
export function capabilityScore(
  profile: ModelCapabilityProfile,
  capability: ModelCapability,
): { score: number; confidence: number; provenance: ScoreProvenance } | null {
  const entry = profile.capabilityScores.find((score) => score.capability === capability);
  if (!entry) return null;
  const confidence =
    entry.provenance === 'observed'
      ? Math.min(1, 0.5 + entry.observations / 100)
      : // A declared score is a starting point, not a measurement, and its confidence says so.
        0.3;
  return { score: entry.score, confidence, provenance: entry.provenance };
}

/**
 * A model's score for a language, or null when nothing is known.
 *
 * Null rather than a default. A router that receives 0 will avoid the model, and one that
 * receives 5 will treat a guess as a measurement; only null lets it say "no evidence
 * either way" and fall back to the general capability score.
 */
export function languageScore(
  profile: ModelCapabilityProfile,
  language: string,
): { score: number; confidence: number; observations: number } | null {
  const entry = profile.languageScores.find((score) => score.language === language);
  if (!entry || entry.observations < MIN_OBSERVATIONS) return null;
  return {
    score: entry.score,
    confidence: Math.min(1, 0.5 + entry.observations / 100),
    observations: entry.observations,
  };
}

/** Reads a persisted profile forward, so stored profiles survive a schema change. */
export function migrateProfile(input: Record<string, unknown>): ModelCapabilityProfile | null {
  const raw = input as Partial<ModelCapabilityProfile>;
  if (!raw.modelId || !raw.providerId) return null;
  const now = new Date().toISOString();
  return {
    schemaVersion: MODEL_CAPABILITY_PROFILE_SCHEMA_VERSION,
    modelId: raw.modelId,
    providerId: raw.providerId,
    modelVersion: raw.modelVersion ?? null,
    contextWindow: raw.contextWindow ?? 0,
    maximumOutput: raw.maximumOutput ?? 0,
    toolSupport: Boolean(raw.toolSupport),
    structuredOutputSupport: Boolean(raw.structuredOutputSupport),
    visionSupport: Boolean(raw.visionSupport),
    streamingSupport: Boolean(raw.streamingSupport),
    capabilityScores: Array.isArray(raw.capabilityScores) ? raw.capabilityScores : [],
    languageScores: Array.isArray(raw.languageScores) ? raw.languageScores : [],
    latencyMsP50: raw.latencyMsP50 ?? null,
    successRate: raw.successRate ?? null,
    inputUsdPer1M: raw.inputUsdPer1M ?? 0,
    outputUsdPer1M: raw.outputUsdPer1M ?? 0,
    lastVerifiedAt: raw.lastVerifiedAt ?? now,
    // A profile with no expiry is treated as already expired rather than as immortal. The
    // failure mode of the wrong choice here is a stale profile trusted forever.
    expiresAt: raw.expiresAt ?? now,
  };
}
