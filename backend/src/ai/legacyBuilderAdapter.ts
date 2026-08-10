/**
 * The legacy whole-project builder, behind a flag.
 *
 * §5 is careful about this, and the care is warranted: the whole-project builder is what
 * almost every user currently receives. Deleting it before the canonical runtime can
 * implement would not be a migration, it would be removing the product. So it is wrapped
 * rather than removed, and the flag exists so the path can be turned *off* deliberately —
 * not so it can be turned on.
 *
 * Hence the default. `LEGACY_WHOLE_PROJECT_BUILDER_ENABLED` defaults to **enabled**, which
 * is the opposite of the usual convention for a new flag and is deliberate: an unset
 * variable in production must not disable the mechanism that currently builds every
 * project. A flag whose absence breaks production is not a safety control.
 *
 * The invariant this module exists to make explicit is §29B's: legacy and universal
 * implementation must never mutate the same run. Today that holds *structurally* —
 * `runBuildPipeline` returns as soon as `tryUniversalBuild` produces an outcome, so the
 * legacy builder below it is unreachable for that run. Structural guarantees are easy to
 * lose during a migration precisely because nothing states them, so `assertSingleImplementer`
 * states it and a test holds it.
 */

export type LegacyBuilderMode = 'enabled' | 'disabled';

/**
 * Reads the flag.
 *
 * Only an explicit, recognised disable turns it off. A typo leaves the builder running,
 * which is the safe direction here — the cost of a misread flag must be "nothing changed",
 * matching how `readUniversalAgentFlags` treats an unrecognised mode.
 */
export function readLegacyBuilderMode(env: NodeJS.ProcessEnv = process.env): LegacyBuilderMode {
  const raw = (env.LEGACY_WHOLE_PROJECT_BUILDER_ENABLED ?? '').trim().toLowerCase();
  if (raw === 'disabled' || raw === 'off' || raw === '0' || raw === 'false') return 'disabled';
  return 'enabled';
}

export function legacyBuilderEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return readLegacyBuilderMode(env) === 'enabled';
}

/** Why the legacy builder ran, so a run's record shows it was not an accident. */
export type LegacyBuilderReason =
  | 'universal_path_not_selected'
  | 'emergency_rollback'
  | 'approved_migration_fixture';

export class ImplementationConflictError extends Error {
  readonly code = 'IMPLEMENTATION_CONFLICT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ImplementationConflictError';
  }
}

export class LegacyBuilderDisabledError extends Error {
  readonly code = 'LEGACY_BUILDER_DISABLED' as const;
  constructor(message: string) {
    super(message);
    this.name = 'LegacyBuilderDisabledError';
  }
}

export interface ImplementationClaim {
  readonly runId: string;
  /** Which implementer is claiming this run. */
  readonly implementer: 'universal' | 'legacy';
}

/**
 * Refuses a second implementer for one run.
 *
 * §29B. The damaging case is not two implementers producing different code — it is two of
 * them writing to the same repository from the same run, where the second overwrites work
 * the first already validated and published, and the run's evidence describes neither.
 *
 * Takes the claims rather than reading global state so it is callable from the one place
 * that knows both, and so a test can construct the conflict directly instead of
 * reproducing a whole pipeline to provoke it.
 */
export function assertSingleImplementer(claims: readonly ImplementationClaim[]): void {
  const byRun = new Map<string, Set<string>>();
  for (const claim of claims) {
    const set = byRun.get(claim.runId) ?? new Set<string>();
    set.add(claim.implementer);
    byRun.set(claim.runId, set);
  }
  for (const [runId, implementers] of byRun) {
    if (implementers.size > 1) {
      throw new ImplementationConflictError(
        `Run ${runId} was claimed by both the universal and legacy implementers. ` +
          'One run has exactly one implementer; two would let the second overwrite work the ' +
          'first had already validated and published, leaving the run evidence describing neither.',
      );
    }
  }
}

/**
 * Guards entry to the legacy builder.
 *
 * Returns rather than throws when the flag is on, because the ordinary case is not an
 * error. Throws when the path is disabled, so a disabled builder produces a visible
 * refusal instead of an empty build that looks like a model failure.
 */
export function authorizeLegacyBuild(input: {
  runId: string;
  reason: LegacyBuilderReason;
  universalAlreadyImplemented: boolean;
  env?: NodeJS.ProcessEnv;
}): { authorized: true; reason: LegacyBuilderReason } {
  if (input.universalAlreadyImplemented) {
    throw new ImplementationConflictError(
      `Run ${input.runId} already has a universal implementation; the legacy builder must not ` +
        'also run for it.',
    );
  }
  if (!legacyBuilderEnabled(input.env)) {
    throw new LegacyBuilderDisabledError(
      `The legacy whole-project builder is disabled by LEGACY_WHOLE_PROJECT_BUILDER_ENABLED, ` +
        `and the canonical runtime did not implement run ${input.runId}. No implementation path ` +
        'is available, so this build is refused rather than reported as empty.',
    );
  }
  return { authorized: true, reason: input.reason };
}
