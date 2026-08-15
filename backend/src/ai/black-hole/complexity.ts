/**
 * Black Hole ∞ complexity engine.
 *
 * §5 names twelve inputs and one use: complexity is a *routing input*, not a verdict. Nothing
 * here decides which model runs; `router.ts` reads the score alongside capability, authority,
 * health, cost and mode. That separation is deliberate — a scorer that also picks a model is
 * one that cannot be tested without a registry, and the interesting failures of a scorer are
 * about the score.
 *
 * ## Why every contribution is named
 *
 * `assessComplexity` in `intelligentRouter.ts` returns a bare number plus prose signals. When
 * a route is wrong, "score 62" is unactionable and the usual question is *which* input pushed
 * it over a threshold. So every contribution carries its input name and its points, and the
 * total is the sum of the parts rather than a parallel accumulator that can drift from them.
 *
 * ## Bounded contributions
 *
 * Each input has a ceiling. Without one, a single runaway signal — a 40 000-character prompt,
 * a repository with 12 000 files — saturates the score on its own and the other eleven inputs
 * stop mattering. A task can then be rated `critical` purely for being long, which routes
 * cheap bulk work to the most expensive model on the platform.
 */

import type { TaskAnalysis } from './taskClass.js';

export type ComplexityLevel = 'low' | 'medium' | 'high' | 'critical';

/** The twelve inputs §5 lists, each with the points it contributed. */
export interface ComplexityContribution {
  readonly input: string;
  readonly points: number;
  readonly detail: string;
}

export interface ComplexityAssessment {
  readonly score: number;
  readonly level: ComplexityLevel;
  readonly contributions: readonly ComplexityContribution[];
  /** Convenience view for logs and telemetry. */
  readonly signals: readonly string[];
}

export interface ComplexityInput {
  readonly prompt: string;
  readonly analysis: TaskAnalysis;
  readonly repositoryFileCount?: number;
  readonly affectedFileCount?: number;
  /** Distinct top-level directories or packages the change touches. */
  readonly affectedModuleCount?: number;
  /** Tokens the assembled context is expected to occupy. */
  readonly estimatedContextTokens?: number;
  readonly expectedSteps?: number;
  readonly toolCount?: number;
  readonly previousFailures?: number;
  /** The caller's public mode, when one was chosen explicitly. */
  readonly requestedDepth?: 'fast' | 'auto' | 'deep';
}

const BASE_SCORE = 8;

