import type {
  GoalContract,
} from '../ai/universal/goalContract.js';

/**
 * Convert the validated semantic GoalContract into the text consumed by
 * deterministic product synthesis and Agent V2.
 *
 * The latest chat message alone is not authoritative.
 *
 * Example:
 *
 * user: build a landing page named Jhon Mix
 * assistant: ...
 * user: finish that
 *
 * The semantic interpreter can resolve "that" into the actual software
 * goal. Downstream synthesis must consume that resolved goal rather than
 * reparsing the literal words "finish that".
 */
export function semanticExecutionPrompt(
  goal:
    GoalContract,

  originalMessage:
    string,
): string {
  const resolvedGoal =
    goal.goal
      .trim() ||
    originalMessage
      .trim();

  const desiredOutcome =
    goal.desiredOutcome
      .trim();

  const sections:
    string[] = [
      resolvedGoal,
  ];

  if (
    desiredOutcome &&
    desiredOutcome !==
      resolvedGoal
  ) {
    sections.push(
      `Desired outcome:\n${desiredOutcome}`,
    );
  }

  if (
    goal.historyContext
      .length
  ) {
    sections.push(
      [
        'Resolved conversation context:',
        ...goal.historyContext.map(
          (
            item,
          ) =>
            `- ${item}`,
        ),
      ].join(
        '\n',
      ),
    );
  }

  if (
    goal.constraints
      .length
  ) {
    sections.push(
      [
        'Constraints:',
        ...goal.constraints.map(
          (
            item,
          ) =>
            `- ${item}`,
        ),
      ].join(
        '\n',
      ),
    );
  }

  if (
    goal.acceptance
      .length
  ) {
    sections.push(
      [
        'Acceptance:',
        ...goal.acceptance.map(
          (
            item,
          ) =>
            `- ${item}`,
        ),
      ].join(
        '\n',
      ),
    );
  }

  /*
   * Keep the literal message only as provenance.
   *
   * It appears after the resolved goal so pronouns or conversational
   * wording cannot become the primary product definition again.
   */
  const literal =
    originalMessage
      .trim();

  if (
    literal &&
    literal !==
      resolvedGoal
  ) {
    sections.push(
      `Latest user message for provenance only:\n${literal}`,
    );
  }

  return sections
    .filter(
      Boolean,
    )
    .join(
      '\n\n',
    );
}
