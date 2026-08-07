/**
 * The frontend half of the one verification lifecycle.
 *
 * The frontend and backend are separate npm workspaces with no shared package, so this
 * mirrors `backend/src/ai/verificationLifecycle.ts` rather than importing it. That
 * duplication is only safe if it cannot drift, so `verificationLifecycle.parity.test.ts`
 * reads the backend source and asserts the two state lists are identical, in the same
 * order. If somebody adds a state on one side only, that test fails.
 */

export const VERIFICATION_STATES = [
  'generated_unverified',
  'testing',
  'repairing',
  'verified',
  'repository_written',
  'deployment_pending',
  'deployed',
  'production_verified',
  'blocked',
  'failed',
] as const;

export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const SUCCESS_STATES: readonly VerificationState[] = [
  'verified',
  'repository_written',
  'deployed',
  'production_verified',
];

export function isVerificationState(value: unknown): value is VerificationState {
  return typeof value === 'string' && (VERIFICATION_STATES as readonly string[]).includes(value);
}

export function isSuccessState(value: unknown): boolean {
  return isVerificationState(value) && SUCCESS_STATES.includes(value);
}

/**
 * What the user is told, per state.
 *
 * `generated_unverified` is the state a preview is shown in, and its label has to say so.
 * A preview appearing quickly is good; a preview implying the build passed is the defect
 * this lifecycle exists to remove.
 */
export function verificationLabel(state: VerificationState): string {
  switch (state) {
    case 'generated_unverified':
      return 'Generated — not verified yet';
    case 'testing':
      return 'Running checks';
    case 'repairing':
      return 'Repairing';
    case 'verified':
      return 'Checks passed';
    case 'repository_written':
      return 'Committed to your repository';
    case 'deployment_pending':
      return 'Deploying';
    case 'deployed':
      return 'Deployed — live check pending';
    case 'production_verified':
      return 'Live and verified';
    case 'blocked':
      return 'Blocked';
    case 'failed':
      return 'Failed';
  }
}

/** True only when the state itself says the product is running and was checked. */
export function isProductionVerified(value: unknown): boolean {
  return value === 'production_verified';
}
