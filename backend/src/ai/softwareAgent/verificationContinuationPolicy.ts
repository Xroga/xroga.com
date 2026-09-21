import type {
  SoftwareRunEvidence,
} from './contracts.js';

/**
 * Agent V2 has no total build-time ceiling and no fixed total number
 * of verification rounds.
 *
 * This limit applies ONLY to consecutive continuation turns that
 * produce exactly the same deterministic verification state.
 *
 * Any real project progress resets the counter.
 */
export const DEFAULT_MAX_STAGNANT_CONTINUATIONS =
  2;

function sortedStrings(
  values: readonly string[],
): string[] {
  return [
    ...values,
  ].sort(
    (
      left,
      right,
    ) =>
      left.localeCompare(
        right,
      ),
  );
}

/**
 * Produce a deterministic signature of the evidence that Xroga can
 * actually verify.
 *
 * Model prose and iteration count are deliberately excluded.
 *
 * Saying "I am working on it" is not progress.
 *
 * Creating/modifying a file, changing check results, producing Preview
 * evidence, or changing a real completion blocker is progress.
 */
export function verificationProgressFingerprint(
  input: {
    evidence: SoftwareRunEvidence;
    blockers: readonly string[];
  },
): string {
  const changedFiles =
    [
      ...input.evidence
        .changedFiles,
    ]
      .sort(
        (
          left,
          right,
        ) =>
          left.path.localeCompare(
            right.path,
          ),
      )
      .map(
        (
          file,
        ) => ({
          path:
            file.path,

          revision:
            file.revision ??
            null,

          additions:
            file.additions ??
            null,

          deletions:
            file.deletions ??
            null,

          created:
            file.created ===
            true,

          deleted:
            file.deleted ===
            true,
        }),
      );

  const checks =
    [
      ...input.evidence
        .checks,
    ]
      .sort(
        (
          left,
          right,
        ) =>
          left.id.localeCompare(
            right.id,
          ),
      )
      .map(
        (
          check,
        ) => ({
          id:
            check.id,

          name:
            check.name,

          status:
            check.status,

          command:
            check.command ??
            null,

          exitCode:
            check.exitCode ??
            null,

          summary:
            check.summary ??
            null,
        }),
      );

  const preview =
    input.evidence.preview
      ? {
          status:
            input.evidence
              .preview
              .status,

          attempted:
            input.evidence
              .preview
              .attempted,

          url:
            input.evidence
              .preview
              .url,

          notCheckedReason:
            input.evidence
              .preview
              .notCheckedReason ??
            null,

          blocker:
            input.evidence
              .preview
              .blocker ??
            null,

          evidenceForRepair:
            input.evidence
              .preview
              .evidenceForRepair ??
            null,

          criteriaNotChecked:
            sortedStrings(
              input.evidence
                .preview
                .criteriaNotChecked,
            ),

          screenshots:
            sortedStrings(
              input.evidence
                .preview
                .screenshots,
            ),

          rungReached:
            input.evidence
              .preview
              .rungReached ??
            null,
        }
      : null;

  return JSON.stringify({
    changedFiles,

    checks,

    preview,

    commitSha:
      input.evidence
        .commitSha ??
      null,

    branch:
      input.evidence
        .branch ??
      null,

    blockers:
      sortedStrings(
        input.blockers,
      ),
  });
}

export interface VerificationContinuationObservation {
  progressed: boolean;

  stagnantContinuations: number;

  shouldStop: boolean;
}

/**
 * Detect non-convergence without imposing a build duration or total
 * iteration limit.
 *
 * There is intentionally NO counter for total productive continuations.
 *
 * An agent can make 5, 50 or 500 continuation turns if each produces
 * new deterministic evidence.
 *
 * We stop only when consecutive completed turns leave Xroga with the
 * exact same verifiable state.
 */
export class VerificationContinuationTracker {
  private previousFingerprint:
    string;

  private stagnantContinuations =
    0;

  private readonly maximumStagnantContinuations:
    number;

  constructor(
    input: {
      evidence: SoftwareRunEvidence;

      blockers: readonly string[];

      maximumStagnantContinuations?: number;
    },
  ) {
    const requested =
      input
        .maximumStagnantContinuations;

    this.maximumStagnantContinuations =
      typeof requested ===
        'number' &&
      Number.isFinite(
        requested,
      ) &&
      requested >=
        1
        ? Math.floor(
            requested,
          )
        : DEFAULT_MAX_STAGNANT_CONTINUATIONS;

    this.previousFingerprint =
      verificationProgressFingerprint({
        evidence:
          input.evidence,

        blockers:
          input.blockers,
      });
  }

  observe(
    input: {
      evidence: SoftwareRunEvidence;

      blockers: readonly string[];
    },
  ): VerificationContinuationObservation {
    const nextFingerprint =
      verificationProgressFingerprint({
        evidence:
          input.evidence,

        blockers:
          input.blockers,
      });

    const progressed =
      nextFingerprint !==
      this.previousFingerprint;

    if (
      progressed
    ) {
      this.stagnantContinuations =
        0;
    } else {
      this.stagnantContinuations +=
        1;
    }

    this.previousFingerprint =
      nextFingerprint;

    return {
      progressed,

      stagnantContinuations:
        this.stagnantContinuations,

      shouldStop:
        this.stagnantContinuations >=
        this.maximumStagnantContinuations,
    };
  }
}
