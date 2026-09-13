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
     * Important:
     *
     * Zero recorded checks must NOT silently count as
     * verification success.
     */
    if (evidence.checks.length === 0) {
      blockers.push(
        'No project checks were recorded.',
      );
    }

    const failedChecks = evidence.checks.filter(
      (check) => check.status === 'failed',
    );

    const unfinishedChecks = evidence.checks.filter(
      (check) =>
        check.status === 'pending' ||
        check.status === 'running',
    );

    if (failedChecks.length > 0) {
      blockers.push(
        `${failedChecks.length} required check${
          failedChecks.length === 1 ? '' : 's'
        } failed.`,
      );
    }

    if (unfinishedChecks.length > 0) {
      blockers.push(
        `${unfinishedChecks.length} required check${
          unfinishedChecks.length === 1 ? '' : 's'
        } did not finish.`,
      );
    }
  }

  if (previewRequirement === 'required') {
    const preview = evidence.preview;

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
       * startPreview() alone must NOT be enough.
       *
       * At least one real browser verification result must
       * exist before a preview-required project can complete.
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
    complete: blockers.length === 0,
    blockers,
  };
}
