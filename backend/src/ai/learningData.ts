/**
 * Learning-data governance.
 *
 * §25 opens by rejecting a habit rather than describing a feature: do not call every stored
 * outcome "training data". The five kinds below are separated because they carry different
 * permissions and different consequences. Routing data changes which model gets picked
 * tomorrow. Fine-tuning data may leave the system entirely and be absorbed by a provider.
 * Treating them as one bucket is how a customer's private repository ends up in a training
 * corpus because someone reached for the nearest table.
 *
 * The gate is deliberately unforgiving. §29C requires that a failed benchmark can never
 * become successful learning data, and the failure it guards against is subtle: a run that
 * produced plausible code, read well, and did not pass its tests is exactly the run most
 * likely to be captured by a lenient filter — and exactly the one that teaches the wrong
 * lesson. So capture requires every condition, and "the model sounded confident" is not
 * among them.
 */

/**
 * The five kinds of §25, ordered by how far the data can travel.
 *
 * `fine_tuning` is last because it is the only one that may leave Xroga, and it therefore
 * carries the strictest requirements.
 */
export type LearningDataKind =
  | 'evaluation'
  | 'routing'
  | 'prompt_improvement'
  | 'skill_improvement'
  | 'fine_tuning';

export const LEARNING_DATA_KINDS: readonly LearningDataKind[] = [
  'evaluation',
  'routing',
  'prompt_improvement',
  'skill_improvement',
  'fine_tuning',
];

/**
 * Conditions §25 requires before an outcome may be reused.
 *
 * Every field is a fact about what happened, not a judgement about quality. There is no
 * "looked correct" — that is the assessment the gate exists to refuse.
 */
export interface CaptureConditions {
  readonly requiredTestsPassed: boolean;
  readonly acceptanceCriteriaPassed: boolean;
  readonly securityChecksPassed: boolean;
  /** The exact commit the outcome produced. Absent means the work was never published. */
  readonly commitSha: string | null;
  readonly secretsRemoved: boolean;
  readonly personalIdentifiersRemoved: boolean;
  readonly dataUsePermitted: boolean;
  readonly repositoryOwnershipVerified: boolean;
}

export const CAPTURE_REQUIREMENTS: readonly (keyof CaptureConditions)[] = [
  'requiredTestsPassed',
  'acceptanceCriteriaPassed',
  'securityChecksPassed',
  'secretsRemoved',
  'personalIdentifiersRemoved',
  'dataUsePermitted',
  'repositoryOwnershipVerified',
];

export interface CaptureDecision {
  readonly captured: boolean;
  /** Every condition that failed, so a caller can fix the cause rather than guess. */
  readonly unmet: readonly string[];
  readonly reason: string;
}

/**
 * Decides whether an outcome may become a reusable example.
 *
 * Returns a decision rather than throwing: failing to capture is the ordinary case, not an
 * error, and most runs will not qualify. Throwing would push callers toward swallowing it.
 */
export function evaluateCapture(conditions: CaptureConditions): CaptureDecision {
  const unmet: string[] = CAPTURE_REQUIREMENTS.filter((key) => !conditions[key]).map(String);
  if (!conditions.commitSha) unmet.push('commitSha');

  if (unmet.length) {
    return {
      captured: false,
      unmet,
      reason:
        `Not reusable: ${unmet.join(', ')} ${unmet.length === 1 ? 'is' : 'are'} unsatisfied. ` +
        'An outcome that did not verifiably pass is not a successful example, however plausible it looks.',
    };
  }
  return {
    captured: true,
    unmet: [],
    reason: `Verified against commit ${conditions.commitSha}: tests, acceptance criteria and security all passed.`,
  };
}

export class LearningDataError extends Error {
  readonly code = 'LEARNING_DATA_REFUSED' as const;
  readonly unmet: readonly string[];
  constructor(message: string, unmet: readonly string[]) {
    super(message);
    this.name = 'LearningDataError';
    this.unmet = unmet;
  }
}

export interface LearningExample {
  readonly kind: LearningDataKind;
  /** What the example teaches: a plan, a decomposition, a patch, a repair pair. */
  readonly category: string;
  readonly commitSha: string;
  readonly recordedAt: string;
  readonly payload: unknown;
}

export interface CaptureRequest {
  readonly kind: LearningDataKind;
  readonly category: string;
  readonly conditions: CaptureConditions;
  readonly payload: unknown;
}

/**
 * Extra conditions for data that may leave Xroga.
 *
 * §26 is explicit that a private repository must never reach a provider for training
 * without informed authorization, so fine-tuning capture requires it as a distinct fact
 * rather than folding it into general data-use permission. The two are different consents:
 * "you may analyse this to improve routing" is not "you may send this to Moonshot".
 */
export interface FineTuningConsent {
  readonly explicitTrainingAuthorization: boolean;
  readonly repositoryIsPrivate: boolean;
}

/**
 * Captures an example, or refuses with the reasons.
 *
 * Throws here — unlike `evaluateCapture` — because a caller reaching this function has
 * already decided it wants the example stored. Returning a quiet null at that point invites
 * the failure to be ignored.
 */
export function captureExample(request: CaptureRequest, consent?: FineTuningConsent): LearningExample {
  const decision = evaluateCapture(request.conditions);
  if (!decision.captured) {
    throw new LearningDataError(`Refusing to capture ${request.kind} example: ${decision.reason}`, decision.unmet);
  }

  if (request.kind === 'fine_tuning') {
    if (!consent) {
      throw new LearningDataError(
        'Refusing to capture fine-tuning data without explicit consent facts. Data-use permission ' +
          'for analysis is not authorization to send a repository to a provider for training.',
        ['fineTuningConsent'],
      );
    }
    if (consent.repositoryIsPrivate && !consent.explicitTrainingAuthorization) {
      throw new LearningDataError(
        'Refusing to capture fine-tuning data from a private repository without explicit, informed ' +
          'training authorization from its owner.',
        ['explicitTrainingAuthorization'],
      );
    }
  }

  return {
    kind: request.kind,
    category: request.category,
    commitSha: request.conditions.commitSha!,
    recordedAt: new Date().toISOString(),
    payload: request.payload,
  };
}

/**
 * Whether a benchmark result may be reused as a successful example.
 *
 * §29C, stated as its own function because the mistake it prevents is one of convenience:
 * a benchmark row already carries a model, a prompt and an output, so it is the most
 * tempting thing in the system to feed back. A failed one teaches the wrong lesson, and a
 * passing one whose validation never ran teaches nothing that can be checked.
 */
export function benchmarkIsReusable(result: {
  readonly passed: boolean;
  readonly validationRan: boolean;
  readonly commitSha: string | null;
}): boolean {
  return result.passed && result.validationRan && Boolean(result.commitSha);
}
