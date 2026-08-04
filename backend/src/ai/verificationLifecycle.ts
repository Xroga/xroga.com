/**
 * The one verification lifecycle.
 *
 * Before this existed there was no shared vocabulary at all. The pipeline emitted a
 * preview payload carrying `buildOk: true` immediately after the builder responded —
 * before anything installed, compiled, typechecked or ran — and the frontend had no way
 * to tell that apart from a build that had actually passed. "Generated" and "verified"
 * were the same word.
 *
 * The states below are ordered by how much evidence they require, and the transition
 * table is deliberately narrow. Two rules do the real work:
 *
 *   - You cannot reach `verified` without passing through `testing`. There is no edge
 *     that lets generation alone claim verification.
 *   - You cannot reach `deployed` or `production_verified` without `repository_written`
 *     first. Code that was never written cannot have been deployed.
 *
 * `blocked` and `failed` are reachable from anywhere, because anything can fail. Nothing
 * is reachable *from* `production_verified` except a new run.
 */

export const VERIFICATION_STATES = [
  /** Files exist. Nothing has been run against them. This is what a preview shows. */
  'generated_unverified',
  /** Executable checks are in progress. */
  'testing',
  /** A check failed and a repair attempt is running. */
  'repairing',
  /** Every applicable executable check passed. */
  'verified',
  /** The verified result reached the user's repository as a real commit. */
  'repository_written',
  /** A deployment was requested and has not yet reported an outcome. */
  'deployment_pending',
  /** A deployment reported success. The running product has not been checked. */
  'deployed',
  /** The deployed product was checked live and answered correctly. */
  'production_verified',
  /** Progress stopped on something outside this run — approval, credentials, quota. */
  'blocked',
  /** Progress stopped on a defect in the work itself. */
  'failed',
] as const;

export type VerificationState = (typeof VERIFICATION_STATES)[number];

/** States that mean the run is over. */
export const TERMINAL_STATES: readonly VerificationState[] = ['production_verified', 'blocked', 'failed'];

/**
 * States a user-facing surface may describe as success.
 *
 * Deliberately short. "Generated", "accepted", "preview available" and "files extracted"
 * are not on it and must never be treated as synonyms for these.
 */
export const SUCCESS_STATES: readonly VerificationState[] = [
  'verified',
  'repository_written',
  'deployed',
  'production_verified',
];

/**
 * The complete set of legal moves.
 *
 * Anything not listed is rejected. In particular there is no `generated_unverified ->
 * verified` edge and no `verified -> deployed` edge that skips `repository_written`.
 */
const ALLOWED: Record<VerificationState, readonly VerificationState[]> = {
  generated_unverified: ['testing', 'blocked', 'failed'],
  testing: ['verified', 'repairing', 'blocked', 'failed'],
  // A repair produces new files, which are unverified again until re-tested.
  repairing: ['generated_unverified', 'testing', 'blocked', 'failed'],
  verified: ['repository_written', 'blocked', 'failed'],
  repository_written: ['deployment_pending', 'blocked', 'failed'],
  deployment_pending: ['deployed', 'blocked', 'failed'],
  deployed: ['production_verified', 'blocked', 'failed'],
  production_verified: [],
  blocked: [],
  failed: [],
};

export type TransitionRejection =
  | 'unknown_state'
  | 'terminal_state'
  | 'not_allowed'
  | 'missing_evidence';

export interface TransitionVerdict {
  ok: boolean;
  rejection?: TransitionRejection;
  detail?: string;
}

export function isVerificationState(value: unknown): value is VerificationState {
  return typeof value === 'string' && (VERIFICATION_STATES as readonly string[]).includes(value);
}

/**
 * States that may only be entered with evidence attached.
 *
 * A caller claiming one of these without a single piece of evidence is claiming an
 * outcome it cannot show, which is the failure mode section 11 exists to prevent.
 */
const REQUIRES_EVIDENCE: readonly VerificationState[] = [
  'verified',
  'repository_written',
  'deployed',
  'production_verified',
];

export function canTransition(
  from: VerificationState,
  to: VerificationState,
  input: { evidenceCount?: number } = {},
): TransitionVerdict {
  if (!isVerificationState(from) || !isVerificationState(to)) {
    return { ok: false, rejection: 'unknown_state', detail: `"${String(to)}" is not a verification state.` };
  }
  if (TERMINAL_STATES.includes(from)) {
    return {
      ok: false,
      rejection: 'terminal_state',
      detail: `${from} is terminal; start a new run rather than transitioning out of it.`,
    };
  }
  if (!ALLOWED[from].includes(to)) {
    return {
      ok: false,
      rejection: 'not_allowed',
      detail: `${from} -> ${to} is not a legal transition. Legal moves from ${from}: ${ALLOWED[from].join(', ') || 'none'}.`,
    };
  }
  if (REQUIRES_EVIDENCE.includes(to) && !(input.evidenceCount && input.evidenceCount > 0)) {
    return {
      ok: false,
      rejection: 'missing_evidence',
      detail: `${to} may only be entered with evidence; none was supplied.`,
    };
  }
  return { ok: true };
}

export class InvalidVerificationTransitionError extends Error {
  readonly code = 'INVALID_VERIFICATION_TRANSITION' as const;
  readonly rejection: TransitionRejection;

  constructor(from: VerificationState, to: VerificationState, verdict: TransitionVerdict) {
    super(verdict.detail ?? `${from} -> ${to} is not a legal transition.`);
    this.name = 'InvalidVerificationTransitionError';
    this.rejection = verdict.rejection ?? 'not_allowed';
  }
}

export function assertTransition(
  from: VerificationState,
  to: VerificationState,
  input: { evidenceCount?: number } = {},
): void {
  const verdict = canTransition(from, to, input);
  if (!verdict.ok) throw new InvalidVerificationTransitionError(from, to, verdict);
}

/** Words a surface must never treat as a successful state. */
export const FORBIDDEN_SUCCESS_SYNONYMS: readonly string[] = [
  'generated',
  'accepted',
  'preview available',
  'files extracted',
];

export function isSuccessState(value: unknown): boolean {
  return isVerificationState(value) && SUCCESS_STATES.includes(value);
}

/** One plain sentence per state, for the run transcript and the UI. */
export function describeVerificationState(state: VerificationState): string {
  switch (state) {
    case 'generated_unverified':
      return 'Code generated. Not verified — nothing has been installed, compiled or run against it yet.';
    case 'testing':
      return 'Running checks against the generated code.';
    case 'repairing':
      return 'A check failed. Repairing.';
    case 'verified':
      return 'Every applicable check passed.';
    case 'repository_written':
      return 'The verified result was committed to the repository.';
    case 'deployment_pending':
      return 'Deployment requested. No outcome reported yet.';
    case 'deployed':
      return 'Deployment reported success. The live product has not been checked.';
    case 'production_verified':
      return 'The live product was checked and answered correctly.';
    case 'blocked':
      return 'Stopped on something outside this run.';
    case 'failed':
      return 'Stopped on a defect in the work.';
  }
}
