/**
 * Where production actually enters Black Hole ∞.
 *
 * `pipeline.ts` owns the product lifecycle: progress events, persistence, validation, project
 * semantics, shipping. It should not also own model selection. This module is the seam between
 * the two, and it exists as its own file so the pipeline's diff stays small and reviewable —
 * a migration that rewrites the file it is migrating cannot be reviewed for regressions.
 *
 * ## Every function here is stage-gated and falls back
 *
 * Each entry point takes the cutover plan and returns the legacy answer when Black Hole is not
 * enabled for this request. That is what makes the migration reversible in production by an
 * environment variable rather than a deploy, and it is why none of these functions throw when
 * Black Hole cannot serve: an unroutable request falls back rather than failing a build that
 * the previous path would have completed.
 *
 * ## Shadow mode records without affecting the answer
 *
 * In `shadow`, the Black Hole decision is computed and compared against the legacy one, the
 * comparison is handed to telemetry, and the *legacy* answer is returned. That is the only way
 * to learn what the new router would have done on real traffic before anyone depends on it.
 */

import { readCutoverPlan, servesBlackHoleFor, type CutoverPlan } from './cutover.js';
import { analyzeTask } from './taskClass.js';
import { assessBlackHoleComplexity } from './complexity.js';
import { routeBlackHole, type PublicMode } from './router.js';
import { classifyFailure, routeRepair, escalateScope, type RepairFailureKind } from './repairRouting.js';
import { runWebIntelligence } from './webIntelligence.js';
import type { ModelId } from '../models.js';

// ---------------------------------------------------------------------------
// Shared decision recording
// ---------------------------------------------------------------------------

export interface ShadowComparison {
  readonly surface: 'build' | 'repair' | 'research';
  readonly legacy: string | null;
  readonly blackHole: string | null;
  readonly agreed: boolean;
  readonly reason: string;
}

/** Telemetry sink. Server-side only — these values name models. */
export type ShadowSink = (comparison: ShadowComparison) => void;

let shadowSink: ShadowSink = () => {};

/** Wired by the server at startup. Kept module-local so callers cannot read the decisions. */
export function setShadowSink(sink: ShadowSink): void {
  shadowSink = sink;
}

function record(comparison: ShadowComparison): void {
  try {
    shadowSink(comparison);
  } catch {
    // Telemetry must never fail a build. A sink that throws is a bug in the sink.
  }
}

export interface StageContext {
  readonly userId: string;
  readonly conversationId?: string | null;
  readonly projectId?: string | null;
  readonly plan?: CutoverPlan;
  readonly env?: NodeJS.ProcessEnv;
}

/** Whether Black Hole's answer should be *used* for this request, versus merely computed. */
function servesFor(context: StageContext, plan: CutoverPlan): boolean {
  const key = context.conversationId || context.projectId || context.userId;
  return servesBlackHoleFor(plan, key);
}

// ---------------------------------------------------------------------------
// Build model selection
// ---------------------------------------------------------------------------

export interface BuildSelectionInput extends StageContext {
  readonly prompt: string;
  readonly legacyModel: ModelId;
  readonly mode?: PublicMode;
  readonly repositoryFileCount?: number;
  readonly affectedFileCount?: number;
  readonly previousFailures?: number;
  readonly estimatedContextTokens?: number;
  readonly framework?: string;
}

export interface BuildSelection {
  readonly modelId: ModelId;
  readonly fallbacks: readonly ModelId[];
  readonly source: 'black_hole' | 'legacy';
  readonly reason: string;
}

/**
 * Chooses the model that will implement a build.
 *
 * The legacy answer comes from `routePrompt`, a keyword table with hard-coded model names. The
 * Black Hole answer comes from the canonical router, which applies authority, availability,
 * health, cost and complexity. Both are computed whenever Black Hole runs, so shadow mode has
 * something to compare; only one is returned.
 */
export function selectBuildModel(input: BuildSelectionInput): BuildSelection {
  const plan = input.plan ?? readCutoverPlan(input.env);
  const legacy: BuildSelection = {
    modelId: input.legacyModel,
    fallbacks: [],
    source: 'legacy',
    reason: 'the previous keyword route selected this model',
  };

  if (!plan.runsBlackHole) return legacy;

  const analysis = analyzeTask({
    prompt: input.prompt,
    projectId: input.projectId ?? null,
    repositoryMutationRequested: true,
    previousFailures: input.previousFailures,
  });
  const complexity = assessBlackHoleComplexity({
    prompt: input.prompt,
    analysis,
    repositoryFileCount: input.repositoryFileCount,
    affectedFileCount: input.affectedFileCount,
    previousFailures: input.previousFailures,
    estimatedContextTokens: input.estimatedContextTokens,
    requestedDepth: input.mode ?? 'auto',
  });
  const route = routeBlackHole({
    analysis,
    complexity,
    mode: input.mode ?? 'auto',
    estimatedContextTokens: input.estimatedContextTokens,
    framework: input.framework,
    env: input.env,
  });

  record({
    surface: 'build',
    legacy: input.legacyModel,
    blackHole: route.selected,
    agreed: route.selected === input.legacyModel,
    reason: route.rationale,
  });

  // An unroutable request falls back rather than failing a build the previous path would have
  // completed. Black Hole gets to decide only when it has an answer.
  if (!route.selected) return legacy;
  if (!plan.servesBlackHole || !servesFor(input, plan)) return legacy;

  return {
    modelId: route.selected as ModelId,
    fallbacks: route.chain.slice(1) as ModelId[],
    source: 'black_hole',
    reason: route.rationale,
  };
}

