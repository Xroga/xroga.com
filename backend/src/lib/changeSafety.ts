import type { ProjectFile } from '../ai/patches.js';

export interface RemovalPlan {
  requestedPaths: string[];
  dependentPaths: string[];
  preservedPaths: string[];
  references: Array<{ path: string; referencedBy: string[] }>;
}

function importTokens(path: string): string[] {
  const base = path.replace(/\.[^.]+$/, '');
  const leaf = base.split('/').pop() || base;
  return [path, base, `./${base}`, `../${leaf}`, leaf];
}

export function planSafeRemoval(
  files: ProjectFile[],
  requestedPaths: string[],
): RemovalPlan {
  const normalized = [...new Set(requestedPaths.map((path) => path.replace(/^\.\//, '')))];
  const references = normalized.map((path) => {
    const tokens = importTokens(path);
    const referencedBy = files
      .filter((file) => file.path !== path)
      .filter((file) => tokens.some((token) => token.length > 2 && file.content.includes(token)))
      .map((file) => file.path);
    return { path, referencedBy };
  });
  const dependentPaths = [...new Set(references.flatMap((reference) => reference.referencedBy))];
  return {
    requestedPaths: normalized,
    dependentPaths,
    preservedPaths: files
      .map((file) => file.path)
      .filter((path) => !normalized.includes(path) && !dependentPaths.includes(path)),
    references,
  };
}

export function unrelatedFilesPreserved(
  before: ProjectFile[],
  after: ProjectFile[],
  allowedChangedPaths: string[],
): boolean {
  const allowed = new Set(allowedChangedPaths.map((path) => path.replace(/^\.\//, '')));
  const afterMap = new Map(after.map((file) => [file.path.replace(/^\.\//, ''), file.content]));
  return before.every((file) => {
    const path = file.path.replace(/^\.\//, '');
    return allowed.has(path) || afterMap.get(path) === file.content;
  });
}
