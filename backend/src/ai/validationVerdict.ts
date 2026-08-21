import type { CompileValidateResult } from './compileValidate.js';
import { compileFailureIsInfrastructure } from './compileBlockerMessage.js';
import { productionValidationAllowsDeployment } from './compileValidate.js';

/**
 * Whether a validation failure is the user's product or our own machinery.
 *
 * Production run `dca6799a`, prompt "build a portfolio site with a dark theme":
 *
 *   20:07:02  architect     nextjs scaffold planned
 *   20:11:43  builder       code_ready — 20 files
 *   20:11:55  compiler      sandbox production build
 *   20:15:34  compiler      compile_failed — npm install timed out (217s)
 *   20:20:15  deploy        push_skipped
 *
 * Twenty-one real files. A complete portfolio site. Nothing wrong with any of it —
 * `npm install` inside *our* validation sandbox could not finish downloading a Next.js
 * dependency tree in 180 seconds. The user's product was discarded because our
 * temporary directory could not reach the package registry fast enough, and they were
 * told "Nothing was pushed or deployed."
 *
 * That is the wrong trade. A registry timeout says nothing about whether the code is
 * correct, and refusing to push means we never find out — while guaranteeing the user
 * gets nothing. Vercel runs its own install and its own production build on every
 * deployment; when our sandbox cannot run one, Vercel's build *is* the verification,
 * and a failure there is a real signal we can report.
 *
 * So failures are separated into two kinds:
 *
 * - **A code defect** — TypeScript errors, a failing production build, broken project
 *   structure. Real evidence the product does not work. Still blocks the ship, exactly
 *   as before.
 * - **Not verified** — a package-registry timeout, or the reviewer model being
 *   unavailable. Evidence about our infrastructure, not their code. The code ships and
 *   the user is told plainly that local verification could not run.
 *
 * The honesty rule is unchanged and is the whole reason this distinction is explicit:
 * `not_verified` must never be reported as though it passed.
 */

export type ValidationVerdict = 'passed' | 'code_defect' | 'not_verified';

export interface QaSummary {
  ok: boolean;
  issues: string[];
}

/**
 * True when QA failed because the reviewer itself could not run.
 *
 * `reviewBuildOutput` returns `{ ok: false, issues: ['QA unavailable'] }` when the
 * reviewer model is down. That is a provider outage wearing the costume of a code
 * review failure, and on run `dca6799a` it also sent the pipeline into a repair pass
 * that spent four and a half minutes trying to fix a network timeout with source edits.
 */
export function qaWasUnavailable(qa: QaSummary): boolean {
  if (qa.ok) return false;
  const real = qa.issues.filter((issue) => issue.trim().length > 0);
  return (
    real.length > 0 &&
    real.every((issue) => {
      const message = issue.trim();
      return (
        /^QA unavailable$/i.test(message) ||
        /^The reviewer could not be reached for batch \d+ of \d+ — treated as not reviewed\.$/i.test(
          message,
        )
      );
    })
  );
}

/**
 * The verdict for one run's validation evidence.
 *
 * `structureOk` is the static project-structure check, which needs no network and no
 * model. It is the one signal that is always trustworthy, so a structure failure is
 * always a code defect.
 */
export function classifyValidation(input: {
  compile: CompileValidateResult;
  qa: QaSummary;
  structureOk: boolean;
}): { verdict: ValidationVerdict; unverifiedReasons: string[] } {
  const unverifiedReasons: string[] = [];

  if (!input.structureOk) return { verdict: 'code_defect', unverifiedReasons };

  const compileOk = productionValidationAllowsDeployment(input.compile);
  if (!compileOk) {
    if (input.compile.sandboxUnavailable) {
      // Nothing was executed, so nothing is known about the code. Reporting this as a
      // defect would blame the user's product for our missing isolation runtime — the
      // same mistake that once discarded a working build over an npm timeout.
      unverifiedReasons.push(
        'generated code could not be run safely here, so it was not executed',
      );
    } else if (compileFailureIsInfrastructure(input.compile)) {
      unverifiedReasons.push('the package registry could not be reached from our build sandbox');
    } else {
      return { verdict: 'code_defect', unverifiedReasons };
    }
  }

  if (qaWasUnavailable(input.qa)) {
    unverifiedReasons.push('the automated reviewer was unavailable');
  } else if (!input.qa.ok) {
    // Real review findings are code evidence and keep their blocking power.
    return { verdict: 'code_defect', unverifiedReasons };
  }

  return {
    verdict: unverifiedReasons.length ? 'not_verified' : 'passed',
    unverifiedReasons,
  };
}

/**
 * The note attached to a shipped-but-unverified build.
 *
 * Written to be impossible to mistake for a pass: it names what did not run, says the
 * code was pushed anyway, and points at the deployment build as the actual check.
 */
export function describeUnverifiedShip(reasons: string[]): string {
  const list = reasons.length ? reasons.join(' and ') : 'local verification could not run';
  return `Your code was generated and pushed, but we could not verify it here first — ${list}. The deployment build is the real check: if it fails, the error will appear on this run.`;
}
