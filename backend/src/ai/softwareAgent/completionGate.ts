import type {
  PreviewRequirement,
  SoftwareRunEvidence,
  VerificationAuthority,
} from './contracts.js';

export interface CompletionGateInput {
  previewRequirement: PreviewRequirement;

  verificationAuthority?:
  VerificationAuthority;

  evidence: SoftwareRunEvidence;

  requireSuccessfulChecks: boolean;

  requireRepositoryPersistence: boolean;
}

export interface CompletionGateResult {
  complete: boolean;

  blockers: string[];
}

/**
 * Synthetic policy result emitted by Xroga's universal deterministic
 * verifier.
 *
 * This is not itself a compiler, test runner, linter or build command.
 * It summarizes whether the universal verifier believes the available
 * deterministic evidence is sufficient for its strongest verification
 * claim.
 */
const XROGA_VERIFICATION_GATE_ID =
  'xroga:verification-gate';

/**
 * The universal verifier intentionally refuses its strongest generic
 * verification claim when no test command exists.
 *
 * That policy is correct for APIs, libraries, workers, CLIs and other
 * non-browser software where there may be no second independent runtime
 * proof.
 *
 * A preview-required web task is different:
 *
 * - deterministic build/type/lint evidence proves the project can be
 *   produced by the toolchain;
 * - browser Preview verification independently proves the generated
 *   application actually starts and can be observed.
 *
 * Agent V2 must therefore be allowed to proceed from deterministic
 * checks to required browser verification when the ONLY synthetic policy
 * objection is the absence of a test command.
 *
 * We deliberately match only this exact class of policy failure. Other
 * verification-gate failures remain blocking.
 */
const NO_TEST_COMMAND_REASON =
  /\bno test command ran\b/i;

function isDeferredPreviewTestPolicyFailure(
  check:
    SoftwareRunEvidence['checks'][number],
  previewRequirement:
    PreviewRequirement,
): boolean {
  if (
    previewRequirement !==
    'required'
  ) {
    return false;
  }

  if (
    check.id !==
    XROGA_VERIFICATION_GATE_ID
  ) {
    return false;
  }

  if (
    check.status !==
    'failed'
  ) {
    return false;
  }

  return NO_TEST_COMMAND_REASON.test(
    check.summary ?? '',
  );
}

/**
 * A synthetic policy gate must never be the only "passed check" that
 * allows software to complete.
 *
 * Completion needs executable project evidence from a real validation
 * command such as build, typecheck, lint or test.
 */
function isSubstantivePassedCheck(
  check:
    SoftwareRunEvidence['checks'][number],
): boolean {
  return (
    check.status ===
      'passed' &&
    check.id !==
      XROGA_VERIFICATION_GATE_ID
  );
}

/**
 * Xroga-owned deterministic completion gate.
 *
 * The model cannot declare a software run complete.
 *
 * Important web-specific rule:
 *
 * A preview-required web task may defer ONLY the synthetic
 * "no test command ran" policy failure until browser verification.
 *
 * It still requires:
 *
 * - at least one real successful project check;
 * - no real failed/unfinished/skipped required checks;
 * - passing browser Preview evidence;
 * - repository persistence when the contract requires it.
 *
 * Non-web tasks retain the existing strict behaviour.
 */
export function evaluateSoftwareCompletion(
  input: CompletionGateInput,
): CompletionGateResult {
  const blockers: string[] =
    [];

  const {
    evidence,
    previewRequirement,
    requireSuccessfulChecks,
    requireRepositoryPersistence,
  } = input;

  const verificationAuthority =
  input.verificationAuthority ??
  'agent';
  
  if (
    evidence.changedFiles.length ===
    0
  ) {
    blockers.push(
      'No project changes were produced.',
    );
  }

  /*
 * Universal builds have exactly one authoritative verifier:
 * UniversalExecution.
 *
 * Agent V2 owns implementation only in this mode.
 * It must produce a real changed workspace, then hand control
 * back to the deterministic universal verifier.
 */
if (
  verificationAuthority ===
  'universal'
) {
  return {
    complete:
      blockers.length ===
      0,

    blockers,
  };
}
  
  if (
    requireSuccessfulChecks
  ) {
    if (
      evidence.checks.length ===
      0
    ) {
      blockers.push(
        'No project checks were recorded.',
      );
    } else {
      /*
       * A preview-required project may postpone only the synthetic
       * "no tests exist" policy objection.
       *
       * Do not remove or mutate the original evidence. We derive an
       * effective view solely for the completion decision so the run
       * record remains truthful and debuggable.
       */
      const effectiveChecks =
        evidence.checks.filter(
          (check) =>
            !isDeferredPreviewTestPolicyFailure(
              check,
              previewRequirement,
            ),
        );

      const failedChecks =
        effectiveChecks.filter(
          (check) =>
            check.status ===
            'failed',
        );

      const unfinishedChecks =
        effectiveChecks.filter(
          (check) =>
            check.status ===
              'pending' ||
            check.status ===
              'running',
        );

      const skippedChecks =
        effectiveChecks.filter(
          (check) =>
            check.status ===
            'skipped',
        );

      const substantivePassedChecks =
        effectiveChecks.filter(
          isSubstantivePassedCheck,
        );

      if (
        failedChecks.length >
        0
      ) {
        blockers.push(
          `${failedChecks.length} required check${
            failedChecks.length ===
            1
              ? ''
              : 's'
          } failed.`,
        );
      }

      if (
        unfinishedChecks.length >
        0
      ) {
        blockers.push(
          `${unfinishedChecks.length} required check${
            unfinishedChecks.length ===
            1
              ? ''
              : 's'
          } did not finish.`,
        );
      }

      if (
        skippedChecks.length >
        0
      ) {
        blockers.push(
          `${skippedChecks.length} required check${
            skippedChecks.length ===
            1
              ? ' was'
              : 's were'
          } skipped and therefore did not verify the project.`,
        );
      }

      /*
       * Do not count xroga:verification-gate itself as executable
       * project evidence.
       *
       * This closes an important loophole:
       *
       *   synthetic policy check passes
       *   + no compiler/build/test ever ran
       *   => must NOT complete
       */
      if (
        substantivePassedChecks
          .length ===
          0 &&
        failedChecks.length ===
          0 &&
        unfinishedChecks.length ===
          0 &&
        skippedChecks.length ===
          0
      ) {
        blockers.push(
          'No required project check produced successful verification evidence.',
        );
      }
    }
  }

  /*
   * Required Preview remains independent evidence.
   *
   * Deferring the no-test policy gate does NOT make a web project
   * complete. The real browser/runtime verifier must still pass.
   */
  if (
    previewRequirement ===
    'required'
  ) {
    const preview =
      evidence.preview;

    if (
      !preview
    ) {
      blockers.push(
        'A verified Preview is required but no browser verification evidence exists.',
      );
    } else if (
      preview.status !==
      'passed'
    ) {
      blockers.push(
        preview.blocker
          ?.trim() ||
          (
            preview.status ===
            'not_checked'
              ? 'Browser verification did not run for this web project.'
              : 'Browser verification did not pass.'
          ),
      );
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
      blockers.length ===
      0,

    blockers,
  };
}
