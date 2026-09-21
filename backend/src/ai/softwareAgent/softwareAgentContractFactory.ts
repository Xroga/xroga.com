import { randomUUID } from 'node:crypto';

import type {
  DeploymentAuthority,
  PreviewRequirement,
  RepositoryPersistenceAuthority,
  VerificationAuthority,
  SoftwareAcceptanceCriterion,
  SoftwareExecutionContract,
  SoftwareRepositoryRef,
  SoftwareTaskKind,
  SoftwareWritePolicy,
} from './contracts.js';

export interface SoftwareAgentContractInput {
  runId?: string;

  projectId?: string;

  goal: string;

  taskKind: SoftwareTaskKind;

  repository?: {
    owner: string;
    repo: string;
    branch: string;
    sourceCommit?: string;
  };

  /**
   * Exact paths the user has authorized for mutation.
   *
   * Empty means the task is not path-restricted, but normal
   * repository/security boundaries still apply.
   */
  allowedPaths?: string[];

  deniedPaths?: string[];

  allowCreate?: boolean;
  allowDelete?: boolean;
  allowRename?: boolean;

  preview?: PreviewRequirement;

  verificationAuthority?:
  VerificationAuthority;

  persistence?: RepositoryPersistenceAuthority;

  deployment?: DeploymentAuthority;

  acceptanceCriteria?: Array<{
    id?: string;
    description: string;
    required?: boolean;
  }>;

  constraints?: string[];
}

function cleanRequiredString(
  value: string,
  name: string,
): string {
  const cleaned = value.trim();

  if (!cleaned) {
    throw new Error(
      `${name} is required.`,
    );
  }

  return cleaned;
}

function normalizeRepositoryPath(
  input: string,
): string {
  const path = input
    .trim()
    .replace(/\\/g, '/');

  if (
    !path ||
    path.startsWith('/')
  ) {
    throw new Error(
      `Invalid repository path: ${input}`,
    );
  }

  const parts = path.split('/');

  if (
    parts.some(
      (part) =>
        !part ||
        part === '.' ||
        part === '..',
    )
  ) {
    throw new Error(
      `Invalid repository path: ${input}`,
    );
  }

  return parts.join('/');
}

function normalizePaths(
  paths: string[] | undefined,
): string[] {
  if (!paths) {
    return [];
  }

  return [
    ...new Set(
      paths.map(
        normalizeRepositoryPath,
      ),
    ),
  ].sort();
}

function buildRepository(
  input:
    | SoftwareAgentContractInput['repository']
    | undefined,
): SoftwareRepositoryRef | undefined {
  if (!input) {
    return undefined;
  }

  return {
    owner: cleanRequiredString(
      input.owner,
      'Repository owner',
    ),

    repo: cleanRequiredString(
      input.repo,
      'Repository name',
    ),

    branch: cleanRequiredString(
      input.branch,
      'Repository branch',
    ),

    ...(input.sourceCommit
      ? {
          sourceCommit:
            input.sourceCommit.trim(),
        }
      : {}),
  };
}

function buildWritePolicy(
  input: SoftwareAgentContractInput,
): SoftwareWritePolicy {
  const allowedPaths =
    normalizePaths(
      input.allowedPaths,
    );

  const deniedPaths =
    normalizePaths(
      input.deniedPaths,
    );

  return {
    allowedPaths,
    deniedPaths,

    allowCreate:
      input.allowCreate ?? true,

    allowDelete:
      input.allowDelete ?? false,

    allowRename:
      input.allowRename ?? false,
  };
}

function buildCriteria(
  criteria:
    | SoftwareAgentContractInput[
        'acceptanceCriteria'
      ]
    | undefined,
): SoftwareAcceptanceCriterion[] {
  if (!criteria) {
    return [];
  }

  return criteria
    .map((criterion, index) => ({
      id:
        criterion.id?.trim() ||
        `criterion-${index + 1}`,

      description:
        criterion.description.trim(),

      required:
        criterion.required ?? true,
    }))
    .filter(
      (criterion) =>
        criterion.description.length > 0,
    );
}

function defaultPreviewRequirement(
  taskKind: SoftwareTaskKind,
): PreviewRequirement {
  switch (taskKind) {
    case 'web_app':
    case 'new_project':
      return 'required';

    case 'cli':
    case 'library':
    case 'documentation':
      return 'not_applicable';

    default:
      return 'optional';
  }
}

/**
 * Build the authoritative software execution contract.
 *
 * Important:
 *
 * This contract is not a model suggestion.
 *
 * It is server-owned execution policy used by:
 * - write controls
 * - sandbox tools
 * - Preview requirements
 * - GitHub persistence
 * - deployment authority
 * - completion verification
 */
export function createSoftwareExecutionContract(
  input: SoftwareAgentContractInput,
): SoftwareExecutionContract {
  const repository =
    buildRepository(
      input.repository,
    );

  const persistence =
    input.persistence ?? 'none';

  const deployment =
    input.deployment ?? 'forbidden';

  if (
    persistence === 'review_branch' &&
    !repository
  ) {
    throw new Error(
      'Review-branch persistence requires an authorized repository.',
    );
  }

  if (
    deployment !== 'forbidden' &&
    !repository
  ) {
    throw new Error(
      'Deployment authority requires an authorized project/repository context.',
    );
  }

  return {
    runId:
      input.runId?.trim() ||
      randomUUID(),

    ...(input.projectId
      ? {
          projectId:
            input.projectId.trim(),
        }
      : {}),

    taskKind:
      input.taskKind,

    goal:
      cleanRequiredString(
        input.goal,
        'Software goal',
      ),

    ...(repository
      ? {
          repository,
        }
      : {}),

    writePolicy:
      buildWritePolicy(input),

    preview:
  input.preview ??
  defaultPreviewRequirement(
    input.taskKind,
  ),

verificationAuthority:
  input.verificationAuthority ??
  'agent',

persistence,

    deployment,

    acceptanceCriteria:
      buildCriteria(
        input.acceptanceCriteria,
      ),

    constraints:
      (input.constraints ?? [])
        .map(
          (constraint) =>
            constraint.trim(),
        )
        .filter(Boolean),
  };
}
