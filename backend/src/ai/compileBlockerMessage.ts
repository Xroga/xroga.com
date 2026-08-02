import type { CompileValidateResult } from './compileValidate.js';

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
