/**
 * The frontend's view of the engineering artifact contract.
 *
 * Mirrors `backend/src/ai/engineeringArtifact.ts`. Kept as a separate declaration rather than
 * imported across the package boundary because the two deploy independently: a persisted run
 * written by an older backend must still render here, which means this side has to treat every
 * field as potentially absent and say so in the types.
 *
 * `artifactVersion` is what makes that safe. A renderer that meets a version it does not
 * understand declines rather than guessing — for a result that reports whether someone's code
 * was verified, "I cannot display this" is far better than a confident wrong answer.
 */

import { redactTerminalText } from './terminal/terminalRedaction';

export const ENGINEERING_ARTIFACT_TYPE = 'engineering_artifact';
/** The highest version this frontend knows how to render. */
export const SUPPORTED_ARTIFACT_VERSION = 1;

export type ArtifactStatus = 'verified' | 'blocked' | 'failed';

export interface ArtifactFileEntry {
  path: string;
  added?: number;
  removed?: number;
  action?: 'created' | 'modified' | 'deleted';
}

export interface ArtifactRepository {
  owner: string;
  repo: string;
  branch: string;
  baseBranch?: string;
  commitSha?: string | null;
  commitVerified?: boolean;
  pullRequestUrl?: string | null;
}

export interface ArtifactVerification {
  phase: string;
  statement: string;
  detail: string;
}

/**
 * Browser verification evidence, when a web project was checked.
 *
 * Optional, and read defensively: it arrives from a backend that may be older than this
 * frontend. An artifact without it renders exactly as it did before this field existed.
 */
export interface ArtifactBrowserVerification {
  status: string;
  url?: string | null;
  notCheckedReason?: string | null;
  blocker?: string | null;
  passedChecks?: string[];
  findings?: string[];
  criteriaNotChecked?: string[];
  screenshots?: string[];
}

/**
 * The reasons, in the user's words.
 *
 * "sandbox_unavailable" is an internal token; a person reading their build result needs to know
 * that nobody looked at their page and why. `not_a_web_project` is absent deliberately — there
 * is nothing to report when a browser was never the right instrument.
 */
const NOT_CHECKED_REASONS: Record<string, string> = {
  no_start_command: 'the project declares no command that serves it',
  sandbox_unavailable: 'no isolated environment was available to run it in',
  browser_unavailable: 'no browser was available in the execution environment',
  application_did_not_start: 'the application did not start',
  cancelled: 'the run was cancelled',
};

/**
 * One line describing what the browser found, or that it never looked.
 *
 * Returns null when there is nothing worth saying. Never renders "Verified" — the artifact's own
 * `status` owns that word, and this field exists precisely to stop an unobserved page borrowing it.
 */
export function browserVerificationLine(
  browser: ArtifactBrowserVerification | undefined,
): string | null {
  if (!browser) return null;
  if (browser.status === 'passed') return 'Browser verification: passed';
  if (browser.status === 'failed') {
    const finding = browser.findings?.[0] ?? browser.blocker;
    return `Browser verification: failed${finding ? ` — ${finding}` : ''}`;
  }
  if (browser.status === 'not_checked') {
    const reason = browser.notCheckedReason ?? '';
    if (reason === 'not_a_web_project') return null;
    const explained = NOT_CHECKED_REASONS[reason] ?? browser.blocker ?? 'it could not run';
    return `Browser verification: not completed — ${explained}`;
  }
  return null;
}

export interface EngineeringArtifact {
  type: typeof ENGINEERING_ARTIFACT_TYPE;
  artifactVersion: number;
  summary: string;
  status: ArtifactStatus;
  verified: boolean;
  outcome: string;
  phaseReached: string;
  reason: string;
  blockers: string[];
  files: ArtifactFileEntry[];
  fileCount: number;
  repository: ArtifactRepository | null;
  commitSha: string | null;
  verificationEvidence: ArtifactVerification[];
  preview: { url?: string | null; verified?: boolean } | null;
  nextAction: string | null;
  /** Optional; absent on runs with no browser surface. */
  browserVerification?: ArtifactBrowserVerification;
  /** Present when the run failed after producing the artifact. */
  error?: string;
  code?: string;
    /**
   * New Universal runs send a complete workspace snapshot here.
   * Older persisted artifacts may still contain only changed files.
   */
  projectFiles?: Array<{
    path: string;
    content: string;
  }>;

