import type { SoftwareWritePolicy } from './contracts.js';

export type WriteOperation =
  | 'create'
  | 'modify'
  | 'delete'
  | 'rename';

export interface WritePolicyDecision {
  allowed: boolean;
  code?:
    | 'INVALID_PATH'
    | 'PATH_TRAVERSAL'
    | 'PATH_DENIED'
    | 'PATH_NOT_ALLOWED'
    | 'CREATE_NOT_ALLOWED'
    | 'DELETE_NOT_ALLOWED'
    | 'RENAME_NOT_ALLOWED';

  message?: string;
}

function normalizeRepositoryPath(input: string): string | null {
  const path = input.trim().replace(/\\/g, '/');

  if (!path) {
    return null;
  }

  if (path.startsWith('/')) {
    return null;
  }

  const parts = path.split('/');

  if (
    parts.some(
      (part) =>
        part === '' ||
        part === '.' ||
        part === '..',
    )
  ) {
    return null;
  }

  return parts.join('/');
}

function matchesPathRule(path: string, rule: string): boolean {
  const normalizedRule = normalizeRepositoryPath(rule);

  if (!normalizedRule) {
    return false;
  }

  if (path === normalizedRule) {
    return true;
  }

  if (normalizedRule.endsWith('/**')) {
    const prefix = normalizedRule.slice(0, -3);

    return (
      path === prefix ||
      path.startsWith(`${prefix}/`)
    );
  }

  return false;
}

export function evaluateWritePolicy(
  policy: SoftwareWritePolicy,
  operation: WriteOperation,
  requestedPath: string,
): WritePolicyDecision {
  const path = normalizeRepositoryPath(requestedPath);

  if (!path) {
    return {
      allowed: false,
      code: requestedPath.includes('..')
        ? 'PATH_TRAVERSAL'
        : 'INVALID_PATH',
      message: `Invalid repository path: ${requestedPath}`,
    };
  }

  if (
    policy.deniedPaths.some((rule) =>
      matchesPathRule(path, rule),
    )
  ) {
    return {
      allowed: false,
      code: 'PATH_DENIED',
      message: `${path} is protected from mutation.`,
    };
  }

  if (
    policy.allowedPaths.length > 0 &&
    !policy.allowedPaths.some((rule) =>
      matchesPathRule(path, rule),
    )
  ) {
    return {
      allowed: false,
      code: 'PATH_NOT_ALLOWED',
      message: `The requested task does not authorize changes to ${path}.`,
    };
  }

  if (operation === 'create' && !policy.allowCreate) {
    return {
      allowed: false,
      code: 'CREATE_NOT_ALLOWED',
      message: `Creating ${path} is outside the authorized task scope.`,
    };
  }

  if (operation === 'delete' && !policy.allowDelete) {
    return {
      allowed: false,
      code: 'DELETE_NOT_ALLOWED',
      message: `Deleting ${path} is outside the authorized task scope.`,
    };
  }

  if (operation === 'rename' && !policy.allowRename) {
    return {
      allowed: false,
      code: 'RENAME_NOT_ALLOWED',
      message: `Renaming ${path} is outside the authorized task scope.`,
    };
  }

  return {
    allowed: true,
  };
}
