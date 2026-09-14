import type {
  PreviewRequirement,
  SoftwareRunEvidence,
} from './contracts.js';

export interface CompletionGateInput {
  previewRequirement: PreviewRequirement;

  evidence: SoftwareRunEvidence;

  requireSuccessfulChecks: boolean;

  requireRepositoryPersistence: boolean;
}

export interface CompletionGateResult {
  complete: boolean;

  blockers: string[];
}

/**
 * Xroga-owned deterministic completion gate.
 *
 * The model cannot declare a software run complete.
 *
 * Completion is allowed only when the required runtime evidence
 * actually exists.
 */
export function evaluateSoftwareCompletion(
  input: CompletionGateInput,
): CompletionGateResult {
  const blockers: string[] = [];

  const {
    evidence,
    previewRequirement,
    requireSuccessfulChecks,
    requireRepositoryPersistence,
  } = input;

  if (evidence.changedFiles.length === 0) {
    blockers.push(
      'No project changes were produced.',
    );
  }

  if (requireSuccessfulChecks) {
    /*
     * A required verification phase must contain real executed
     * checks.
     *
     * Important:
     *
     * - zero checks is not success
     * - skipped checks are not success
     * - infrastructure refusal is not success
     * - unfinished checks are not success
     */
    if (evidence.checks.length === 0) {
      blockers.push(
        'No project checks were recorded.',
      );
    } else {
      const failedChecks =
        evidence.checks.filter(
          (check) =>
            check.status === 'failed',
        );

      const unfinishedChecks =
        evidence.checks.filter(
          (check) =>
            check.status === 'pending' ||
            check.status === 'running',
        );

      const skippedChecks =
        evidence.checks.filter(
          (check) =>
            check.status === 'skipped',
        );

      const passedChecks =
        evidence.checks.filter(
          (check) =>
            check.status === 'passed',
        );

      if (failedChecks.length > 0) {
        blockers.push(
          `${failedChecks.length} required check${
            failedChecks.length === 1
              ? ''
              : 's'
          } failed.`,
        );
      }

      if (unfinishedChecks.length > 0) {
        blockers.push(
          `${unfinishedChecks.length} required check${
            unfinishedChecks.length === 1
              ? ''
              : 's'
          } did not finish.`,
        );
      }

      if (skippedChecks.length > 0) {
        blockers.push(
          `${skippedChecks.length} required check${
            skippedChecks.length === 1
              ? ' was'
              : 's were'
          } skipped and therefore did not verify the project.`,
        );
      }

      /*
       * Defensive final guard.
       *
       * Even if a future check status is added or check
       * construction changes, required verification cannot pass
       * unless at least one check actually passed.
       */
      if (
        passedChecks.length === 0 &&
        failedChecks.length === 0 &&
        unfinishedChecks.length === 0 &&
        skippedChecks.length === 0
      ) {
        blockers.push(
          'No required project check produced successful verification evidence.',
        );
      }
    }
  }

  if (previewRequirement === 'required') {
    const preview =
      evidence.preview;

    if (!preview) {
      blockers.push(
        'A verified Preview is required but no Preview evidence exists.',
      );
    } else {
      if (
        preview.httpStatus === undefined ||
        preview.httpStatus < 200 ||
        preview.httpStatus >= 400
      ) {
        blockers.push(
          'Preview did not return a successful HTTP response.',
        );
      }

      if (preview.runtimeErrors.length > 0) {
        blockers.push(
          'Preview contains runtime errors.',
        );
      }

      if (preview.consoleErrors.length > 0) {
        blockers.push(
          'Preview contains browser console errors.',
        );
      }

      /*
       * Merely starting a server or returning a URL is not
       * browser verification.
       */
      const browserVerified =
        preview.desktopVerified === true ||
        preview.tabletVerified === true ||
        preview.mobileVerified === true;

      if (!browserVerified) {
        blockers.push(
          'Preview exists but browser verification has not completed.',
        );
      }
    }
  }

  if (
    requireRepositoryPersistence &&
    !evidence.commitSha
  ) {
    blockers.push(
      'Repository persistence was required but no verified commit exists.',
    );
  }

  return {
    complete:
      blockers.length === 0,

    blockers,
  };
}
