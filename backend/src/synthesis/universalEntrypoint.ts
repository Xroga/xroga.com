/**
 * The point where a real user build enters the universal path.
 *
 * Until this existed, `executeUniversalRun` and `productionAdapters` were defined, tested
 * and called by nothing. The flag could be set to `enabled` and a project could be
 * allowlisted and the outcome would be identical to leaving it off — which meant M19's
 * requirement to run "through the ACTUAL production user-build entrypoint" could not be
 * met, because there was no path from the entrypoint to the code.
 *
 * The integration is deliberately one function returning `null`. `runBuildPipeline` calls
 * it once; a null means "not selected, carry on as before" and the legacy pipeline proceeds
 * untouched. That shape matters more than it looks: the alternative is an `if` wrapped
 * around three thousand lines of orchestration, where every later edit has to remember
 * which branch it is in.
 *
 * Reachability is worth stating plainly. This returns `null` unless
 * `UNIVERSAL_AGENT_ENABLED=enabled` *and* the project is allowlisted. Production runs
 * `shadow`, so today this is unreachable there — which is the intended state until a
 * designated test project exists.
 */

import { randomUUID } from 'node:crypto';
import type { ProjectFile } from '../ai/patches.js';
import { chatCompletion, type ChatMessage } from '../ai/openaiCompat.js';
import { mayWrite, routeProject, type UniversalAgentFlags } from '../config/universalAgentFlags.js';
import { productionAdapters, type CommitFn } from './productionAdapters.js';
import { implementIncrementally } from './incrementalImplementation.js';
import { executeUniversalRun, type UniversalExecutionResult } from './universalExecution.js';
import { universalStore, type Owner, type UniversalStore } from './universalPersistence.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { routeByCapability, type RoutingCandidate } from '../ai/capabilityRouter.js';
import { buildProfile } from '../ai/modelCapabilityProfile.js';
import { getRuntimeModelRegistry } from '../ai/modelCapabilityRegistry.js';
import { assertCodingModel, isCodingModel } from '../ai/providerPolicy.js';
import { chooseCostAware } from '../ai/providerCostTiers.js';
import { chooseFromMeasuredEvidence, loadMeasuredEvidence } from '../ai/measuredEvidence.js';
import { MODELS, type ModelId } from '../ai/models.js';
import type { ExecutionStateStore } from '../ai/executionRuntime.js';

export interface UniversalBuildOutcome {
  readonly ran: true;
  readonly result: UniversalExecutionResult;
  readonly routing: {
    readonly selectedModel: string | null;
    readonly fallbacks: readonly string[];
    readonly reason: string;
    readonly excluded: ReadonlyArray<{ modelId: string; reason: string }>;
    /** True when a hand-written prior decided this rather than a measurement. */
    readonly selectedOnPrior?: boolean;
    readonly evidenceSource?: 'measured' | 'unavailable';
  };
}

/**
 * Builds capability profiles from the runtime model registry.
 *
 * The bridge M19 §8 asks for. The legacy `intelligentRouter` picks from the same registry
 * by hand-written strength scores; this converts those into profiles so the capability
 * router ranks them by provenance-weighted evidence instead. Every profile starts
 * `declared` and stays that way until outcomes accumulate — which is the honest starting
 * point, not a defect.
 */
export function capabilityCandidates(): readonly RoutingCandidate[] {
  return getRuntimeModelRegistry()
    // §7: research providers never implement. Filtered at the source of the candidate list
    // rather than after ranking, so a research model cannot be selected, cannot become a
    // fallback, and cannot appear in the run's recorded routing evidence as a coding
    // option that merely lost. Before this, `grok_4_5` and `grok_4_3` carried a coding
    // score of 7 and were ranked for the `coding` capability like any other model.
    .filter((model) => isCodingModel(model.id))
    .map((model) => ({
    // A model with an open circuit or a known outage is excluded rather than ranked down:
    // §22 treats availability as a hard requirement, not a scoring penalty.
    available:
      model.configured &&
      model.enabled &&
      model.health.status !== 'unavailable' &&
      model.health.status !== 'circuit_open',
    profile: buildProfile({
      modelId: model.id,
      providerId: model.provider,
      contextWindow: model.contextWindow,
      maximumOutput: model.maximumSafeRequestTokens,
      toolSupport: model.supports.toolCalls,
      structuredOutputSupport: model.supports.structuredOutput,
      visionSupport: model.supports.images,
      streamingSupport: model.supports.streaming,
      declaredScores: model.strengths as unknown as Record<string, number>,
      inputUsdPer1M: model.inputUsdPer1M,
      outputUsdPer1M: model.outputUsdPer1M,
    }),
  }));
}

