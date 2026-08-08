/**
 * Running the universal planner beside the legacy pipeline, for observation only.
 *
 * The one hard rule is that this can never affect the build it is observing. A shadow that
 * can break the thing it watches is worse than no shadow, because it converts a
 * measurement into an outage — so every path here is wrapped, and a failure is recorded as
 * a shadow error rather than propagated.
 *
 * It exists because the fixtures cannot settle the question they were written to answer.
 * All of them were authored by the same reasoning that wrote the planner, which is exactly
 * the blind spot Command 1 hit: a Fly guest configuration passed every stub test and was
 * rejected by the live API, because a stub replaying a module's own reasoning agrees with
 * it. Real prompts from real users are the only independent evidence available before
 * anything is switched on.
 */

import type { ProjectFile } from '../ai/patches.js';
import {
  compareShadowDecision,
  mayWrite,
  readUniversalAgentFlags,
  routeProject,
  type ShadowComparison,
  type UniversalAgentFlags,
} from '../config/universalAgentFlags.js';
import { planUniversalRun } from './universalFlow.js';

export interface ShadowObservation {
  readonly ran: boolean;
  readonly legacyStack: string;
  readonly comparison: ShadowComparison | null;
  readonly universalStatus: string | null;
  readonly error: string | null;
  /** Always false. Asserted by test, because it is the property that makes this safe. */
  readonly wrote: boolean;
}

/**
 * Observes what the universal planner would have decided.
 *
 * Returns rather than throws, always. The caller is a live build and has no useful
 * response to a shadow failure other than carrying on, so handing it an exception would
 * only create a way for observation to break production.
 */
export function observeUniversalShadow(input: {
  prompt: string;
  legacyStack: string;
  files?: readonly ProjectFile[];
  projectId?: string | null;
  flags?: UniversalAgentFlags;
}): ShadowObservation {
  const flags = input.flags ?? readUniversalAgentFlags();
  const decision = routeProject(input.projectId ?? null, flags);

  if (!decision.shadow) {
    return { ran: false, legacyStack: input.legacyStack, comparison: null, universalStatus: null, error: null, wrote: false };
  }

  try {
    const plan = planUniversalRun({
      prompt: input.prompt,
      files: input.files ?? [],
      projectId: input.projectId ?? null,
    });

    return {
      ran: true,
      legacyStack: input.legacyStack,
      comparison: compareShadowDecision({
        legacyStack: input.legacyStack,
        universalLanguages: [
          ...new Set(plan.architecture.components.map((component) => component.language).filter((language): language is string => Boolean(language))),
        ],
        universalSurfaces: plan.spec.surfaces.map((declaration) => String(declaration.surface)),
      }),
      universalStatus: plan.status,
      error: null,
      // The universal path is never handed a writer in shadow. `mayWrite` is consulted
      // here so the invariant is expressed in the code that depends on it rather than
      // being an assumption this module makes about its caller.
      wrote: mayWrite(decision),
    };
  } catch (error) {
    return {
      ran: true,
      legacyStack: input.legacyStack,
      comparison: null,
      universalStatus: null,
      error: error instanceof Error ? error.message : String(error),
      wrote: false,
    };
  }
}

/**
 * A log line for an observation, or null when there is nothing worth saying.
 *
 * Agreement is silent on purpose. A shadow that logs on every request produces volume
 * nobody reads, and the whole value of this is in the disagreements.
 */
export function describeShadowObservation(observation: ShadowObservation): string | null {
  if (!observation.ran) return null;
  if (observation.error) return `[universal-shadow] planner failed: ${observation.error}`;
  if (!observation.comparison || observation.comparison.agreed) return null;
  return [
    `[universal-shadow] legacy=${observation.legacyStack} universal=${observation.universalStatus}`,
    ...observation.comparison.differences.map((difference) => `  ${difference}`),
  ].join('\n');
}
