import { api } from '@/lib/api';
import {
  useProjectWorkspaceStore,
  type FileTrailItem,
} from '@/store/useProjectWorkspaceStore';

export interface RollbackFile {
  path: string;
  content: string;
}

export interface RollbackProjectUpdateInput {
  repo: string;
  branch?: string;
  previousFiles: RollbackFile[];
  fileTrail?: Pick<FileTrailItem, 'path' | 'before' | 'after'>[];
  /** The Xroga commit that must still be the branch HEAD before Undo is allowed. */
  expectedHeadSha: string;
  /** Redeploy only when this project already has a live deployment. */
  redeploy?: boolean;
}

export interface RollbackProjectUpdateResult {
  repo: string;
  branch: string;
  commitSha: string | null;
  deployUrl: string | null;
  deployVerified: boolean;
  warning?: string;
}

function normalizePath(path: string): string {
  return path.trim().replace(/^\.\//, '').replace(/^\//, '');
}

/**
 * The old rollback only re-uploaded previousFiles, which restored modified/deleted files
 * but left files CREATED by the bad Xroga turn behind. The file trail tells us exactly
 * which paths had no previous contents, so those paths become Git deletions in the same
 * atomic undo commit.
 */
export function createdPathsFromTrail(
  previousFiles: readonly RollbackFile[],
  fileTrail: readonly Pick<FileTrailItem, 'path' | 'before' | 'after'>[] = [],
): string[] {
  const beforePaths = new Set(previousFiles.map((file) => normalizePath(file.path)));
  return [...new Set(
    fileTrail
      .filter((item) => {
        const path = normalizePath(item.path);
        return Boolean(path) && !beforePaths.has(path) && item.before === '';
      })
      .map((item) => normalizePath(item.path)),
  )];
}

/** Only the latest in-memory rollback snapshot may drive the shared Undo action. */
export function rollbackSnapshotsEqual(
  left: readonly RollbackFile[] | null | undefined,
  right: readonly RollbackFile[] | null | undefined,
): boolean {
  if (!left?.length || !right?.length || left.length !== right.length) return false;
  const rightByPath = new Map(right.map((file) => [normalizePath(file.path), file.content]));
  return left.every((file) => rightByPath.get(normalizePath(file.path)) === file.content);
}

function previewParts(files: readonly RollbackFile[]) {
  const exact = (path: string) => files.find((file) => normalizePath(file.path) === path)?.content;
  const first = (predicate: (path: string) => boolean) =>
    files.find((file) => predicate(normalizePath(file.path)))?.content;

  return {
    html: exact('index.html') ?? first((path) => path.endsWith('/index.html')) ?? null,
    css: exact('styles.css') ?? first((path) => path.endsWith('.css')) ?? null,
    js:
      exact('script.js') ??
      first((path) => path.endsWith('.js') && !path.endsWith('.json')) ??
      null,
  };
}

/**
 * One implementation for every "Undo last Xroga change" surface.
 *
 * Safety properties:
 * - requires a concrete rollback snapshot;
 * - requires the exact Xroga commit SHA that is expected to still be HEAD;
 * - restores old files and deletes files created by the bad turn in ONE atomic Git commit;
 * - uses explicit direct-write authorization because clicking Undo is the user's action;
 * - redeploy failure never pretends the Git undo failed, but marks the workspace degraded;
 * - consumes the rollback buffer after success, so the same inverse cannot be replayed.
 */
export async function rollbackProjectUpdate(
  input: RollbackProjectUpdateInput,
): Promise<RollbackProjectUpdateResult> {
  const repo = input.repo.trim();
  const branch = input.branch?.trim() || 'main';
  const expectedHeadSha = input.expectedHeadSha.trim();
  const previousFiles = input.previousFiles
    .map((file) => ({ path: normalizePath(file.path), content: file.content }))
    .filter((file) => file.path);

  if (!repo.includes('/')) throw new Error('Undo needs a valid GitHub repository.');
  if (!/^[0-9a-f]{40}$/i.test(expectedHeadSha)) {
    throw new Error('Undo cannot verify the exact GitHub commit for this change.');
  }
  if (!previousFiles.length) throw new Error('No rollback snapshot is available for this change.');
  if (previousFiles.length > 40) {
    throw new Error('This rollback snapshot is too large for safe one-click Undo.');
  }

  const deletePaths = createdPathsFromTrail(previousFiles, input.fileTrail);
  if (deletePaths.length > 40) {
    throw new Error('This change created too many paths for safe one-click Undo.');
  }

  const pushed = await api.github.pushBuild({
    repoName: repo,
    branch,
    incremental: true,
    files: previousFiles,
    deletePaths,
    expectedHeadSha,
    directWriteAuthorized: true,
    userPrompt: 'Undo last Xroga change',
    projectName: 'Xroga Undo',
  });

  const actualRepo = pushed.githubRepoName || repo;
  const actualBranch = pushed.branch || branch;
  let deployUrl: string | null = null;
  let deployVerified = false;
  let warning: string | undefined = pushed.warning;

  if (input.redeploy) {
    try {
      const deployed = await api.github.redeployPreview({
        repoName: actualRepo,
        branch: actualBranch,
      });
      deployUrl = deployed.deployUrl || null;
      deployVerified = deployed.deployVerified === true;
      if (!deployVerified) {
        warning = warning || 'GitHub was restored, but the live deployment could not be verified.';
      }
    } catch (error) {
      warning =
        warning ||
        `GitHub was restored, but redeploy failed: ${(error as Error).message || 'unknown error'}`;
    }
  }

  const workspace = useProjectWorkspaceStore.getState();
  for (const path of deletePaths) workspace.deleteFile(path);

  const preview = previewParts(previousFiles);
  workspace.applyBuild({
    repo: actualRepo,
    branch: actualBranch,
    projectName: workspace.projectName,
    html: preview.html ?? workspace.html,
    css: preview.css ?? workspace.css,
    js: preview.js ?? workspace.js,
    projectFiles: previousFiles.map((file) => ({
      path: file.path,
      content: file.content,
      flag: 'unchanged' as const,
    })),
    deployUrl: deployUrl ?? workspace.deployUrl,
    githubRepoUrl: pushed.githubRepoUrl || workspace.githubRepoUrl,
    commitSha: pushed.commitSha ?? null,
    status: input.redeploy ? (deployVerified ? 'live' : 'degraded') : 'pushed',
    changesSummary: ['Undid last Xroga change'],
    fileTrail: [],
    previousFiles: null,
    openPreview: preview.html ? true : workspace.previewOpen,
    terminalLine: `[undo] ${actualRepo}@${actualBranch} restored`,
  });
  workspace.clearRollbackBuffer();

  return {
    repo: actualRepo,
    branch: actualBranch,
    commitSha: pushed.commitSha ?? null,
    deployUrl: deployUrl ?? workspace.deployUrl,
    deployVerified,
    ...(warning ? { warning } : {}),
  };
}
