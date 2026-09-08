export const DEFAULT_PROJECT_ROOT = '/';

export interface ProjectContextIdentity {
  repo: string;
  branch: string;
  projectRoot: string;
}

export interface ProjectTargetInput {
  repo: string;
  branch?: string | null;
  projectRoot?: string | null;
}

function normalizeSegment(value: string, label: string): string {
  const normalized = value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized) throw new Error(`Project ${label} is required`);
  return normalized;
}

export function normalizeProjectContext(input: ProjectTargetInput): ProjectContextIdentity {
  const repo = normalizeSegment(input.repo, 'repository');
  const parts = repo.split('/');
  if (parts.length !== 2 || parts.some((part) => !part.trim())) {
    throw new Error('Project repository must use owner/repository format');
  }
  const branch = normalizeSegment(input.branch || 'main', 'branch');
  const root = (input.projectRoot || DEFAULT_PROJECT_ROOT).trim().replace(/\\/g, '/');
  const rootParts: string[] = [];
  for (const part of root.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') rootParts.pop(); else rootParts.push(part);
  }
  const projectRoot = rootParts.length ? `/${rootParts.join('/')}` : '/';
  return { repo: parts.join('/'), branch, projectRoot };
}

export function projectContextKey(input: ProjectTargetInput): string {
  const value = normalizeProjectContext(input);
  return [value.repo.toLocaleLowerCase('en-US'), value.branch, value.projectRoot]
    .map((part) => encodeURIComponent(part))
    .join('::');
}

export function sameProjectContext(
  left: ProjectTargetInput | null | undefined,
  right: ProjectTargetInput | null | undefined,
): boolean {
  if (!left || !right) return left === right;
  return projectContextKey(left) === projectContextKey(right);
}

export function assertProjectTarget(
  active: ProjectContextIdentity | null,
  target: ProjectTargetInput,
): ProjectContextIdentity {
  if (!active) throw new Error('No active project is selected');
  const normalized = normalizeProjectContext(target);
  if (!sameProjectContext(active, normalized)) {
    throw new Error('Project target no longer matches the active project');
  }
  return normalized;
}

export interface ProjectTransition<T> {
  identity: ProjectContextIdentity;
  key: string;
  version: number;
  changed: boolean;
  activeState: T;
  states: Record<string, T>;
}

/** Pure transition primitive used by the store and regression tests. */
export function transitionProjectState<T>(options: {
  activeKey: string | null;
  activeState: T;
  states: Record<string, T>;
  version: number;
  target: ProjectTargetInput;
  createClean: (identity: ProjectContextIdentity) => T;
}): ProjectTransition<T> {
  const identity = normalizeProjectContext(options.target);
  const key = projectContextKey(identity);
  if (key === options.activeKey) {
    return { identity, key, version: options.version, changed: false, activeState: options.activeState, states: options.states };
  }
  const states = { ...options.states };
  if (options.activeKey) states[options.activeKey] = options.activeState;
  const activeState = states[key] ?? options.createClean(identity);
  states[key] = activeState;
  return { identity, key, version: options.version + 1, changed: true, activeState, states };
}

export function isCurrentProjectTransition(
  activeKey: string | null,
  activeVersion: number,
  resultKey: string,
  resultVersion: number,
): boolean {
  return activeKey === resultKey && activeVersion === resultVersion;
}