  projectFilesMode?:
    | 'snapshot'
    | 'diff';

  buildContract?:
    unknown;

  projectRunState?:
    unknown;

  softwareProject?: {
    workspace?: {
      files?: Array<{
        path: string;
        content: string;
      }>;
    };

    [key: string]:
      unknown;
  };
  /** The exact before/after trail for the changed files. */
  fileTrail?: Array<{
    path: string;
    before: string;
    after: string;
    added: number;
    removed: number;
  }>;
}

export function isEngineeringArtifact(value: unknown): value is EngineeringArtifact {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === ENGINEERING_ARTIFACT_TYPE &&
    typeof (value as { artifactVersion?: unknown }).artifactVersion === 'number'
  );
}

/** Whether this frontend can render the artifact it was given. */
export function isRenderableArtifact(value: unknown): value is EngineeringArtifact {
  return isEngineeringArtifact(value) && value.artifactVersion <= SUPPORTED_ARTIFACT_VERSION;
}

/**
 * The text form, for transcripts and any surface that cannot render a component.
 *
 * This is the function that replaces `"Swarm task complete."` for engineering runs. It is
 * deliberately substantial: the text fallback is what a user sees in a copied transcript, in
 * search, and in every context where the rich renderer is unavailable, so it has to carry the
 * result rather than gesture at it.
 */
export function engineeringArtifactToText(artifact: EngineeringArtifact): string {
  const lines: string[] = [artifact.summary];

  if (artifact.error) lines.push(`Run error: ${artifact.error}`);

  if (artifact.blockers.length) {
    lines.push('', 'Blockers:');
    for (const blocker of artifact.blockers.slice(0, 8)) lines.push(`- ${blocker}`);
  }

  if (artifact.fileCount > 0) {
    lines.push('', `Files changed (${artifact.fileCount}):`);
    // Older/overlaid universal payloads carried paths as strings even though the versioned
    // artifact contract uses `{ path }` entries. Render those persisted runs defensively;
    // printing `undefined` hides the only useful clue a blocked build still produced.
    for (const file of artifact.files.slice(0, 20)) {
      const path = typeof file === 'string' ? file : file.path;
      if (path) lines.push(`- ${path}`);
    }
    if (artifact.files.length > 20) lines.push(`- …and ${artifact.files.length - 20} more`);
  }

  if (artifact.repository) {
    const { owner, repo, branch } = artifact.repository;
    lines.push('', `Repository: ${owner}/${repo} (${branch})`);
  }
  if (artifact.commitSha) lines.push(`Commit: ${artifact.commitSha}`);
  if (artifact.preview?.url) lines.push(`Preview: ${artifact.preview.url}`);

  if (artifact.verificationEvidence.length) {
    lines.push('', 'Verification:');
    for (const item of artifact.verificationEvidence.slice(0, 8)) {
      lines.push(`- ${item.phase}: ${item.statement}`);
    }
  }

  const browserLine = browserVerificationLine(artifact.browserVerification);
  if (browserLine) lines.push(browserLine);

  const uncheckedCriteria = artifact.browserVerification?.criteriaNotChecked ?? [];
  if (uncheckedCriteria.length) {
    // Surfaced rather than dropped: a criterion nobody could check is not a criterion that
    // passed, and silence here is what would let the user assume it was.
    lines.push('', 'Acceptance criteria not checked:');
    for (const criterion of uncheckedCriteria.slice(0, 5)) lines.push(`- ${criterion}`);
  }

  if (artifact.nextAction) lines.push('', artifact.nextAction);

  return lines.join('\n');
}

export interface EngineeringArtifactWorkspaceProjection {
  repo: string;
  sourceBranch: string;
  reviewBranch: string | null;
  projectName: string;

  projectFiles: Array<{
    path: string;
    content: string;
    flag:
      | 'generated'
      | 'modified'
      | 'deleted'
      | 'unchanged';
  }>;

