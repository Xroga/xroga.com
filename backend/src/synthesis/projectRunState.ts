export const PROJECT_RUN_STATE_SCHEMA_VERSION =
  '1.0.0' as const;

export type ProjectLifecycleStatus =
  | 'not_started'
  | 'running'
  | 'succeeded'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'not_requested';

export interface ProjectLifecyclePhase {
  readonly status:
    ProjectLifecycleStatus;

  readonly detail:
    string | null;
}

export interface ProjectRunState {
  readonly schemaVersion:
    typeof PROJECT_RUN_STATE_SCHEMA_VERSION;

  readonly planning:
    ProjectLifecyclePhase;

  readonly implementation:
    ProjectLifecyclePhase;

  readonly runtime:
    ProjectLifecyclePhase;

  readonly verification:
    ProjectLifecyclePhase;

  readonly persistence:
    ProjectLifecyclePhase;

  readonly publication:
    ProjectLifecyclePhase;

  readonly deployment:
    ProjectLifecyclePhase;
}

export interface ProjectRunObservation {
  readonly outcome: string;
  readonly phaseReached: string;
  readonly verified: boolean;
  readonly fileCount: number;
  readonly commitSha: string | null;
  readonly reason: string;
  readonly blockers:
    readonly string[];

  readonly publicationRequested:
    boolean;

  readonly deploymentRequested:
    boolean;
}

const PHASE_ORDER:
  Readonly<
    Record<
      string,
      number
    >
  > = {
  routing: 0,
  spec: 1,
  architecture: 2,
  security: 3,
  planning: 4,
  implementation: 5,
  validation: 6,
  repair: 7,
  review: 8,
  commit: 9,
  complete: 10,
};

function reached(
  current: string,
  target: string,
): boolean {
  const currentRank =
    PHASE_ORDER[current] ??
    -1;

  const targetRank =
    PHASE_ORDER[target] ??
    Number.MAX_SAFE_INTEGER;

  return (
    currentRank >=
    targetRank
  );
}

function phase(
  status: ProjectLifecycleStatus,
  detail?: string | null,
): ProjectLifecyclePhase {
  return {
    status,
    detail:
      detail?.trim() ||
      null,
  };
}

export function projectRunTransportSucceeded(
  outcome: string,
): boolean {
  return (
    outcome ===
    'completed'
  );
}

export function deriveProjectRunState(
  input: ProjectRunObservation,
): ProjectRunState {
  const failed =
    input.outcome ===
    'failed';

  const blocked =
    input.outcome ===
      'blocked' ||
    input.outcome ===
      'refused';

  const planning =
    reached(
      input.phaseReached,
      'planning',
    ) ||
    input.fileCount > 0
      ? phase(
          'succeeded',
          'Engineering planning completed.',
        )
      : blocked
        ? phase(
            'blocked',
            input.reason,
          )
        : failed
          ? phase(
              'failed',
              input.reason,
            )
          : phase(
              'not_started',
            );

  const implementation =
    input.fileCount > 0
      ? phase(
          'succeeded',
          `${input.fileCount} project file(s) are available in the resulting workspace.`,
        )
      : input.phaseReached ===
          'implementation' &&
        (
          failed ||
          input.outcome ===
            'fell_back_to_legacy'
        )
        ? phase(
            'failed',
            input.reason,
          )
        : input.phaseReached ===
            'implementation' &&
          blocked
          ? phase(
              'blocked',
              input.reason,
            )
          : phase(
              'not_started',
            );

  const verification =
    input.verified
      ? phase(
          'succeeded',
          'Required verification evidence passed.',
        )
      : reached(
          input.phaseReached,
          'validation',
        )
        ? failed
          ? phase(
              'failed',
              input.reason,
            )
          : phase(
              'blocked',
              input.reason,
            )
        : phase(
            'not_started',
          );

  const persistence =
    input.fileCount > 0
      ? phase(
          'succeeded',
          'A complete project workspace snapshot is available.',
        )
      : phase(
          'not_started',
        );

  const publication =
    input.commitSha
      ? phase(
          'succeeded',
          `Published commit ${input.commitSha}.`,
        )
      : !input
          .publicationRequested
        ? phase(
            'not_requested',
          )
        : input.phaseReached ===
              'commit' &&
            failed
          ? phase(
              'failed',
              input.reason,
            )
          : input.outcome ===
              'completed'
            ? phase(
                'blocked',
                'Implementation completed but no publication commit was recorded.',
              )
            : phase(
                'not_started',
              );

  const deployment =
    input.deploymentRequested
      ? phase(
          'not_started',
          'Deployment is requested but remains a separate delivery stage.',
        )
      : phase(
          'not_requested',
        );

  return {
    schemaVersion:
      PROJECT_RUN_STATE_SCHEMA_VERSION,

    planning,

    implementation,

    /**
     * Step 3 introduces the persistent Xroga runtime.
     */
    runtime:
      phase(
        'not_requested',
      ),

    verification,

    persistence,

    publication,

    deployment,
  };
}
