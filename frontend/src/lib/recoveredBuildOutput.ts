import { isRenderableArtifact } from './engineeringArtifact';
import { deriveLandingOutcome } from './landingOutcome';
import type {
  FileTrailItem,
  ProjectFileEntry,
  ProjectWorkspaceState,
} from '@/store/useProjectWorkspaceStore';

type Output = Record<string, unknown>;

type WorkspaceSnapshot = Pick<
  ProjectWorkspaceState,
  'repo' | 'branch' | 'projectName' | 'html' | 'css' | 'js'
>;

export type RecoveredWorkspaceBuild = Parameters<ProjectWorkspaceState['applyBuild']>[0];

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sourceFiles(value: unknown): ProjectFileEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const files = value
    .filter(
      (item): item is { path: string; content?: unknown } =>
        Boolean(item) && typeof item === 'object' && typeof item.path === 'string',
    )
    .map((item) => ({
      path: item.path,
      content: text(item.content),
      flag: 'generated' as const,
    }));
  return files.length ? files : undefined;
}

function fileTrail(value: unknown): FileTrailItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const files = value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object' && text((item as Output).path).trim().length > 0,
    )
    .map((item) => ({
      path: text(item.path),
      before: text(item.before),
      after: text(item.after),
      added: Number.isFinite(Number(item.added)) ? Number(item.added) : 0,
      removed: Number.isFinite(Number(item.removed)) ? Number(item.removed) : 0,
    }));
  return files.length ? files : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
  return values.length ? values : undefined;
}

/**
 * A persisted error row can still contain the real product that was generated before a
 * publish or verification blocker. Recovery must deliver that work instead of replacing it
 * with a generic failure. A bare `{ type: 'landing_page' }` is deliberately not recoverable.
 */
export function isRecoverableBuildOutput(value: unknown): value is Output {
  if (isRenderableArtifact(value)) return true;
  if (!value || typeof value !== 'object') return false;
  const output = value as Output;
  if (output.type !== 'landing_page') return false;
  if (text(output.html).trim().length > 40) return true;
  return Boolean(sourceFiles(output.projectFiles)?.some((file) => file.content.trim().length > 0));
}

/** Turn the durable landing-page result into the same workspace state used by the live SSE path. */
export function recoveredLandingWorkspaceBuild(
  value: unknown,
  current: WorkspaceSnapshot,
  selected?: { repo?: string | null; branch?: string | null } | null,
): RecoveredWorkspaceBuild | null {
  if (!isRecoverableBuildOutput(value) || value.type !== 'landing_page') return null;
  const output = value;
  const isUpdate = output.isUpdate === true;
  const outputProjectName = text(output.projectName).trim();
  const projectName =
    (isUpdate ? current.projectName || outputProjectName : outputProjectName || current.projectName) ||
    'Your project';
  const nextHtml = text(output.html);
  const nextCss = text(output.css);
  const nextJs = text(output.js);
  const html = !nextHtml.trim() && current.html.trim() ? current.html : nextHtml;
  const css = !nextCss.trim() && current.css.trim() ? current.css : nextCss;
  const js = !nextJs.trim() && current.js.trim() ? current.js : nextJs;
  const repo =
    text(output.githubRepoName).includes('/')
      ? text(output.githubRepoName)
      : selected?.repo?.includes('/')
        ? selected.repo
        : current.repo;
  const deployUrl = text(output.deployUrl).trim() || text(output.vercelPreviewUrl).trim() || null;
  const outcome = deriveLandingOutcome(output, { projectName, isUpdate });
  const previousFiles = Array.isArray(output.previousFiles)
    ? output.previousFiles.filter(
        (item): item is { path: string; content: string } =>
          Boolean(item) &&
          typeof item === 'object' &&
          typeof (item as Output).path === 'string' &&
          typeof (item as Output).content === 'string',
      )
    : undefined;

  return {
    repo,
    branch: text(output.githubBranch).trim() || selected?.branch || current.branch || 'main',
    projectName,
    html,
    css,
    js,
    projectFiles: sourceFiles(output.projectFiles),
    deployUrl,
    githubRepoUrl: text(output.githubRepoUrl).trim() || null,
    commitSha: text(output.commitSha).trim() || null,
    status: outcome.workspaceStatus,
    changesSummary: stringArray(output.changesSummary),
    fileTrail: fileTrail(output.fileTrail),
    previousFiles,
    openPreview: true,
    terminalLine: outcome.terminalLine,
  };
}
