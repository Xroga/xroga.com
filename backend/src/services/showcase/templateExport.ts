/**
 * Copies a showcase template into a repository the user owns, on a feature branch,
 * and opens a pull request.
 *
 * Safety rules enforced here:
 *  - the template id is resolved against a server allow-list, never a client path
 *  - push permission is verified before anything is written
 *  - the target directory and every file path are checked for traversal
 *  - existing files are inspected first and never silently overwritten
 *  - work always lands on a new feature branch, never the default branch
 *  - the shared template source is only ever read, never modified
 */

import { ghFetch, parseRepoName, type ProjectFile } from '../integrations/githubDeploy.js';
import { getGitHubToken } from '../integrations/githubAuth.js';
import {
  buildTemplateFiles,
  isSafeRepoPath,
  normalizeTargetDirectory,
  resolveTemplateSource,
} from './templateSources.js';

export interface ExportPlanFile {
  path: string;
  status: 'create' | 'skip-conflict';
  bytes: number;
}

export interface ExportResult {
  ok: boolean;
  repoFullName: string;
  branch: string;
  baseBranch: string;
  commitSha?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  filesCreated: number;
  filesSkipped: number;
  plan: ExportPlanFile[];
  /** Populated when a conflict or partial result needs reporting honestly. */
  warnings: string[];
}

export class ExportError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'not_connected'
      | 'unknown_template'
      | 'bad_repo'
      | 'no_permission'
      | 'unsafe_path'
      | 'branch_failed'
      | 'push_failed'
      | 'nothing_to_write',
    readonly status = 400,
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

interface RepoInfo {
  defaultBranch: string;
  private: boolean;
  canPush: boolean;
}