/** Extracts a file map from a model reply, tolerating the fences models add. */
export function parseGeneratedFiles(text: string): readonly ProjectFile[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  try {
    const parsed = JSON.parse(raw) as { files?: Array<{ path?: unknown; content?: unknown }> };
    if (!Array.isArray(parsed.files)) return [];
    return parsed.files
      .filter((file) => typeof file?.path === 'string' && typeof file?.content === 'string')
      // Path safety is enforced again here even though the patch workspace enforces it too.
      // A traversal that reaches the workspace is caught, but catching it at the boundary
      // means the run reports a bad generation rather than a rejected write.
      .filter((file) => {
        const path = String(file.path);
        return !path.startsWith('/') && !path.includes('..') && path.length > 0;
      })
      .map((file) => ({ path: String(file.path), content: String(file.content) }));
  } catch {
    return [];
  }
}

const IMPLEMENT_SYSTEM = `You are the implementation agent on Xroga's universal engineering path.
You receive a brief containing decisions that are already settled. Do not change the language,
framework, package manager or architecture the brief states.

Return JSON only, with no prose and no markdown fence:
{"files":[{"path":"relative/path","content":"complete file contents"}]}

Rules:
- Every file must be complete and syntactically valid. No placeholders, no TODO stubs.
- Include the project manifest, sources, tests and a README.
- Paths are relative. Never absolute, never containing "..".
- Include the tests the acceptance criteria and security requirements call for, including
  the negative tests that prove a refusal actually happens.`;

/**
 * Runs a build through the universal path, or returns null.
 *
 * Null is the normal answer. It means the project was not selected, and the caller should
 * continue exactly as it did before this function existed.
 */
