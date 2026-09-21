import type {
  GoalContract,
} from '../ai/universal/goalContract.js';

export const BUILD_CONTRACT_SCHEMA_VERSION =
  '1.0.0' as const;

export type BuildOperation =
  | 'build'
  | 'modify'
  | 'repair'
  | 'preview'
  | 'publish'
  | 'deploy'
  | 'explain';

export type BuildProjectMode =
  | 'greenfield'
  | 'existing_project'
  | 'follow_up';

export interface BuildContract {
  readonly schemaVersion:
    typeof BUILD_CONTRACT_SCHEMA_VERSION;

  readonly projectId: string;
  readonly runId: string;

  readonly operation:
    BuildOperation;

  readonly projectMode:
    BuildProjectMode;

  /**
   * The validated semantic request is authoritative.
   *
   * Downstream engineering code must not reconstruct the user's
   * meaning from the latest chat message when this object exists.
   */
  readonly semanticGoal:
    GoalContract;

  /**
   * Retained for the coding agent so the latest instruction is not lost.
   * Planning should prefer semanticGoal.
   */
  readonly sourcePrompt: string;

  readonly repository:
    | {
        readonly repo: string;
        readonly branch: string;
        readonly projectRoot: string;
      }
    | null;

  readonly context: {
    readonly existingFileCount: number;
    readonly continuation: boolean;
  };

  readonly previewRequirement:
  GoalContract[
    'previewRequirement'
  ];

readonly publicationRequirement:
  GoalContract[
    'publicationRequirement'
  ];

readonly deploymentRequirement:
  GoalContract[
    'deploymentRequirement'
  ];
  };

  readonly createdAt: string;
}

export interface CreateBuildContractInput {
  readonly projectId: string;
  readonly runId: string;
  readonly sourcePrompt: string;
  readonly goal: GoalContract;
  readonly existingFileCount: number;
  readonly continuation?: boolean;
  readonly now?: Date;
}

function buildOperationFor(
  input: CreateBuildContractInput,
): BuildOperation {
  if (
    input.goal.deploymentRequirement ===
    'REQUESTED'
  ) {
    return 'deploy';
  }

  if (
  input.goal
    .publicationRequirement ===
  'REQUESTED'
) {
  return 'publish';
}

  if (
    input.goal.semanticIntent ===
      'ANSWER' ||
    input.goal.semanticIntent ===
      'INVESTIGATE' ||
    input.goal.semanticIntent ===
      'PROPOSE'
  ) {
    return 'explain';
  }

  if (
    input.existingFileCount >
    0
  ) {
    return 'modify';
  }

  return 'build';
}

function projectModeFor(
  input: CreateBuildContractInput,
): BuildProjectMode {
  if (
    input.existingFileCount ===
    0
  ) {
    return 'greenfield';
  }

  if (
    input.continuation
  ) {
    return 'follow_up';
  }

  return 'existing_project';
}

export function createBuildContract(
  input: CreateBuildContractInput,
): BuildContract {
  const projectContext =
    input.goal.projectContext;

  return {
    schemaVersion:
      BUILD_CONTRACT_SCHEMA_VERSION,

    projectId:
      input.projectId,

    runId:
      input.runId,

    operation:
      buildOperationFor(
        input,
      ),

    projectMode:
      projectModeFor(
        input,
      ),

    semanticGoal:
      input.goal,

    sourcePrompt:
      input.sourcePrompt,

    repository:
      projectContext
        ? {
            repo:
              projectContext.repo,

            branch:
              projectContext.branch,

            projectRoot:
              projectContext
                .projectRoot,
          }
        : null,

    context: {
      existingFileCount:
        Math.max(
          0,
          input.existingFileCount,
        ),

      continuation:
        Boolean(
          input.continuation,
        ),
    },

    delivery: {
  previewRequirement:
    input.goal
      .previewRequirement,

  publicationRequirement:
    input.goal
      .publicationRequirement,

  deploymentRequirement:
        input.goal
          .deploymentRequirement,
    },

    createdAt:
      (
        input.now ??
        new Date()
      ).toISOString(),
  };
}

/**
 * Structured semantic text for planners that still temporarily
 * consume text.
 *
 * This is intentionally built from GoalContract rather than from
 * conversational shorthand such as "finish that".
 *
 * Step 2 will move product classification fully into typed product
 * intelligence.
 */
export function buildContractPlanningText(
  contract: BuildContract,
): string {
  const goal =
    contract.semanticGoal;

  const sections:
    string[] = [
    `Goal:\n${goal.goal}`,
    `Desired outcome:\n${goal.desiredOutcome}`,
  ];

  if (
    goal.constraints.length
  ) {
    sections.push(
      `Constraints:\n${goal.constraints
        .map(
          (item) =>
            `- ${item}`,
        )
        .join('\n')}`,
    );
  }

  if (
    goal.acceptance.length
  ) {
    sections.push(
      `Acceptance criteria:\n${goal.acceptance
        .map(
          (item) =>
            `- ${item}`,
        )
        .join('\n')}`,
    );
  }

  if (
    goal.deliverables.length
  ) {
    sections.push(
      `Deliverables:\n${goal.deliverables
        .map(
          (item) =>
            `- ${item.description}`,
        )
        .join('\n')}`,
    );
  }

  if (
    goal.requiredCapabilities
      .length
  ) {
    sections.push(
      `Required capabilities:\n${goal.requiredCapabilities
        .map(
          (item) =>
            `- ${item}`,
        )
        .join('\n')}`,
    );
  }

  return sections.join(
    '\n\n',
  );
}

/**
 * Coding agents also receive the latest engineering request, but the
 * resolved semantic goal remains above it and therefore authoritative.
 */
export function buildContractExecutionText(
  contract: BuildContract,
): string {
  return [
    buildContractPlanningText(
      contract,
    ),

    `Engineering operation: ${contract.operation}`,

    `Project mode: ${contract.projectMode}`,

    `Current engineering request:\n${contract.sourcePrompt}`,
  ].join(
    '\n\n',
  );
}
