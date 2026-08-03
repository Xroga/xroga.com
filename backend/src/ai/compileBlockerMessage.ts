import type { CompileValidateResult } from './compileValidate.js';
import type { ReviewBuildOutputResult } from './qa.js';
import { productionValidationAllowsDeployment } from './compileValidate.js';

/**
 * The user-facing reason a build could not ship.
 *
 * Production was handing people this as the final answer:
 *
 *   Compile failed — fix TypeScript/install before ship
 *
 * That is wrong twice over. It tells the user to do work Xroga exists to do —
 * they are not supposed to install packages or fix TypeScript — and it does not
 * say what actually failed, so nobody could act on it even if they wanted to.
 * Two separate production runs ended on that line.
 *
 * This replaces it with the specific stage that failed, the first real diagnostic,
 * and whether the cause was the code or the infrastructure — because those are not
 * the same situation. An npm registry timeout is not something a user or a repair
 * pass can fix by editing source; saying so plainly is more useful than implying
 * the project is broken.
 *
 * Nothing here instructs the user to run a command.
 */

/** Trims a raw diagnostic to one readable line without losing the identifying part. */
function firstDiagnostic(result: CompileValidateResult): string | null {
  const issue = result.issues.find((item) => item.trim().length > 0);
  if (!issue) return null;
  const line = issue.split('\n').find((part) => part.trim().length > 0) ?? issue;
  return line.trim().slice(0, 180);
}

/** True when the failure is the package registry or the network, not the project. */
export function compileFailureIsInfrastructure(result: CompileValidateResult): boolean {
  if (result.ok || result.skipped) return false;
  if (!result.issues.length) return false;
  return result.issues.every((issue) =>
    /npm install timed out|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|registry\.npmjs\.org|network|socket hang up/i.test(
      issue,
    ),
  );
}

/**
 * One sentence naming the failed stage, plus the diagnostic when there is one.
 *
 * `repairAttempts` is included when repair actually ran, so the message reflects
 * that Xroga tried rather than implying it gave up immediately.
 */
export function describeCompileBlocker(
  result: CompileValidateResult,
  opts: { repairAttempts?: number } = {},
): string {
  const detail = firstDiagnostic(result);
  const suffix = detail ? ` — ${detail}` : '';
  const tried =
    opts.repairAttempts && opts.repairAttempts > 0
      ? ` after ${opts.repairAttempts} automatic repair ${opts.repairAttempts === 1 ? 'attempt' : 'attempts'}`
      : '';

  if (compileFailureIsInfrastructure(result)) {
    // Deliberately not phrased as a project defect: the code may be fine.
    return `Dependency install could not reach the package registry${suffix}. Nothing was pushed or deployed.`;
  }

  if (result.installOk === false) {
    return `Dependency install failed${tried}${suffix}. Nothing was pushed or deployed.`;
  }
  if (result.tscOk === false) {
    return `TypeScript errors remain${tried}${suffix}. Nothing was pushed or deployed.`;
  }
  if (result.buildOk === false) {
    const code = typeof result.buildExitCode === 'number' ? ` (exit ${result.buildExitCode})` : '';
    return `Production build failed${code}${tried}${suffix}. Nothing was pushed or deployed.`;
  }
  if (result.reason) {
    return `Production validation did not pass — ${result.reason.slice(0, 180)}. Nothing was pushed or deployed.`;
  }
  return `Production validation did not pass${tried}${suffix}. Nothing was pushed or deployed.`;
}

/**
 * The user-facing reason a build is blocked purely on review content — a truncated
 * file, a missing required section, incomplete logic — with no compile or structural
 * problem involved.
 *
 * Run `e1f37426` is why this exists. The reviewer found real, specific problems:
 * *"The HTML file is truncated; the booking form, contact section, and admin modal are
 * incomplete or missing. The JavaScript file is truncated; functions like
 * generateTimeSlots, showAdminModal, toggleMobileNav, and booking submission logic are
 * missing."* That finding sat in a QA notes panel the terminal message never
 * referenced. Instead the ship blocker said "No package.json — static project, skipped
 * compile" — `describeCompileBlocker` reporting on `compile`, the one thing that had
 * genuinely gone fine, because nothing else told it the real reason was elsewhere.
 *
 * This surfaces what the reviewer actually found instead of manufacturing a compile
 * explanation for a failure compile had nothing to do with.
 */
export function describeReviewBlocker(qa: Pick<ReviewBuildOutputResult, 'issues'>): string {
  const findings = qa.issues.map((issue) => issue.trim()).filter(Boolean).slice(0, 3);
  const detail = findings.length ? ` — ${findings.join('; ').slice(0, 300)}` : '';
  return `Review found the build incomplete${detail}. Nothing was pushed or deployed.`;
}

/**
 * Picks which explanation belongs to a blocked ship — the one place this decision is
 * made, so pipeline.ts cannot again reach for `describeCompileBlocker` for a verdict
 * that compile had nothing to do with.
 *
 * `verdictIsCodeDefect` is `classifyValidation`'s own verdict, not re-derived here — the
 * three inputs below only decide *which* of the three reasons that verdict already
 * covers actually applies, matching the exhaustive case analysis in `classifyValidation`:
 * a structural failure, a compile failure, or a review failure, in that priority order
 * because a broken structure is checked first there too.
 */
export function selectShipBlockerMessage(input: {
  verdictIsCodeDefect: boolean;
  structureOk: boolean;
  compile: CompileValidateResult;
  qa: Pick<ReviewBuildOutputResult, 'issues'>;
  repairAttempts?: number;
}): string | null {
  if (!input.verdictIsCodeDefect) return null;
  // A broken structure already gets its own message elsewhere (naming the specific
  // structural issue); returning null here avoids a second, less specific message for
  // the same root cause.
  if (!input.structureOk) return null;
  if (!productionValidationAllowsDeployment(input.compile)) {
    return describeCompileBlocker(input.compile, { repairAttempts: input.repairAttempts });
  }
  return describeReviewBlocker(input.qa);
}
