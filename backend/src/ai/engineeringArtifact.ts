/**
 * The engineering artifact — one typed, versioned result for a real engineering run.
 *
 * ## The defect this closes
 *
 * The universal path builds a rich result — outcome, phase, verification, blockers, a file
 * manifest, a commit SHA, evidence — and returns it with **no `type` field**. Every frontend
 * renderer keys off `output.type`, so `FeatureOutputView` falls off the end of its branch list
 * and renders nothing, and `swarmOutputToText` falls through to the literal string
 * `"Swarm task complete."`. Real backend work, invisible to the user.
 *
 * ## Why a version number
 *
 * This crosses a process boundary and gets persisted. A run stored today may be rendered by a
 * frontend deployed next month, so the shape needs to say what it is. `artifactVersion` lets a
 * renderer decline politely rather than mis-render a shape it does not understand — which, for
 * a result that reports whether someone's code was verified, is the difference between "I
 * cannot show this" and a confident wrong answer.
 *
 * ## Why both success and failure use one type
 *
 * A blocked run carries *more* information a user needs than a successful one: which phase
 * failed, what the blocker was, whether files were written, whether a commit exists. Modelling
 * failure as a separate type invites a renderer that handles one and forgets the other, which
 * is exactly how "The persisted build failed." came to replace a result containing real
 * blockers and a real commit SHA.
 *
 * ## Size discipline
 *
 * This travels over SSE. It carries a file *manifest* — paths, and change counts where known —
 * never file contents. The repository and the sandbox remain authoritative for source. A
 * result that inlined the project would work in testing and fail on the first real build.
 */

export const ENGINEERING_ARTIFACT_TYPE = 'engineering_artifact' as const;
export const ENGINEERING_ARTIFACT_VERSION = 1 as const;

/** Terminal state of the run, from the system's point of view rather than the model's. */
export type ArtifactStatus = 'verified' | 'blocked' | 'failed';

export interface ArtifactFileEntry {
  readonly path: string;
  /** Present when the run knows it; absent is honest, zero would not be. */
  readonly added?: number;
  readonly removed?: number;
  readonly action?: 'created' | 'modified' | 'deleted';
}

export interface ArtifactRepository {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly baseBranch?: string;
  readonly commitSha?: string | null;
  readonly commitVerified?: boolean;
  readonly pullRequestUrl?: string | null;
}

export interface ArtifactVerification {
  readonly phase: string;
  readonly statement: string;
  readonly detail: string;
}

/**
 * Browser verification evidence, when a web project was checked.
 *
 * Added in artifactVersion 1 as an *optional* field rather than a version bump. A v1 consumer
 * that has never heard of it ignores it and renders exactly as before; a newer one shows it.
 * Bumping the version would make every existing renderer decline the artifact entirely, which
 * would reintroduce the blank-result defect PR #567 just fixed.
 */
export interface ArtifactBrowserVerification {
  /** 'passed' | 'failed' | 'not_checked'. Never collapse not_checked into passed. */
  readonly status: string;
  readonly url?: string | null;
  /** Present when the check did not run — the specific reason, for the user. */
  readonly notCheckedReason?: string | null;
  readonly blocker?: string | null;
  /** Rungs that actually passed: build, http, dom, page_errors, … */
  readonly passedChecks?: readonly string[];
  readonly findings?: readonly string[];
  /** Acceptance criteria that were never executed. Never counted as satisfied. */
  readonly criteriaNotChecked?: readonly string[];
  readonly screenshots?: readonly string[];
}

export interface ArtifactPreview {
  readonly url?: string | null;
  readonly verified?: boolean;
}

/**
 * Declared as a type alias rather than an interface deliberately.
 *
 * TypeScript gives object *type aliases* an implicit index signature and interfaces none, so
 * only this form is assignable to `Record<string, unknown>` — which is what the run store
 * persists and what every existing accessor reads. As an interface it would compile here and
 * fail at every storage boundary, forcing callers to spread it into a plain object and lose
 * the type at exactly the point where knowing it matters.
 */
