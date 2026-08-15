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
import { analyzeTask, type TaskAnalysis } from './taskClass.js';
import { assessBlackHoleComplexity } from './complexity.js';
import { routeBlackHole, type PublicMode } from './router.js';
import { classifyFailure, routeRepair, escalateScope, type RepairFailureKind } from './repairRouting.js';
import {
  formatResearchAsEvidence,
  runResearch,
  type RawResult,
  type ResearchAvailability,
  type ResearchExecutors,
  type TavilyConnectionState,
} from './researchRouter.js';
import { grokLiveSearch, searxngSearch, tavilySearch, type ResearchBundle } from '../research.js';
import { getSecret } from '../../config/envSecrets.js';
import { getUserProviderKey } from '../../services/integrations/userProviderKeys.js';
import { validateResearchUrl } from '../../synthesis/research/researchEngine.js';
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

/**
 * The user's Tavily connection state.
 *
 * Read from the existing encrypted per-user integration store. There is no OAuth flow here
 * because Tavily's published integration mechanism is an API key, and inventing an OAuth
 * handshake that the vendor does not offer would produce a connect button that cannot work.
 * A key the user supplies is still *their* key, drawing on *their* quota, which is the
 * property that actually matters: authorization is never shared between users.
 */
export async function userTavilyState(userId: string): Promise<TavilyConnectionState> {
  try {
    const key = await getUserProviderKey(userId, 'tavily');
    return key?.trim() ? 'connected' : 'not_connected';
  } catch {
    return 'provider_unavailable';
  }
}

function toRawResults(bundle: ResearchBundle): RawResult[] {
  return bundle.sources.map((source) => ({
    title: source.title,
    url: source.url,
    snippet: source.snippet,
    xHandle: /x\.com|twitter\.com/i.test(source.url) ? source.title : undefined,
  }));
}

export interface ResearchInput extends StageContext {
  readonly query: string;
  readonly officialDomains?: readonly string[];
  readonly signal?: AbortSignal;
  /** Product policy: may this request spend the shared platform key? */
  readonly platformTavilyPermitted?: boolean;
}

export interface ResearchOutcome {
  readonly evidence: string;
  readonly sourceCount: number;
  readonly injectionAttempts: number;
  readonly unavailable: boolean;
  readonly source: 'black_hole' | 'legacy';
}

/**
 * Runs research through the canonical router.
 *
 * The executors below are thin adapters over the transports that already exist in
 * `research.ts`. Reusing them keeps the SSRF guard (`validateResearchUrl`) and the timeouts in
 * one place; a second Tavily or SearXNG client in this layer would be one more place for those
 * to be forgotten.
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

  const grokKey = getSecret('GROK_API_KEY') || getSecret('XAI_API_KEY');
  const platformTavilyKey = getSecret('TAVILY_API_KEY');
  const userTavilyKey = await getUserProviderKey(input.userId, 'tavily').catch(() => null);

  const availability: ResearchAvailability = {
    grokConfigured: Boolean(grokKey),
    userTavily: userTavilyKey?.trim() ? 'connected' : 'not_connected',
    searxngConfigured: true,
    platformTavilyConfigured: Boolean(platformTavilyKey),
    // Defaults to false: §14 keeps the shared key for controlled fallback rather than as the
    // silent default for every authenticated user.
    platformTavilyPermitted: input.platformTavilyPermitted ?? false,
  };

  const analysis: TaskAnalysis = analyzeTask({ prompt: input.query });

  const executors: ResearchExecutors = {
    direct_fetch: async (urls) => {
      const results: RawResult[] = [];
      for (const url of urls.slice(0, 4)) {
        if (input.signal?.aborted) break;
        try {
          validateResearchUrl(url);
          const response = await fetch(url, {
            headers: { 'User-Agent': 'XrogaResearch/2.0' },
            signal: input.signal ?? AbortSignal.timeout(15_000),
          });
          if (!response.ok) continue;
          const body = (await response.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
          results.push({ url, title: new URL(url).hostname, snippet: body.slice(0, 1_200) });
        } catch {
          continue;
        }
      }
      return results;
    },
    grok: async (query) => {
      if (!grokKey) return [];
      const { bundle } = await grokLiveSearch(query, grokKey, { includeX: true, forceX: true });
      return toRawResults(bundle);
    },
    user_tavily: async (query) =>
      userTavilyKey ? toRawResults(await tavilySearch(query, userTavilyKey)) : [],
    searxng: async (query) => toRawResults(await searxngSearch(query)),
    platform_tavily: async (query) =>
      platformTavilyKey ? toRawResults(await tavilySearch(query, platformTavilyKey)) : [],
  };

  const { bundle, trace } = await runResearch(analysis, availability, executors, {
    query: input.query,
    officialDomains: input.officialDomains,
  });

  record({
    surface: 'research',
    legacy: null,
    blackHole: trace.servedBy,
    agreed: true,
    reason: trace.reasons.join('; '),
  });

  return {
    evidence: formatResearchAsEvidence(bundle),
    sourceCount: bundle.sources.length,
    injectionAttempts: bundle.injectionAttempts,
    unavailable: bundle.unavailable,
    source: 'black_hole',
  };
}
