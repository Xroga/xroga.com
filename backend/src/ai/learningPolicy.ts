export const LEARNING_RULE_VERSION =
  '1.1.0' as const;

/**
 * Step 7 learning is advisory. This switch must be able to restore the exact
 * deterministic pre-learning ordering without disabling builds.
 */
export function isLearningEnabled(
  env:
    NodeJS.ProcessEnv =
    process.env,
): boolean {
  const value =
    env
      .XROGA_LEARNING_ENABLED
      ?.trim()
      .toLowerCase();

  if (
    !value
  ) {
    return true;
  }

  return ![
    '0',
    'false',
    'off',
    'disabled',
    'no',
  ].includes(
    value,
  );
}

/**
 * Durable BuildOutcome rows are useful for evaluation, but they are not an
 * indefinite user-history archive. Selection uses much tighter windows; this
 * longer bound is only for aggregate engineering evaluation.
 */
export const BUILD_OUTCOME_RETENTION_MS =
  180 *
  24 *
  60 *
  60 *
  1000;
