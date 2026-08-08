/**
 * Fixing what failed, and only what failed.
 *
 * The adapters already parse diagnostics and emit repair hints; nothing consumed them, so
 * a failing validation ended a run rather than starting a repair. This closes that.
 *
 * §47's constraints are all about *not* overreacting, and each one names a real failure
 * mode of the pipeline this replaces:
 *
 * **Do not regenerate the application for a local error.** A missing semicolon in one file
 * used to re-prompt for the entire project, which discards working code to fix a typo and
 * costs a full generation to do it.
 *
 * **Do not remove the feature to make tests green.** Deleting the failing test is a
 * legitimate-looking repair that satisfies every automated check and destroys the thing
 * that was asked for, so `isDestructiveRepair` refuses it explicitly.
 *
 * **Bound the attempts.** A repair loop that cannot fail is an infinite loop with a
 * budget attached.
 *
 * The judgement that matters most is knowing when *not* to try. A missing compiler is not
 * a code defect, and every attempt to fix it by editing source produces a plausible patch
 * for a problem that no patch can address — so `repairable: false` diagnostics end the
 * loop immediately rather than consuming the attempt budget.
 */

import type { ParsedDiagnostic } from './runtime/adapterContract.js';
import { adapterById, parseFailureFor, type DetectedComponent } from './runtime/registry.js';
import type { ExecutedValidation } from './universalFlow.js';

/** Attempts per failing validation. Three is enough to fix a typo and not enough to thrash. */
export const MAX_REPAIR_ATTEMPTS = 3;

export type RepairOutcome =
  | 'repaired'
  | 'attempts_exhausted'
  | 'not_repairable'
  | 'refused_destructive'
  | 'no_diagnostics';

export interface RepairContext {
  readonly component: DetectedComponent;
  readonly failure: ExecutedValidation;
  readonly diagnostics: readonly ParsedDiagnostic[];
  readonly hints: readonly string[];
  /** Only the files the diagnostics point at, never the whole tree. */
  readonly relevantFiles: readonly string[];
  readonly attempt: number;
  readonly maxAttempts: number;
}

export interface RepairAttemptResult {
  readonly changedFiles: readonly string[];
  readonly removedFiles?: readonly string[];
  readonly summary: string;
}

export interface RepairRecord {
  readonly attempt: number;
  readonly outcome: RepairOutcome;
  readonly changedFiles: readonly string[];
  readonly summary: string;
  readonly revalidationExitCode: number | null;
}

export interface RepairReport {
  readonly outcome: RepairOutcome;
  readonly attempts: readonly RepairRecord[];
  readonly blocker: string | null;
}

/**
 * Files a repair is allowed to touch.
 *
 * Derived from the diagnostics, so the scope of a fix is bounded by the evidence of what
 * broke. A diagnostic with no file — a linker error, a dependency resolution failure —
 * contributes nothing rather than widening the scope to everything.
 */
export function relevantFilesFor(
  diagnostics: readonly ParsedDiagnostic[],
  component: DetectedComponent,
): readonly string[] {
  const files = new Set<string>();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.file) continue;
    const path = diagnostic.file.replace(/^\.\//, '');
    files.add(
      component.root && !path.startsWith(`${component.root}/`) ? `${component.root}/${path}` : path,
    );
  }
  // A dependency error points at the manifest even when no diagnostic names a file: the
  // fix is to declare the package, not to edit the importing source.
  if (diagnostics.some((diagnostic) => diagnostic.kind === 'dependency_error')) {
    for (const manifest of component.inspection.manifests) files.add(manifest);
  }
  return [...files].sort();
}

/**
 * Whether a proposed repair destroys the thing it was meant to fix.
 *
 * The specific failure §47 names: removing a feature or a test to make validation pass.
 * Both satisfy every automated check, which is exactly why this has to be an explicit
 * refusal rather than something a reviewer is expected to notice.
 */
