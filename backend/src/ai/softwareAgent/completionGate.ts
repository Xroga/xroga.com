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
    blockers.push('No project changes were produced.');
  }

  if (requireSuccessfulChecks) {
    const failedChecks = evidence.checks.filter(
      (check) => check.status === 'failed',
    );

    const runningChecks = evidence.checks.filter(
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

    if (runningChecks.length > 0) {
      blockers.push(
        `${runningChecks.length} required check${
          runningChecks.length === 1 ? '' : 's'
        } did not finish.`,
      );
    }
  }

  if (previewRequirement === 'required') {
    if (!evidence.preview) {
      blockers.push(
        'A verified Preview is required but no Preview evidence exists.',
      );
    } else {
      if (
        evidence.preview.httpStatus === undefined ||
        evidence.preview.httpStatus < 200 ||
        evidence.preview.httpStatus >= 400
      ) {
        blockers.push(
          'Preview did not return a successful HTTP response.',
        );
      }

      if (evidence.preview.runtimeErrors.length > 0) {
        blockers.push(
          'Preview contains runtime errors.',
        );
      }

      if (evidence.preview.consoleErrors.length > 0) {
        blockers.push(
          'Preview contains browser console errors.',
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
