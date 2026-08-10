/**
 * Capability maturity.
 *
 * §23 requires every coding role, language, framework, product type, ProductSurface,
 * runtime adapter, integration and deployment adapter to carry one maturity state, and it
 * fixes the direction of travel: a capability may become `verified` only when a list of
 * concrete things are all true. Universal architecture means Xroga can extend to new
 * product types; it does not mean they are already verified.
 *
 * The reason this is a module and not a field: the failure it prevents is optimistic
 * self-assessment. Infrastructure existing is not the same as a capability working, and
 * "we built the adapter" reads very close to "the adapter is verified" if nothing forces
 * the distinction. So `verified` is not assignable — it is *derived* from gate evidence,
 * and every gate must be independently satisfied. A caller cannot pass `verified` in.
 *
 * Degraded is deliberately separate from experimental. A capability that used to work and
 * has started failing is a different operational situation from one that was never proven,
 * and collapsing them loses the fact that something regressed.
 */

/** §23's five states, ordered from least to most proven. `degraded` sits outside the order. */
export type MaturityState = 'unsupported' | 'experimental' | 'beta' | 'verified' | 'degraded';

/** What a maturity record describes. Open-ended per §23 and the ProductSurface mandate. */
export type CapabilityKind =
  | 'coding_role'
  | 'language'
  | 'framework'
  | 'product_type'
  | 'product_surface'
  | 'runtime_adapter'
  | 'integration'
  | 'deployment_adapter';

/**
 * The gates §23 lists for `verified`.
 *
 * Every field is a fact someone can check, not a judgement. `benchmarkThresholdsPass` and
 * `securityTestsPass` are separated from `requiredBenchmarksExist` because having a
 * benchmark and passing it are different claims, and the gap between them is exactly where
 * an unearned `verified` would appear.
 */
export interface MaturityGates {
  readonly runtimeAdapterExists: boolean;
  readonly sandboxCanExecute: boolean;
  readonly buildAndTestCommandsKnown: boolean;
  readonly requiredBenchmarksExist: boolean;
  readonly benchmarkThresholdsPass: boolean;
  readonly securityTestsPass: boolean;
  readonly productionMonitoringExists: boolean;
  readonly rollbackExists: boolean;
}

export const VERIFICATION_GATES: readonly (keyof MaturityGates)[] = [
  'runtimeAdapterExists',
  'sandboxCanExecute',
  'buildAndTestCommandsKnown',
  'requiredBenchmarksExist',
  'benchmarkThresholdsPass',
  'securityTestsPass',
  'productionMonitoringExists',
  'rollbackExists',
];

export const NO_GATES: MaturityGates = {
  runtimeAdapterExists: false,
  sandboxCanExecute: false,
  buildAndTestCommandsKnown: false,
  requiredBenchmarksExist: false,
  benchmarkThresholdsPass: false,
  securityTestsPass: false,
  productionMonitoringExists: false,
  rollbackExists: false,
};

/** Observed production behaviour, which can pull a proven capability back down. */
export interface MaturityObservations {
  /** Completed attempts in the current window. */
  readonly samples: number;
  /** Fraction of attempts whose executable validation passed, 0–1. */
  readonly validationSuccessRate: number;
}

/** Below this, a capability that had reached beta or verified is reported as degraded. */
export const DEGRADED_SUCCESS_RATE = 0.6;

/** Minimum samples before observations may downgrade anything. */
export const MIN_SAMPLES_FOR_DEGRADATION = 5;

export interface MaturityRecord {
  readonly kind: CapabilityKind;
  /** e.g. `rust`, `cli`, `implementation`, `vercel`. */
  readonly identifier: string;
  readonly state: MaturityState;
  /** Which gates are satisfied, so a reader can see the distance to `verified`. */
  readonly gates: MaturityGates;
  readonly unmetGates: readonly (keyof MaturityGates)[];
  readonly observations: MaturityObservations | null;
  /** Plain statement of why this state and not another. */
  readonly reason: string;
  readonly assessedAt: string;
}