  replaceProjectFiles: boolean;
  /** Direct static entry point, when the changed-file artifact contains one. */
  html: string;
  css: string;
  js: string;
  previewAvailable: boolean;
  fileTrail: Array<{
    path: string;
    before: string;
    after: string;
    added: number;
    removed: number;
  }>;
  githubRepoUrl: string;
  commitSha: string | null;
  status: 'pushed' | 'degraded';
  changesSummary: string[];
  terminalLines: string[];
}

function safeProjectPath(path: string): string | null {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

function referencedFile(
  files: ReadonlyMap<string, string>,
  htmlPath: string,
  reference: string,
): string {
  const clean = reference.split(/[?#]/, 1)[0]?.trim() ?? '';
  if (!clean || /^(?:[a-z]+:|\/\/|#|data:)/i.test(clean)) return '';
  const base = htmlPath.includes('/') ? htmlPath.slice(0, htmlPath.lastIndexOf('/')) : '';
  if (clean.startsWith('/')) {
    const fromProjectRoot = safeProjectPath(clean.slice(1));
    if (fromProjectRoot && files.has(fromProjectRoot)) return files.get(fromProjectRoot) ?? '';
  }
  const candidate = safeProjectPath(`${base}/${clean.replace(/^\//, '')}`);
  return candidate ? files.get(candidate) ?? '' : '';
}

function attribute(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match?.[1] ?? '';
}

function staticPreview(files: readonly { path: string; content: string }[]): {
  html: string;
  css: string;
  js: string;
  previewAvailable: boolean;
} {
  const normalized = files
    .map((file) => ({ ...file, normalizedPath: safeProjectPath(file.path) }))
    .filter((file): file is typeof file & { normalizedPath: string } => Boolean(file.normalizedPath));
  const htmlFile = normalized
    .filter((file) => file.normalizedPath === 'index.html' || file.normalizedPath.endsWith('/index.html'))
    .sort((left, right) => {
      const depth = left.normalizedPath.split('/').length - right.normalizedPath.split('/').length;
      return depth || left.normalizedPath.localeCompare(right.normalizedPath);
    })[0];
  if (!htmlFile?.content.trim()) return { html: '', css: '', js: '', previewAvailable: false };

  const byPath = new Map(normalized.map((file) => [file.normalizedPath, file.content]));
  const linkTags = htmlFile.content.match(/<link\b[^>]*>/gi) ?? [];
  const scriptTags = htmlFile.content.match(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  const linkedCss = linkTags
    .filter((tag) => /\brel\s*=\s*["'][^"']*stylesheet/i.test(tag))
    .map((tag) => referencedFile(byPath, htmlFile.normalizedPath, attribute(tag, 'href')))
    .filter(Boolean);
  const linkedJs = scriptTags
    .map((tag) => referencedFile(byPath, htmlFile.normalizedPath, attribute(tag, 'src')))
    .filter(Boolean);
  const inlineCss = [...htmlFile.content.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] ?? '')
    .filter(Boolean);
  const inlineJs = [...htmlFile.content.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1] ?? '')
    .filter(Boolean);
  const html = htmlFile.content
    .replace(/<link\b[^>]*\brel\s*=\s*["'][^"']*stylesheet[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>[\s\S]*?<\/script>/gi, '')
    // A static Preview presents the returned frontend shell; it does not execute a server-side
    // template engine. Remove template control/placeholder tokens so implementation syntax is
    // not shown as user content while leaving the surrounding HTML untouched.
    .replace(/{%[\s\S]*?%}/g, '')
    .replace(/{{[\s\S]*?}}/g, '');

  return {
    html,
    css: [...inlineCss, ...linkedCss].join('\n'),
    js: [...linkedJs, ...inlineJs].join('\n'),
    previewAvailable: true,
  };
}

/**
 * Converts a completed engineering artifact into facts Project edits can display.
 *
 * This never infers a deployment: a review-branch commit is pushed, not live. It does derive a
 * local inline preview when the artifact itself contains a complete static HTML entry and its
 * referenced changed CSS/JS, which is presentation of returned bytes rather than a deploy claim.
 */
export function engineeringArtifactWorkspaceProjection(
  artifact: EngineeringArtifact,
): EngineeringArtifactWorkspaceProjection | null {
  const repository = artifact.repository;
  if (!repository?.owner || !repository.repo) return null;
  const repo = `${repository.owner}/${repository.repo}`;
  const sourceBranch = repository.baseBranch || repository.branch;
  const manifestActions = new Map(
    artifact.files.map((file) => [
      typeof file === 'string' ? file : file.path,
      typeof file === 'string' ? undefined : file.action,
    ]),
  );
    const canonicalWorkspaceFiles =
    artifact
      .softwareProject
      ?.workspace
      ?.files;

  const hasNestedCanonicalWorkspace =
    Array.isArray(
      canonicalWorkspaceFiles,
    ) &&
    canonicalWorkspaceFiles.length >
      0;

  const topLevelProjectFiles =
    artifact.projectFiles ??
    [];

  const hasTopLevelCanonicalWorkspace =
    artifact.projectFilesMode ===
      'snapshot' &&
    topLevelProjectFiles.length >
      0;

  const replaceProjectFiles =
    hasNestedCanonicalWorkspace ||
    hasTopLevelCanonicalWorkspace;

  const sourceProjectFiles =
    hasNestedCanonicalWorkspace
      ? canonicalWorkspaceFiles
      : topLevelProjectFiles;

  const projectFiles:
    EngineeringArtifactWorkspaceProjection['projectFiles'] =
    sourceProjectFiles
      .filter(
        (
          file,
        ): file is {
          path: string;
          content: string;
        } =>
          Boolean(
            file,
          ) &&
          typeof file.path ===
            'string' &&
          typeof file.content ===
            'string',
      )
      .map(
        (file) => {
          const action =
            manifestActions.get(
              file.path,
            );

          return {
            path:
              file.path,

            content:
              file.content,

            flag:
              action ===
              'created'
                ? 'generated' as const
                : action ===
                    'modified'
                  ? 'modified' as const
                  : replaceProjectFiles
                    ? 'unchanged' as const
                    : 'modified' as const,
          };
        },
      );

  /*
   * Legacy diff artifacts represented deletions as synthetic empty
   * files. Canonical snapshots must not do that: deleted files are
   * absent from the workspace and remain only in fileTrail/changeSet.
   */
  if (
    !replaceProjectFiles
  ) {
    for (
      const [
        path,
        action,
      ] of
      manifestActions
    ) {
      if (
        action ===
          'deleted' &&
        !projectFiles.some(
          (file) =>
            file.path ===
            path,
        )
      ) {
        projectFiles.push({
          path,
          content: '',
          flag:
            'deleted',
        });
      }
    }
  }
  const fileTrail = (artifact.fileTrail ?? [])
    .filter((file) => file && typeof file.path === 'string')
    .map((file) => ({
      path: file.path,
      before: typeof file.before === 'string' ? file.before : '',
      after: typeof file.after === 'string' ? file.after : '',
      added: Number.isFinite(Number(file.added)) ? Number(file.added) : 0,
      removed: Number.isFinite(Number(file.removed)) ? Number(file.removed) : 0,
    }));
  const verificationLines = artifact.verificationEvidence.map((item) =>
    redactTerminalText([item.phase, item.statement, item.detail].filter(Boolean).join(' · ')),
  );
  const terminalLines = [
    redactTerminalText(artifact.summary),
    ...verificationLines,
    repository.branch ? `Review branch · ${repository.branch}` : '',
    artifact.commitSha ? `Commit · ${artifact.commitSha}` : '',
  ].filter(Boolean);
  const preview = staticPreview(projectFiles.filter((file) => file.flag !== 'deleted'));

  return {
    repo,
    sourceBranch,
    reviewBranch: repository.branch || null,
    projectName: repository.repo,
    projectFiles,
    replaceProjectFiles,
    ...preview,
    fileTrail,
    githubRepoUrl: `https://github.com/${repo}`,
    commitSha: artifact.commitSha,
    status:
      artifact.commitSha
        ? 'pushed'
        : 'degraded',
    changesSummary: [artifact.summary, ...verificationLines].filter(Boolean),
    terminalLines,
  };
}