/** A hard constraint the user stated. Each one narrows the space a model must satisfy. */
// No trailing `\b` on either pattern, for the reason documented in `taskClass.ts`: it would
// silently drop every plural and inflected form — "secrets", "credentials", "permissions",
// "requires" — which are the forms these words almost always appear in.
const CONSTRAINT_RE =
  /\b(must|cannot|do\s+not|don't|only\s+use|without\s+using|exactly|at\s+most|at\s+least|no\s+more\s+than|require|mandatory|backward[- ]?compatible|zero[- ]?downtime)/gi;

const SECURITY_SENSITIVE_RE =
  /\b(auth|oauth|rls|row[- ]level\s+security|secret|credential|token|encrypt|payment|checkout|wallet|smart\s*contract|pii|gdpr|permission)/i;

function clamp(value: number, ceiling: number): number {
  return Math.min(Math.max(value, 0), ceiling);
}

export function assessBlackHoleComplexity(input: ComplexityInput): ComplexityAssessment {
  const contributions: ComplexityContribution[] = [];
  const add = (name: string, points: number, detail: string) => {
    if (points <= 0) return;
    contributions.push({ input: name, points: Math.round(points), detail });
  };

  const prompt = input.prompt ?? '';
  const { analysis } = input;

  // 1. Prompt complexity — length is a weak proxy, so it is capped low and paired with the
  //    number of distinct requested features, which is the stronger signal.
  const features = prompt
    .split(/\b(?:and|plus|also|then|as\s+well\s+as)\b|[;\n]|(?:^|\s)[-*]\s|\b\d+[.)]\s/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 12).length;
  add('prompt_complexity', clamp(Math.log2(Math.max(prompt.length, 1)) - 6, 8), `${prompt.length} characters`);
  if (features >= 3) add('prompt_complexity', clamp(features * 2.5, 12), `${features} distinct requested items`);

  // 2. Constraints.
  const constraints = (prompt.match(CONSTRAINT_RE) ?? []).length;
  add('constraints', clamp(constraints * 2.5, 12), `${constraints} stated constraint(s)`);

  // 3. Context volume.
  const contextTokens = input.estimatedContextTokens ?? 0;
  add('context_volume', clamp(contextTokens / 12_000, 14), `${contextTokens} estimated context tokens`);

  // 4. Files touched.
  const affectedFiles = input.affectedFileCount ?? 0;
  add('files', clamp(affectedFiles * 1.2, 14), `${affectedFiles} affected file(s)`);

  // 5. Repository size.
  const repoFiles = input.repositoryFileCount ?? 0;
  if (repoFiles > 0) {
    add('repository_size', clamp(Math.log10(repoFiles) * 6, 14), `${repoFiles} repository file(s)`);
  }

  // 6. Affected modules — crossing a module boundary is worth more than another file inside
  //    one, because it is where interface assumptions break.
  const modules = input.affectedModuleCount ?? 0;
  add('affected_modules', clamp(modules * 3.5, 12), `${modules} module(s) crossed`);

  // 7. Expected steps.
  const steps = input.expectedSteps ?? analysis.classes.length;
  add('expected_steps', clamp((steps - 1) * 2.5, 12), `${steps} expected step(s)`);

  // 8. Tools.
  const tools = input.toolCount ?? 0;
  add('tools', clamp(tools * 2, 10), `${tools} tool(s) available`);

  // 9. Previous failures — the strongest single signal available, because it is the only one
  //    that is evidence rather than estimate: something already tried this and was wrong.
  const failures = input.previousFailures ?? 0;
  add('previous_failures', clamp(failures * 7, 18), `${failures} previous failure(s)`);

  // 10. Security sensitivity.
  if (analysis.classes.includes('security_review') || SECURITY_SENSITIVE_RE.test(prompt)) {
    add('security_sensitivity', 14, 'security or credential boundary in scope');
  }

  // 11. Modality.
  if (analysis.classes.includes('multimodal')) add('modality', 10, 'mixed image and document input');
  else if (analysis.hasImageAttachment) add('modality', 6, 'image input');
  else if (analysis.hasNonImageAttachment) add('modality', 4, 'document input');

  // 12. Requested depth. FAST does not make a task simple, so it subtracts nothing — it is a
  //     preference expressed later, during model selection, where it cannot disguise the real
  //     difficulty of the work.
  if (input.requestedDepth === 'deep') add('requested_depth', 10, 'caller requested DEEP');

  // Class-intrinsic difficulty: some classes are hard even when every other input is quiet.
  const intrinsic: Partial<Record<TaskAnalysis['primary'], number>> = {
    long_horizon_engineering: 18,
    architecture: 12,
    repository_coding: 10,
    security_review: 12,
    deep_reasoning: 10,
    deployment_debugging: 10,
    agentic: 10,
    refactoring: 8,
    debugging: 6,
  };
  for (const taskClass of analysis.classes) {
    const points = intrinsic[taskClass];
    if (points) add('task_class', points, `${taskClass} is intrinsically demanding`);
  }

  const score = clamp(
    BASE_SCORE + contributions.reduce((total, entry) => total + entry.points, 0),
    100,
  );

  return {
    score,
    level: score >= 78 ? 'critical' : score >= 52 ? 'high' : score >= 28 ? 'medium' : 'low',
    contributions,
    signals: contributions.map((entry) => `${entry.input}: ${entry.detail} (+${entry.points})`),
  };
}
