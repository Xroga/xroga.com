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

/** Resume preserves the durable run's target, never a new client-selected repository. */
export function requireResumeProjectContext(
  state: { runId: string; projectId: string; databaseProjectId?: string | null; repository: { owner: string; name: string } | null; selectedBranch: string } | null,
  runId: string,
  requested: { projectId?: string; repo?: string; branch?: string; projectRoot?: string },
): ActiveProjectContext | null {
  const unavailable = () => Object.assign(new Error('This run has no verifiable project target. Start a new run to choose a target.'), { code: 'RUN_RESUME_LINEAGE_UNAVAILABLE' });
  const mismatch = () => Object.assign(new Error('Resume must use the original repository, branch and project root. Start a new run to change targets.'), { code: 'RUN_RESUME_TARGET_MISMATCH' });
  if (!state || state.runId !== runId || !state.projectId) throw unavailable();
  // Old repository checkpoints contain a context key, not the database UUID.
  // Never authorize a new database binding using that unrelated identifier.
  if (requested.projectId !== undefined) {
    const binding = state.databaseProjectId ?? (!state.repository ? state.projectId : undefined);
    if (binding === undefined) throw unavailable();
    if (requested.projectId !== binding) throw mismatch();
  }
  if (!state.repository) {
    if (requested.repo || requested.projectId && requested.projectId !== state.projectId ||
        requested.branch && requested.branch !== state.selectedBranch || requested.projectRoot && requested.projectRoot !== '/') throw mismatch();
    return null;
  }
  let persisted: ActiveProjectContext;
  try {
    const parts = state.projectId.split('::').map(decodeURIComponent);
    if (parts.length !== 3) throw unavailable();
    persisted = normalizeProjectContext({ repo: parts[0], branch: parts[1], projectRoot: parts[2] });
    if (projectContextKey(persisted) !== state.projectId ||
        persisted.repo !== `${state.repository.owner}/${state.repository.name}`.toLowerCase() ||
        persisted.branch !== state.selectedBranch) throw unavailable();
  } catch { throw unavailable(); }
  try {
    assertProjectWriteTarget(persisted, {
      repo: requested.repo ?? persisted.repo,
      branch: requested.branch ?? persisted.branch,
      projectRoot: requested.projectRoot ?? persisted.projectRoot,
    });
  } catch { throw mismatch(); }
  return persisted;
}
