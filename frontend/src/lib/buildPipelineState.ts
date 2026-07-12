const STORAGE_PREFIX = 'xroga-build-pipeline:';

export interface BuildPipelineState {
  githubPushed: boolean;
  vercelDeployed: boolean;
  vercelUrl?: string;
  pushedAt?: number;
}

function storageKey(repoName: string, branch: string): string {
  const repo = repoName.trim().toLowerCase();
  const br = branch.trim().toLowerCase() || 'main';
  return `${STORAGE_PREFIX}${repo}@${br}`;
}

export function readBuildPipelineState(repoName: string, branch: string): BuildPipelineState | null {
  if (typeof window === 'undefined' || !repoName.trim()) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(repoName, branch));
    if (!raw) return null;
    return JSON.parse(raw) as BuildPipelineState;
  } catch {
    return null;
  }
}

export function writeBuildPipelineState(
  repoName: string,
  branch: string,
  patch: Partial<BuildPipelineState>
): BuildPipelineState {
  const prev = readBuildPipelineState(repoName, branch) ?? {
    githubPushed: false,
    vercelDeployed: false,
  };
  const next: BuildPipelineState = { ...prev, ...patch };
  if (typeof window !== 'undefined' && repoName.trim()) {
    try {
      sessionStorage.setItem(storageKey(repoName, branch), JSON.stringify(next));
    } catch {
      /* quota */
    }
  }
  return next;
}