export type EngineeringArtifact = {
  readonly type: typeof ENGINEERING_ARTIFACT_TYPE;
  readonly artifactVersion: typeof ENGINEERING_ARTIFACT_VERSION;

  /** One sentence a human can read without decoding the rest. Never a model's self-report. */
  readonly summary: string;
  readonly status: ArtifactStatus;
  /**
   * The system's verification verdict.
   *
   * Deliberately separate from `status`: a run can complete without being verified, and the
   * two must not be collapsed. `verified: true` is only ever set from deterministic evidence.
   */
  readonly verified: boolean;
  readonly outcome: string;
  readonly phaseReached: string;
  readonly reason: string;
  readonly blockers: readonly string[];

  readonly files: readonly ArtifactFileEntry[];
  readonly fileCount: number;
  readonly repository: ArtifactRepository | null;
  readonly commitSha: string | null;
  readonly verificationEvidence: readonly ArtifactVerification[];
  readonly preview: ArtifactPreview | null;

  /** What the user can usefully do next. Empty when there is nothing honest to suggest. */
  readonly nextAction: string | null;
  /** Optional; absent on runs with no browser surface. See `ArtifactBrowserVerification`. */
  readonly browserVerification?: ArtifactBrowserVerification;
};

/** The shape `pipeline.ts` already produces for a universal run. */
export interface UniversalOutputLike {
  readonly outcome?: unknown;
  readonly phaseReached?: unknown;
  readonly verified?: unknown;
  readonly reason?: unknown;
  readonly blockers?: unknown;
  readonly commitSha?: unknown;
  readonly files?: unknown;
  readonly evidence?: unknown;
  readonly repository?: unknown;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/**
 * The status, decided from evidence rather than from the outcome word alone.
 *
 * `outcome: 'completed'` with `verified: false` is *not* success — that combination is exactly
 * the "a model said done" case this whole subsystem exists to refuse. It reports `blocked`,
 * because work happened and something is missing, which is what the user needs to know.
 */
export function artifactStatusFor(outcome: string, verified: boolean, fileCount: number): ArtifactStatus {
  if (outcome === 'completed' && verified) return 'verified';
  // Nothing was produced and nothing ran — a failure before work, not a blocked run.
  if (fileCount === 0 && (outcome === 'refused' || outcome === 'failed' || outcome === 'not_selected')) {
    return 'failed';
  }
  return 'blocked';
}

/**
 * A summary a user can act on.
 *
 * Written from the facts rather than from any model's description of its own work, because the
 * whole point of the artifact is that the system reports the outcome, not the model.
 */
export function artifactSummary(input: {
  status: ArtifactStatus;
  fileCount: number;
  commitSha: string | null;
  blockers: readonly string[];
  phaseReached: string;
  reason: string;
}): string {
  const files = input.fileCount === 1 ? '1 file' : `${input.fileCount} files`;
  if (input.status === 'verified') {
    const commit = input.commitSha ? `, committed as ${input.commitSha.slice(0, 7)}` : '';
    return `Verified. ${files} changed${commit}.`;
  }
  if (input.status === 'blocked') {
    const blocker = input.blockers[0] ?? input.reason ?? 'verification did not complete';
    const produced = input.fileCount > 0 ? `${files} were produced, but ` : '';
    return `Blocked at ${input.phaseReached}. ${produced}${blocker}`;
  }
  return `Did not produce changes. ${input.reason || 'The run stopped before implementation.'}`;
}

/**
 * What to tell the user to do next.
 *
 * Returns null rather than inventing advice. A suggestion that does not follow from the
 * evidence is worse than none: it sends someone to look in the wrong place.
 */
export function artifactNextAction(status: ArtifactStatus, phaseReached: string, commitSha: string | null): string | null {
  if (status === 'verified') {
    return commitSha ? 'Review the commit, then deploy when ready.' : null;
  }
  if (status === 'failed') return 'Try again with more detail about what you want built.';
  switch (phaseReached) {
    case 'validation':
    case 'repair':
      return 'The generated code did not pass validation. Review the blockers below, or ask for a fix.';
    case 'commit':
      return 'The work completed but could not be published. Check the connected repository.';
    case 'review':
      return 'Review flagged findings that need a decision before this can be published.';
    default:
      return 'Review the blockers below and refine the request.';
  }
}

/**
 * Builds the artifact from a universal run's output.
 *
 * Total over the input: every field is defensively read, because this runs at the end of a
 * build and throwing here would replace a recoverable partial result with no result at all.
 */
export function buildEngineeringArtifact(output: UniversalOutputLike, extras: {
  previewUrl?: string | null;
  previewVerified?: boolean;
  browserVerification?: ArtifactBrowserVerification;
} = {}): EngineeringArtifact {
  const outcome = asString(output.outcome, 'unknown');
  const phaseReached = asString(output.phaseReached, 'unknown');
  const verified = output.verified === true;
  const reason = asString(output.reason);
  const blockers = asStringArray(output.blockers);
  const commitSha = typeof output.commitSha === 'string' ? output.commitSha : null;

  const files: ArtifactFileEntry[] = Array.isArray(output.files)
    ? output.files
        .map((file): ArtifactFileEntry | null => {
          if (typeof file === 'string') return { path: file };
          if (file && typeof file === 'object' && typeof (file as { path?: unknown }).path === 'string') {
            const entry = file as { path: string; added?: unknown; removed?: unknown; action?: unknown };
            return {
              path: entry.path,
              ...(typeof entry.added === 'number' ? { added: entry.added } : {}),
              ...(typeof entry.removed === 'number' ? { removed: entry.removed } : {}),
              ...(entry.action === 'created' || entry.action === 'modified' || entry.action === 'deleted'
                ? { action: entry.action }
                : {}),
            };
          }
          return null;
        })
        .filter((entry): entry is ArtifactFileEntry => entry !== null)
    : [];

  const evidence: ArtifactVerification[] = Array.isArray(output.evidence)
    ? output.evidence
        .map((item): ArtifactVerification | null => {
          if (!item || typeof item !== 'object') return null;
          const record = item as { phase?: unknown; statement?: unknown; detail?: unknown };
          if (typeof record.statement !== 'string') return null;
          return {
            phase: asString(record.phase, 'unknown'),
            statement: record.statement,
            detail: asString(record.detail),
          };
        })
        .filter((item): item is ArtifactVerification => item !== null)
    : [];

  let repository: ArtifactRepository | null = null;
  const repoRecord = output.repository;
  if (repoRecord && typeof repoRecord === 'object') {
    const record = repoRecord as Record<string, unknown>;
    if (typeof record.owner === 'string' && typeof record.repo === 'string') {
      repository = {
        owner: record.owner,
        repo: record.repo,
        branch: asString(record.branch, 'main'),
        ...(typeof record.baseBranch === 'string' ? { baseBranch: record.baseBranch } : {}),
        commitSha: typeof record.resultingCommitSha === 'string' ? record.resultingCommitSha : commitSha,
        commitVerified: record.verified === true,
        ...(record.pullRequest && typeof record.pullRequest === 'object'
          ? { pullRequestUrl: asString((record.pullRequest as { url?: unknown }).url) || null }
          : {}),
      };
    }
  }

  const status = artifactStatusFor(outcome, verified, files.length);

  return {
    type: ENGINEERING_ARTIFACT_TYPE,
    artifactVersion: ENGINEERING_ARTIFACT_VERSION,
    summary: artifactSummary({ status, fileCount: files.length, commitSha, blockers, phaseReached, reason }),
    status,
    verified,
    outcome,
    phaseReached,
    reason,
    blockers,
    files,
    fileCount: files.length,
    repository,
    commitSha,
    verificationEvidence: evidence,
    preview:
      extras.previewUrl || extras.previewVerified !== undefined
        ? { url: extras.previewUrl ?? null, verified: extras.previewVerified === true }
        : null,
    nextAction: artifactNextAction(status, phaseReached, commitSha),
    ...(extras.browserVerification ? { browserVerification: extras.browserVerification } : {}),
  };
}

export function isEngineeringArtifact(value: unknown): value is EngineeringArtifact {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === ENGINEERING_ARTIFACT_TYPE &&
    typeof (value as { artifactVersion?: unknown }).artifactVersion === 'number'
  );
}