/** Reads repo metadata and verifies the token actually has push rights. */
async function getRepoInfo(token: string, owner: string, repo: string): Promise<RepoInfo> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}`);
  if (!res.ok) {
    throw new ExportError(`Repository is not accessible (${res.status}).`, 'bad_repo', res.status === 404 ? 404 : 403);
  }
  const data = (await res.json()) as {
    default_branch?: string;
    private?: boolean;
    permissions?: { push?: boolean; admin?: boolean; maintain?: boolean };
  };
  const perms = data.permissions ?? {};
  return {
    defaultBranch: data.default_branch || 'main',
    private: Boolean(data.private),
    canPush: Boolean(perms.push || perms.admin || perms.maintain),
  };
}

/** Exact branch head with no fallback — the branch identity matters here. */
async function resolveExactBranchHead(
  token: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<string | null> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { object?: { sha?: string } };
  return data.object?.sha ?? null;
}

/** Creates the feature branch from a base SHA. Tolerates an existing branch. */
async function createBranch(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  fromSha: string,
): Promise<void> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
  });
  if (res.ok) return;
  // 422 means the ref already exists, which is fine for a retry.
  if (res.status === 422) return;
  const detail = await res.text().catch(() => '');
  throw new ExportError(`Could not create branch ${branch} (${res.status}). ${detail.slice(0, 200)}`, 'branch_failed', 502);
}

/** Lists the paths already present on a branch, for conflict detection. */
async function listExistingPaths(
  token: string,
  owner: string,
  repo: string,
  branchSha: string | null,
): Promise<Set<string>> {
  if (!branchSha) return new Set();
  const res = await ghFetch(token, `/repos/${owner}/${repo}/git/trees/${branchSha}?recursive=1`);
  if (!res.ok) return new Set();
  const data = (await res.json()) as { tree?: Array<{ path?: string; type?: string }> };
  const paths = new Set<string>();
  for (const entry of data.tree ?? []) {
    if (entry.type === 'blob' && entry.path) paths.add(entry.path);
  }
  return paths;
}

/** Commits the planned files onto the feature branch via the Git data API. */
async function commitFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  parentSha: string,
  files: ProjectFile[],
  message: string,
): Promise<string> {
  const blobs: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
  for (const file of files) {
    const res = await ghFetch(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: Buffer.from(file.content, 'utf8').toString('base64'), encoding: 'base64' }),
    });
    if (!res.ok) {
      throw new ExportError(`Failed to upload ${file.path} (${res.status}).`, 'push_failed', 502);
    }
    const blob = (await res.json()) as { sha: string };
    blobs.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const treeRes = await ghFetch(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: parentSha, tree: blobs }),
  });
  if (!treeRes.ok) throw new ExportError(`Failed to build tree (${treeRes.status}).`, 'push_failed', 502);
  const tree = (await treeRes.json()) as { sha: string };

  const commitRes = await ghFetch(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
  });
  if (!commitRes.ok) throw new ExportError(`Failed to create commit (${commitRes.status}).`, 'push_failed', 502);
  const commit = (await commitRes.json()) as { sha: string };

  const refRes = await ghFetch(token, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  if (!refRes.ok) throw new ExportError(`Failed to update ${branch} (${refRes.status}).`, 'push_failed', 502);

  return commit.sha;
}

async function openPullRequest(
  token: string,
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<{ url?: string; number?: number; warning?: string }> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify({ title, head, base, body }),
  });
  if (res.ok) {
    const pr = (await res.json()) as { html_url?: string; number?: number };
    return { url: pr.html_url, number: pr.number };
  }
  const detail = await res.text().catch(() => '');
  // The branch and commit are already real; report the PR gap honestly rather
  // than failing the whole export.
  return { warning: `Branch pushed, but the pull request could not be opened (${res.status}). ${detail.slice(0, 200)}` };
}

export async function exportTemplateToRepo(opts: {
  userId: string;
  templateId: string;
  repoFullName: string;
  branch: string;
  projectName: string;
  userPrompt?: string;
  targetDirectory?: unknown;
  baseBranch?: string;
}): Promise<ExportResult> {
  const token = await getGitHubToken(opts.userId);
  if (!token) throw new ExportError('GitHub is not connected for this account.', 'not_connected', 409);

  const source = resolveTemplateSource(opts.templateId);
  if (!source) throw new ExportError('Unknown template.', 'unknown_template', 400);

  const targetDir = normalizeTargetDirectory(opts.targetDirectory);
  if (targetDir === null) throw new ExportError('Target directory is not allowed.', 'unsafe_path', 400);

  if (!opts.repoFullName?.includes('/')) throw new ExportError('Repository must be owner/name.', 'bad_repo', 400);
  const { owner, repo } = parseRepoName(opts.repoFullName);

  const info = await getRepoInfo(token, owner, repo);
  if (!info.canPush) {
    throw new ExportError('You do not have write access to that repository.', 'no_permission', 403);
  }

  const baseBranch = opts.baseBranch?.trim() || info.defaultBranch;
  const baseSha = await resolveExactBranchHead(token, owner, repo, baseBranch);
  if (!baseSha) {
    throw new ExportError(
      `Base branch "${baseBranch}" was not found. An empty repository needs an initial commit first.`,
      'branch_failed',
      409,
    );
  }

  const built = buildTemplateFiles({
    templateId: opts.templateId,
    projectName: opts.projectName,
    userPrompt: opts.userPrompt,
  });
  if (!built) throw new ExportError('Unknown template.', 'unknown_template', 400);

  // Prefix with the optional target directory and validate every resulting path.
  const candidates: ProjectFile[] = [];
  for (const file of built.files) {
    const path = targetDir ? `${targetDir}/${file.path}` : file.path;
    if (!isSafeRepoPath(path)) {
      throw new ExportError(`Refusing to write unsafe path: ${path}`, 'unsafe_path', 400);
    }
    candidates.push({ path, content: file.content });
  }

  // Inspect the repository before writing so nothing is clobbered silently.
  const existing = await listExistingPaths(token, owner, repo, baseSha);
  const plan: ExportPlanFile[] = [];
  const toWrite: ProjectFile[] = [];
  for (const file of candidates) {
    if (existing.has(file.path)) {
      plan.push({ path: file.path, status: 'skip-conflict', bytes: Buffer.byteLength(file.content, 'utf8') });
      continue;
    }
    plan.push({ path: file.path, status: 'create', bytes: Buffer.byteLength(file.content, 'utf8') });
    toWrite.push(file);
  }

  const warnings: string[] = [];
  const skipped = plan.filter((entry) => entry.status === 'skip-conflict');
  if (skipped.length) {
    warnings.push(
      `${skipped.length} file(s) already exist and were left untouched: ${skipped
        .slice(0, 8)
        .map((entry) => entry.path)
        .join(', ')}${skipped.length > 8 ? '…' : ''}`,
    );
  }

  if (!toWrite.length) {
    throw new ExportError(
      'Every template file already exists in that location. Choose a target directory to avoid overwriting your work.',
      'nothing_to_write',
      409,
    );
  }

  // Feature branch only — never the default branch.
  await createBranch(token, owner, repo, opts.branch, baseSha);
  const branchSha = (await resolveExactBranchHead(token, owner, repo, opts.branch)) ?? baseSha;

  const commitSha = await commitFiles(
    token,
    owner,
    repo,
    opts.branch,
    branchSha,
    toWrite,
    `Add ${source.slug} template via Xroga AI`,
  );

  const missingCritical = source.criticalPaths.filter((critical) => {
    const full = targetDir ? `${targetDir}/${critical}` : critical;
    return !toWrite.some((file) => file.path === full) && !existing.has(full);
  });
  if (missingCritical.length) {
    warnings.push(`Expected files were not written: ${missingCritical.join(', ')}`);
  }

  const pr = await openPullRequest(
    token,
    owner,
    repo,
    opts.branch,
    baseBranch,
    `Add ${source.slug} template`,
    [
      `Adds the **${source.slug}** template (v${source.version}) generated with Xroga AI.`,
      '',
      `Files added: ${toWrite.length}`,
      skipped.length ? `Existing files left untouched: ${skipped.length}` : '',
      '',
      'Review the diff before merging.',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  if (pr.warning) warnings.push(pr.warning);

  return {
    ok: true,
    repoFullName: `${owner}/${repo}`,
    branch: opts.branch,
    baseBranch,
    commitSha,
    pullRequestUrl: pr.url,
    pullRequestNumber: pr.number,
    filesCreated: toWrite.length,
    filesSkipped: skipped.length,
    plan,
    warnings,
  };
}
