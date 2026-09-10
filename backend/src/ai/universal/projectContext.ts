export interface ActiveProjectContext {
  readonly repo: string;
  readonly branch: string;
  readonly projectRoot: string;
}

function cleanPart(value: string): string {
  return value.trim().replace(/\\/g, '/').replace(/\/+$/g, '');
}

export function normalizeProjectContext(value: ActiveProjectContext): ActiveProjectContext {
  const repo = cleanPart(value.repo).replace(/^\/+/, '').toLowerCase();
  const branch = cleanPart(value.branch);
  let projectRoot = `/${cleanPart(value.projectRoot || '/').replace(/^\/+/, '')}`;
  if (projectRoot.length > 1) projectRoot = projectRoot.replace(/\/+$/, '');
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) throw new Error('Project repository must be owner/repository.');
  if (!branch || branch.includes('..')) throw new Error('Project branch is invalid.');
  if (projectRoot.includes('..')) throw new Error('Project root is invalid.');
  return { repo, branch, projectRoot };
}

export function projectContextKey(value: ActiveProjectContext): string {
  const normalized = normalizeProjectContext(value);
  // Match the browser's canonical key and remain valid PostgreSQL text. NUL-delimited
  // keys cannot be stored in jsonb/text and caused a successful plan to fail while its
  // run record was written.
  return [normalized.repo, normalized.branch, normalized.projectRoot]
    .map((part) => encodeURIComponent(part))
    .join('::');
}

export function assertProjectWriteTarget(active: ActiveProjectContext, target: ActiveProjectContext): void {
  if (projectContextKey(active) !== projectContextKey(target)) {
    throw new Error('PROJECT_CONTEXT_TARGET_MISMATCH');
  }
}