// ---------------------------------------------------------------------------
// Repair model selection
// ---------------------------------------------------------------------------

export interface RepairSelectionInput extends StageContext {
  readonly failureMessage: string;
  readonly legacyModel: ModelId;
  readonly attempt: number;
  readonly exclude?: readonly ModelId[];
  readonly prompt?: string;
}

export interface RepairSelection {
  readonly modelId: ModelId;
  readonly failure: RepairFailureKind;
  readonly scope: string;
  readonly source: 'black_hole' | 'legacy';
  readonly reason: string;
}

/**
 * Chooses the model that will repair a validation or build failure.
 *
 * The scope matters as much as the model: §24's real instruction is not to regenerate the
 * product for a local failure, so the returned scope is what the caller should limit itself to.
 * A failure never widens authority — the canonical router filters the repair chain on the same
 * write authority the original request carried.
 */
export function selectRepairModel(input: RepairSelectionInput): RepairSelection {
  const plan = input.plan ?? readCutoverPlan(input.env);
  const failure = classifyFailure(input.failureMessage);
  const repair = routeRepair(failure);
  const scope = escalateScope(repair.scope, input.attempt);

  const legacy: RepairSelection = {
    modelId: input.legacyModel,
    failure,
    scope,
    source: 'legacy',
    reason: 'the previous repair selection chose this model',
  };
  if (!plan.runsBlackHole) return legacy;

  const analysis = analyzeTask({
    prompt: input.prompt ?? input.failureMessage,
    projectId: input.projectId ?? null,
    repositoryMutationRequested: true,
    previousFailures: input.attempt,
  });
  const route = routeBlackHole({
    analysis,
    complexity: assessBlackHoleComplexity({
      prompt: input.failureMessage,
      analysis,
      previousFailures: input.attempt,
    }),
    mode: 'auto',
    exclude: input.exclude,
    env: input.env,
  });

  // The §24 preference intersected with what the router will actually permit. Preference
  // cannot introduce a model the router excluded — that is how a repair would gain authority
  // the original request never had.
  const permitted = repair.preferredModels.filter((id) => route.chain.includes(id));
  const selected = (permitted[0] ?? route.selected) as ModelId | undefined;

  record({
    surface: 'repair',
    legacy: input.legacyModel,
    blackHole: selected ?? null,
    agreed: selected === input.legacyModel,
    reason: `${failure} → ${scope}: ${repair.rationale}`,
  });

  if (!selected) return legacy;
  if (!plan.servesBlackHole || !servesFor(input, plan)) return legacy;

  return {
    modelId: selected,
    failure,
    scope,
    source: 'black_hole',
    reason: `${failure} → ${scope}: ${repair.rationale}`,
  };
}

// ---------------------------------------------------------------------------
// Research
// ---------------------------------------------------------------------------

export interface ResearchInput extends StageContext {
  readonly query: string;
  readonly officialDomains?: readonly string[];
  readonly signal?: AbortSignal;
}

export interface ResearchOutcome {
  readonly evidence: string;
  readonly sourceCount: number;
  readonly injectionAttempts: number;
  readonly unavailable: boolean;
  readonly source: 'black_hole' | 'legacy';
}

/**
 * Runs research through the canonical web-intelligence layer: Parallel for public web and
 * private Grok 4.3 native x_search for explicit X/Twitter evidence.
 */
export async function researchThroughBlackHole(
  input: ResearchInput,
  legacy: () => Promise<{ evidence: string; sourceCount: number }>,
): Promise<ResearchOutcome> {
  const plan = input.plan ?? readCutoverPlan(input.env);
  if (!plan.runsBlackHole || !plan.servesBlackHole || !servesFor(input, plan)) {
    const result = await legacy();
    return { ...result, injectionAttempts: 0, unavailable: result.sourceCount === 0, source: 'legacy' };
  }

  const result = await runWebIntelligence({
    userId: input.userId,
    prompt: input.query,
    officialDomains: input.officialDomains,
    signal: input.signal,
  });

  record({
    surface: 'research',
    legacy: null,
    blackHole: result.action,
    agreed: true,
    reason: result.reason,
  });

  return {
    evidence: result.evidence,
    sourceCount: result.sourceCount,
    injectionAttempts: result.injectionAttempts,
    unavailable: result.sourceCount === 0,
    source: 'black_hole',
  };
}