export async function tryUniversalBuild(input: {
  runId?: string;
  userId: string;
  projectId?: string | null;
  prompt: string;
  existingFiles?: readonly ProjectFile[];
  commit: CommitFn;
  flags?: UniversalAgentFlags;
  store?: UniversalStore;
  /** Durable store for the canonical task graph. In-memory when absent. */
  executionStore?: ExecutionStateStore;
}): Promise<UniversalBuildOutcome | null> {
  const decision = routeProject(input.projectId ?? null, input.flags);
  if (!mayWrite(decision)) return null;

  const owner: Owner = {
    userId: input.userId,
    projectId: input.projectId ?? `run:${input.runId ?? 'unknown'}`,
  };

  // §8: the capability router must actually decide, not the legacy one. The selection is
  // captured so the run's evidence can name the model and why it won.
  const route = routeByCapability(
    {
      capability: 'coding',
      requiredContextTokens: 32_000,
      needsStructuredOutput: true,
    },
    capabilityCandidates(),
  );

  if (!route.selected) {
    // Refusing beats routing to something unevaluated. The excluded list explains why.
    return {
      ran: true,
      routing: { selectedModel: null, fallbacks: [], reason: route.reason, excluded: route.excluded },
      result: {
        outcome: 'blocked', phaseReached: 'routing', plan: null, securityControls: [],
        files: [], commitSha: null, evidence: [], blockers: [route.reason],
        mutationBegan: false, verified: false, reason: route.reason,
      },
    };
  }

  // §13: measured evidence outranks the hand-written priors the capability router ranks by.
  //
  // Until this existed the chain was three disconnected halves — the runner wrote
  // `model_benchmark_runs`, nothing read it, `buildLedger` was called by no production code
  // and neither was `chooseCostAware`. Real benchmark rows would have accumulated beside a
  // router that never consulted them.
  //
  // Absence of measurement is reported rather than inferred: with no evidence for this role
  // the prior-based `route` above stands unchanged, and the run records that the choice was
  // made on a prior instead of implying it was earned.
  const measuredEvidence = await loadMeasuredEvidence();
  const measured = chooseFromMeasuredEvidence({
    role: 'implementation',
    candidates: [route.selected.modelId, ...route.fallbacks.map((model) => model.modelId)],
    evidence: measuredEvidence,
    chooser: (choice) => chooseCostAware(choice),
  });

  // The measured winner leads and the prior ranking becomes its fallback chain, with the
  // winner removed so it is never attempted twice. When nothing was measured this is exactly
  // the previous ordering.
  const orderedCandidates: readonly string[] = measured.modelId
    ? [measured.modelId, ...[route.selected.modelId, ...route.fallbacks.map((m) => m.modelId)].filter((id) => id !== measured.modelId)]
    : [route.selected.modelId, ...route.fallbacks.map((m) => m.modelId)];

  const result = await executeUniversalRun({
    prompt: input.prompt,
    owner,
    runId: input.runId ?? randomUUID(),
    existingFiles: input.existingFiles ?? [],
    flags: input.flags,
    // A real client, not null. `universalStore(null)` builds an in-memory store, so every
    // spec, plan and run record the universal path produced lived in process memory and
    // died with the process — `universal_runs` stayed empty no matter how many runs
    // executed. M19 asks for durable evidence of what a run decided; an audit trail that
    // does not survive a restart is not one.
    store: input.store ?? universalStore(getSupabaseAdmin()),
    adapters: productionAdapters({
      implement: async ({ brief }) => {
        // Incremental rather than one whole-project completion. The single-call approach
        // failed against every coding model in production (run 05769971): a project encoded
        // as one JSON object under a 16k ceiling ends mid-string, and JSON.parse then
        // rejects the entire reply — nine finished files lost because the tenth was
        // clipped. Raising the ceiling only moves that cliff.
        //
        // The router's ranked candidates are passed through, so each call independently
        // falls back rather than the whole build depending on one model answering once.
        // Ordered by measurement when there is any, by prior otherwise. Passing the whole
        // chain means each call independently falls back rather than the build depending on
        // one model answering once.
        return implementIncrementally({
          brief,
          candidates: orderedCandidates.map((modelId) => ({ modelId })),
        });
      },
      commit: input.commit,
    }),
    // The canonical implementation task records the model routing actually selected, not a
    // re-derivation. A task whose recorded model differs from the one that generated the
    // files would make the routing evidence useless for exactly the question it exists to
    // answer: which model produced this code.
    implementationRouting: {
      selectedModel: orderedCandidates[0] as ModelId,
      // The provider is looked up from the registry rather than carried on the ranked
      // model, which holds only scoring fields. Recording the transport matters because
      // the family/transport binding is a policy invariant, not a detail.
      provider: MODELS[orderedCandidates[0] as ModelId]?.provider ?? null,
      fallbackModels: orderedCandidates.slice(1) as ModelId[],
    },
    executionStore: input.executionStore,
  });

  return {
    ran: true,
    result,
    routing: {
      selectedModel: orderedCandidates[0] ?? null,
      fallbacks: orderedCandidates.slice(1),
      // States plainly whether a measurement or a prior decided this. Without it a run
      // records a model and a plausible reason, and nobody can tell afterwards whether the
      // choice was earned or assumed.
      reason: measured.measured
        ? `selected on measured evidence — ${measured.reason}`
        : `selected on prior — ${route.reason} (${measured.reason})`,
      excluded: route.excluded,
      selectedOnPrior: !measured.measured,
      evidenceSource: measuredEvidence.source,
    },
  };
}

/**
 * A commit function that refuses rather than inventing a repository.
 *
 * §9 requires the final write to go through the Command 1 atomic path against a real
 * connected repository. A run without one must fail visibly: returning a fake SHA, or
 * skipping the commit and reporting success, would produce a "completed" build with
 * nothing in source control — the precise shape of dishonest evidence this command exists
 * to prevent.
 */
export function refusingCommit(reason: string): CommitFn {
  return async () => {
    throw new Error(
      `Refusing to commit: ${reason}. A universal run must write through the atomic GitHub ` +
        'path against a connected repository; reporting success without a commit would be a false result.',
    );
  };
}