export function isDestructiveRepair(result: RepairAttemptResult): { destructive: boolean; reason: string | null } {
  const removed = result.removedFiles ?? [];
  const removedTests = removed.filter((path) => /(^|\/)(tests?|__tests__|spec)\//.test(path) || /\.(test|spec)\.[a-z]+$/.test(path));
  if (removedTests.length) {
    return {
      destructive: true,
      reason: `the repair deletes ${removedTests.length} test file(s) (${removedTests.join(', ')}), which makes validation pass by removing the check rather than fixing the defect`,
    };
  }
  if (removed.length) {
    return {
      destructive: true,
      reason: `the repair deletes ${removed.join(', ')}; deleting source to satisfy a failing validation removes the feature that was requested`,
    };
  }
  if (/\b(remove|delete|drop|disable|skip|comment out)\b.*\b(feature|test|check|validation|assertion)\b/i.test(result.summary)) {
    return {
      destructive: true,
      reason: `the repair describes itself as removing behaviour: "${result.summary}"`,
    };
  }
  return { destructive: false, reason: null };
}

export type RepairAttempt = (context: RepairContext) => Promise<RepairAttemptResult | null>;
export type Revalidate = (component: DetectedComponent, failure: ExecutedValidation) => Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}>;

/**
 * Repairs one failing validation.
 *
 * Reruns only the validation that failed. Rerunning the whole plan after every attempt
 * would multiply cost by the number of attempts and bury the signal — the question at this
 * point is narrow, "does this specific command pass now", and the broader suite is the
 * caller's business once it does.
 */
export async function repairFailure(input: {
  component: DetectedComponent;
  failure: ExecutedValidation;
  attemptRepair: RepairAttempt;
  revalidate: Revalidate;
  maxAttempts?: number;
}): Promise<RepairReport> {
  const maxAttempts = input.maxAttempts ?? MAX_REPAIR_ATTEMPTS;
  const output = `${input.failure.stdout}\n${input.failure.stderr}`;
  const diagnostics = parseFailureFor(input.component, output);
  const attempts: RepairRecord[] = [];

  if (!diagnostics.length) {
    return {
      outcome: 'no_diagnostics',
      attempts,
      blocker:
        `${input.failure.validation.command.command} failed with exit ${input.failure.exitCode ?? 'null'} and produced no ` +
        'diagnostic this adapter could parse, so no bounded repair was possible. The raw output is preserved as evidence.',
    };
  }

  // An environment problem cannot be patched. Attempting it produces a plausible-looking
  // change for a problem no change can address, and burns the budget doing it.
  const blocking = diagnostics.find((diagnostic) => !diagnostic.repairable);
  if (blocking) {
    return {
      outcome: 'not_repairable',
      attempts,
      blocker: `${blocking.message}. No source change can fix this, so no repair was attempted.`,
    };
  }

  const hints = repairHintsFor(input.component, diagnostics);
  const relevantFiles = relevantFilesFor(diagnostics, input.component);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await input.attemptRepair({
      component: input.component,
      failure: input.failure,
      diagnostics,
      hints,
      relevantFiles,
      attempt,
      maxAttempts,
    });

    if (!result) {
      attempts.push({ attempt, outcome: 'attempts_exhausted', changedFiles: [], summary: 'no change proposed', revalidationExitCode: null });
      continue;
    }

    const destructive = isDestructiveRepair(result);
    if (destructive.destructive) {
      attempts.push({ attempt, outcome: 'refused_destructive', changedFiles: result.changedFiles, summary: result.summary, revalidationExitCode: null });
      return {
        outcome: 'refused_destructive',
        attempts,
        blocker: `Repair refused: ${destructive.reason}`,
      };
    }

    const revalidation = await input.revalidate(input.component, input.failure);
    attempts.push({
      attempt,
      outcome: revalidation.exitCode === 0 ? 'repaired' : 'attempts_exhausted',
      changedFiles: result.changedFiles,
      summary: result.summary,
      revalidationExitCode: revalidation.exitCode,
    });

    if (revalidation.exitCode === 0) return { outcome: 'repaired', attempts, blocker: null };
  }

  return {
    outcome: 'attempts_exhausted',
    attempts,
    blocker:
      `${input.failure.validation.command.command} still fails after ${maxAttempts} bounded repair attempts. ` +
      'The failure is preserved rather than worked around.',
  };
}

/**
 * Adapter hints for a set of diagnostics.
 *
 * Routed through the registry rather than switched on here, so this module names no
 * ecosystem — the same rule the rest of the universal layer follows.
 */
function repairHintsFor(
  component: DetectedComponent,
  diagnostics: readonly ParsedDiagnostic[],
): readonly string[] {
  return adapterById(component.adapterId)?.repairHints(diagnostics) ?? [];
}