export interface MaturityInput {
  readonly kind: CapabilityKind;
  readonly identifier: string;
  readonly gates?: Partial<MaturityGates>;
  readonly observations?: MaturityObservations | null;
}

function resolveGates(partial: Partial<MaturityGates> | undefined): MaturityGates {
  return { ...NO_GATES, ...(partial ?? {}) };
}

/**
 * Derives maturity from evidence.
 *
 * There is deliberately no way to assert a state directly. `verified` requires every gate;
 * `beta` requires a capability that can actually be executed and measured; `experimental`
 * means it can be attempted; `unsupported` means it cannot. Degradation overrides an
 * earned state, because current behaviour outranks a past assessment.
 */
export function assessMaturity(input: MaturityInput): MaturityRecord {
  const gates = resolveGates(input.gates);
  const unmetGates = VERIFICATION_GATES.filter((gate) => !gates[gate]);
  const observations = input.observations ?? null;
  const assessedAt = new Date().toISOString();

  const base = (): { state: MaturityState; reason: string } => {
    if (!gates.runtimeAdapterExists) {
      return {
        state: 'unsupported',
        reason: 'No runtime adapter exists, so this capability cannot be attempted at all.',
      };
    }
    if (!gates.sandboxCanExecute || !gates.buildAndTestCommandsKnown) {
      // An adapter without an executable sandbox or known commands can be tried, but no
      // claim about the result can be checked — which is the definition of experimental.
      return {
        state: 'experimental',
        reason:
          'A runtime adapter exists, but the capability cannot yet be executed and measured: ' +
          `${!gates.sandboxCanExecute ? 'the sandbox cannot run it' : 'build and test commands are unknown'}.`,
      };
    }
    if (unmetGates.length === 0) {
      return { state: 'verified', reason: 'Every verification gate is satisfied by evidence.' };
    }
    return {
      state: 'beta',
      reason: `Executable and measured, but not verified: ${unmetGates.join(', ')} outstanding.`,
    };
  };

  const { state, reason } = base();

  // Degradation applies only to states that were earned. Calling an experimental capability
  // "degraded" because it failed would misreport a thing that was never claimed to work.
  const eligibleForDegradation = state === 'verified' || state === 'beta';
  if (
    eligibleForDegradation &&
    observations &&
    observations.samples >= MIN_SAMPLES_FOR_DEGRADATION &&
    observations.validationSuccessRate < DEGRADED_SUCCESS_RATE
  ) {
    return {
      kind: input.kind,
      identifier: input.identifier,
      state: 'degraded',
      gates,
      unmetGates,
      observations,
      reason:
        `Previously ${state}, but ${Math.round(observations.validationSuccessRate * 100)}% ` +
        `validation success over ${observations.samples} samples is below the ` +
        `${Math.round(DEGRADED_SUCCESS_RATE * 100)}% floor. Current behaviour outranks the earlier assessment.`,
      assessedAt,
    };
  }

  return { kind: input.kind, identifier: input.identifier, state, gates, unmetGates, observations, reason, assessedAt };
}

/** Whether a capability may be offered to a user without an explicit caveat. */
export function isOfferable(record: MaturityRecord): boolean {
  return record.state === 'verified' || record.state === 'beta';
}

/**
 * A sentence a user or operator can act on.
 *
 * Kept next to the assessment so the wording cannot drift from the state, which is how an
 * `experimental` capability ends up described as working.
 */
export function describeMaturity(record: MaturityRecord): string {
  switch (record.state) {
    case 'verified':
      return `${record.identifier} is verified: every gate is satisfied by evidence.`;
    case 'beta':
      return `${record.identifier} is beta — it runs and is measured, but ${record.unmetGates.length} gate(s) remain: ${record.unmetGates.join(', ')}.`;
    case 'experimental':
      return `${record.identifier} is experimental. It may be attempted, but no claim about the result can be checked yet.`;
    case 'degraded':
      return `${record.identifier} is degraded. ${record.reason}`;
    case 'unsupported':
      return `${record.identifier} is unsupported: ${record.reason}`;
  }
}
