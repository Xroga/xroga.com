import { getSupabaseAdmin } from '../../config/supabase.js';
import {
  deployStaticSite,
  deployStaticSiteWithToken,
  ensureManagedVercelProjectPublic,
  pollDeploymentReady,
} from '../../lib/vercel.js';
import { syncEnvVarsToVercelProject, type VercelEnvSyncResult } from '../../lib/vercelEnv.js';
import { deployToNetlify, pollNetlifyDeploy } from '../../lib/netlify.js';
import { verifyLivePreviewUrl } from '../../lib/deployVerify.js';
import { normalizeBuildFiles } from '../../lib/normalizeBuildSource.js';
import { buildInlinePreviewDocument } from '../../lib/landingPreview.js';
import { vercelStaticSiteJson } from '../../lib/vercelStaticConfig.js';
import { getSecret } from '../../config/envSecrets.js';
import { getGitHubToken, isGitHubConnected as checkGitHubConnected, getGitHubStorageMeta, setGithubDefaultRepo } from './githubAuth.js';
import { getVercelToken } from './vercelAuth.js';
import {
  DEFAULT_REPOSITORY_VISIBILITY,
  MAX_NAME_COLLISION_RETRIES,
  RepoCreateError,
  classifyRepoCreateFailure,
  describeRepoCreateFailure,
  nextCandidateName,
  readRepositoryResponse,
  type GitHubErrorBody,
  type RepoCreateFailure,
  type RepositoryVisibility,
} from './githubRepoCreation.js';
import {
  ExactBranchWriteError,
  resolveExactWritableBranch,
  verifyBranchHead,
  type BranchApi,
} from './githubBranchSafety.js';
import {
  AtomicWriteError,
  describeAtomicWriteFailure,
  writeAtomically,
  type AtomicWriteRecord,
} from './githubAtomicWrite.js';
import { makeAtomicWriteApi } from './githubAtomicTransport.js';
import {
  describeMutationRejection,
  deriveFileSyncMutations,
  MutationPlanError,
} from './githubMutationPlan.js';
import {
  describeTreeSnapshotFailure,
  readStartingTree,
  TreeSnapshotError,
} from './githubTreeSnapshot.js';
import {
  authorizeBranchWrite,
  BranchAuthorizationError,
  describeBranchAuthorizationRefusal,
} from './githubBranchAuthorization.js';
import { planRunBranch, RunBranchError } from './githubRunBranch.js';
import { resolveProviderEnvForDeploy } from './userProviderKeys.js';
import {
  getCachedRepoAnalysis,
  setCachedRepoAnalysis,
  invalidateRepoAnalysis,
} from '../../lib/repoAnalysisCache.js';
import { HACKATHON_REPO_TREE_SAMPLE } from '../../config/modelRegistry.js';

export interface ProjectFile {
  path: string;
  content: string;
}

export interface GitHubPushResult {
  repoName: string;
  repoUrl: string;
  htmlUrl: string;
  /** Tip commit SHA after push (for rollback) */
  commitSha?: string;
  branch?: string;
  /** Set when the build was proposed as a pull request rather than committed directly. */
  pullRequestUrl?: string;
  /** Non-fatal: the commit landed but something after it did not. */
  warning?: string;
}

export type ConnectedRepositoryState =
  | { status: 'empty'; branch: string }
  | { status: 'head'; branch: string; headSha: string; sourcePaths?: readonly string[] }
  | { status: 'unavailable'; branch: string; reason: string };

/** Classify only response metadata; never expose GitHub response bodies or credentials. */
export function describeGitHubInspectionResponse(
  response: Pick<Response, 'status' | 'headers'>,
  target: 'repository' | 'branch',
): string {
  const rateLimited =
    response.status === 429 ||
    (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0');
  if (rateLimited) {
    const resetSeconds = Number(response.headers.get('x-ratelimit-reset'));
    const resetAt = Number.isFinite(resetSeconds) && resetSeconds > 0
      ? new Date(resetSeconds * 1000).toISOString()
      : null;
    return resetAt
      ? `GitHub API rate limit is temporarily exhausted; try again after ${resetAt}`
      : 'GitHub API rate limit is temporarily exhausted; try again shortly';
  }
  if (response.status === 401 || response.status === 403) {
    return `GitHub authorization cannot inspect the target ${target}`;
  }
  return `GitHub ${target} inspection failed (${response.status})`;
}

/**
 * The neutral marker is not product source. GitHub rounds very small repositories to
 * `size: 0`, but that number alone cannot distinguish the marker from a tiny real project.
 * Only this exact tree is safe to resume as a source-empty product repository.
 */
export function isNeutralXrogaBootstrapTree(
  entries: Array<{ path: string; type: string }>,
): boolean {
  const blobs = entries.filter((entry) => entry.type === 'blob');
  return (
    blobs.length === 1 &&
    blobs[0]?.path === '.xroga/bootstrap' &&
    entries.every(
      (entry) =>
        (entry.path === '.xroga' && entry.type === 'tree') ||
        (entry.path === '.xroga/bootstrap' && entry.type === 'blob'),
    )
  );
}

export interface DeployPipelineResult {
  github: GitHubPushResult;
  deployUrl: string;
  deployPlatform: 'vercel' | 'netlify' | 'none';
  deployVerified: boolean;
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
  vercelPreviewUrl?: string;
  netlifyPreviewUrl?: string;
  vercel?: PlatformDeployResult;
  netlify?: PlatformDeployResult;
  deployError?: string;
}

interface GitHubIntegrationRow {
  access_token: string;
  repo_strategy: 'auto' | 'monorepo' | 'manual';
  default_repo: string | null;
}

interface PreviewDeployResult {
  deployUrl: string;
  platform: 'vercel' | 'netlify';
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
}

async function getIntegration(userId: string): Promise<GitHubIntegrationRow | null> {
  const token = await getGitHubToken(userId);
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from('github_integrations')
    .select('access_token, repo_strategy, default_repo')
    .eq('user_id', userId)
    .maybeSingle();

  if (data?.access_token) return data as GitHubIntegrationRow;

  const storageMeta = await getGitHubStorageMeta(userId);
  return {
    access_token: token,
    repo_strategy: storageMeta?.repo_strategy ?? 'auto',
    default_repo: storageMeta?.default_repo ?? null,
  };
}

export async function isGitHubConnected(userId: string): Promise<boolean> {
  return checkGitHubConnected(userId);
}

/** Sticky ship target from first create / last update — used when client omits githubTargetRepo. */
export async function getGithubDefaultRepo(userId: string): Promise<string | null> {
  const integration = await getIntegration(userId);
  const repo = integration?.default_repo?.trim() || null;
  return repo?.includes('/') ? repo : null;
}

/**
 * Inspect the real target branch before a retry decides whether it can reuse
 * project memory. This never returns credentials or provider response bodies.
 */
export async function inspectConnectedRepositoryState(
  userId: string,
  repoFullName: string,
  branch = 'main',
): Promise<ConnectedRepositoryState> {
  const integration = await getIntegration(userId);
  if (!integration?.access_token) {
    return { status: 'unavailable', branch, reason: 'GitHub is not connected' };
  }

  const [owner, repo, extra] = repoFullName.split('/');
  if (!owner || !repo || extra) {
    return { status: 'unavailable', branch, reason: 'Invalid GitHub repository target' };
  }

  const repoResponse = await ghFetch(integration.access_token, `/repos/${owner}/${repo}`);
  if (!repoResponse.ok) {
    const reason =
      repoResponse.status === 404
        ? 'GitHub repository was not found or is not authorized'
        : describeGitHubInspectionResponse(repoResponse, 'repository');
    return { status: 'unavailable', branch, reason };
  }

  const repository = (await repoResponse.json()) as { size?: number };

  const refResponse = await ghFetch(
    integration.access_token,
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
  );
  if (!refResponse.ok) {
    if (refResponse.status === 409 || (refResponse.status === 404 && (repository.size ?? 0) === 0)) {
      return { status: 'empty', branch };
    }
    const reason =
      refResponse.status === 404
        ? `GitHub branch ${branch} was not found`
        : describeGitHubInspectionResponse(refResponse, 'branch');
    return { status: 'unavailable', branch, reason };
  }

  const ref = (await refResponse.json()) as { object?: { sha?: string } };
  const headSha = ref.object?.sha;
  if (!headSha || !/^[0-9a-f]{7,40}$/i.test(headSha)) {
    return { status: 'unavailable', branch, reason: 'GitHub returned an invalid branch head' };
  }

  let sourcePaths: string[];
  try {
    const api = makeAtomicWriteApi(
      ghFetch,
      integration.access_token,
      owner,
      repo,
    );
    const snapshot = await readStartingTree(api, headSha);
    if (isNeutralXrogaBootstrapTree(snapshot.entries)) {
      return { status: 'empty', branch };
    }
    sourcePaths = snapshot.entries
      .filter((entry) => entry.type === 'blob')
      .map((entry) => entry.path)
      .sort();
  } catch (error) {
    const reason =
      error instanceof TreeSnapshotError
        ? describeTreeSnapshotFailure(error.reason)
        : 'GitHub could not verify the repository tree';
    return { status: 'unavailable', branch, reason };
  }
  return {
    status: 'head',
    branch,
    headSha,
    sourcePaths,
  };
}

export async function ghFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
}

async function getGitHubUsername(token: string): Promise<string> {
  const res = await ghFetch(token, '/user');
  if (!res.ok) throw new Error(`GitHub user lookup failed: ${res.status}`);
  const user = (await res.json()) as { login: string };
  return user.login;
}

interface GitCommitIdentity {
  name: string;
  email: string;
}

/** XROGA bot identity — set email to a verified GitHub account email for contribution graph avatar. */
function xrogaBotIdentity(): GitCommitIdentity {
  return {
    name: process.env.XROGA_GITHUB_BOT_NAME?.trim() || 'XROGA AI',
    email:
      process.env.XROGA_GITHUB_BOT_EMAIL?.trim() ||
      '41898282+xroga-ai@users.noreply.github.com',
  };
}

async function getGitHubCoAuthor(token: string): Promise<GitCommitIdentity | null> {
  try {
    const res = await ghFetch(token, '/user');
    if (!res.ok) return null;
    const user = (await res.json()) as { login: string; name?: string | null; id: number };
    return {
      name: (user.name?.trim() || user.login).trim(),
      email: `${user.id}+${user.login}@users.noreply.github.com`,
    };
  } catch {
    return null;
  }
}

function buildBrandedCommitMessage(base: string, coAuthor?: GitCommitIdentity | null): string {
  const bot = xrogaBotIdentity();
  let msg = `${base}\n\nBuilt with ${bot.name} — Black Hole V∞ (https://xroga.com)`;
  if (coAuthor) {
    msg += `\n\nCo-authored-by: ${coAuthor.name} <${coAuthor.email}>`;
  }
  return msg;
}

function gitCommitAuthorFields() {
  const bot = xrogaBotIdentity();
  const date = new Date().toISOString();
  return {
    author: { name: bot.name, email: bot.email, date },
    committer: { name: bot.name, email: bot.email, date },
  };
}

async function createRepo(
  token: string,
  name: string,
  visibility: RepositoryVisibility = DEFAULT_REPOSITORY_VISIBILITY,
): Promise<{ fullName: string; htmlUrl: string; owner: string; repo: string; visibility: RepositoryVisibility; defaultBranch: string }> {
  let lastFailure: RepoCreateFailure = 'unknown';

  for (let attempt = 0; attempt < MAX_NAME_COLLISION_RETRIES; attempt += 1) {
    const candidate = nextCandidateName(name, attempt);
    const res = await ghFetch(token, '/user/repos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: candidate,
        private: visibility === 'private',
        auto_init: true,
        description: 'Built with XROGA AI Swarm',
      }),
    });

    if (res.ok) {
      const created = readRepositoryResponse(await res.json());
      if (!created) {
        throw new RepoCreateError('unknown', res.status, 'GitHub returned an unrecognised repository response.');
      }
      return {
        fullName: created.fullName,
        htmlUrl: created.htmlUrl,
        owner: created.owner,
        repo: created.repo,
        visibility: created.visibility,
        defaultBranch: created.defaultBranch,
      };
    }

    const body = (await res.json().catch(() => null)) as GitHubErrorBody | null;
    lastFailure = classifyRepoCreateFailure(res.status, body);

    if (lastFailure !== 'name_taken') {
      throw new RepoCreateError(lastFailure, res.status, describeRepoCreateFailure(lastFailure, candidate));
    }
  }

  throw new RepoCreateError(
    lastFailure,
    422,
    `Could not find an available repository name based on "${name}" after ${MAX_NAME_COLLISION_RETRIES} attempts.`,
  );
}

function makeBranchApi(token: string, owner: string, repo: string): BranchApi {
  return {
    async getRef(branch: string) {
      const res = await ghFetch(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { object?: { sha?: string } };
      return typeof data.object?.sha === 'string' ? { sha: data.object.sha } : null;
    },
    async createRef(branch: string, sha: string) {
      const res = await ghFetch(token, `/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
      });
      return res.ok;
    },
  };
}

export async function getBranchHeadSha(
  token: string,
  owner: string,
  repo: string,
  preferredBranch?: string
): Promise<{ sha: string | null; branch: string }> {
  const candidates = [
    ...(preferredBranch ? [preferredBranch] : []),
    'main',
    'master',
  ];
  for (const branch of candidates) {
    const res = await ghFetch(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    if (res.ok) {
      const data = (await res.json()) as { object: { sha: string } };
      return { sha: data.object.sha, branch };
    }
  }
  return { sha: null, branch: preferredBranch ?? 'main' };
}

async function atomicWriteApiFor(token: string, owner: string, repo: string) {
  return makeAtomicWriteApi(ghFetch, token, owner, repo, {
    commitIdentity: gitCommitAuthorFields(),
  });
}

export interface AtomicPushOptions {
  /** Paths to remove from the target branch. */
  deletePaths?: string[];
  /** Set to open a pull request from the written branch back to this base. */
  pullRequest?: { base: string; title: string; body: string };
  /** Explicit approval to commit straight to a default or protected branch. */
  directWriteAuthorized?: boolean;
  /** Commit to create the branch from, when it does not exist yet. */
  createBranchFromSha?: string | null;
  /** The repository's default branch, so authorization can recognise it. */
  defaultBranch?: string;
}

async function pushFilesAtomically(
  token: string,
  owner: string,
  repo: string,
  files: ProjectFile[],
  message: string,
  branch: string,
  options: AtomicPushOptions = {},
): Promise<AtomicWriteRecord> {
  const api = await atomicWriteApiFor(token, owner, repo);

  return writeAtomically(
    api,
    { owner, repo },
    {
      branch,
      createBranchFromSha: options.createBranchFromSha ?? null,
      mutations: (tree) => deriveFileSyncMutations(tree, files, options.deletePaths ?? []),
      message,
      ...(options.defaultBranch ? { defaultBranch: options.defaultBranch } : {}),
      ...(options.pullRequest ? { pullRequest: options.pullRequest } : {}),
      ...(options.directWriteAuthorized === true ? { directWriteAuthorized: true } : {}),
    },
  );
}

interface ConnectedRepositoryPushOptions {
  requestedBranch: string;
  deletePaths: string[];
  runId?: string;
  /** Refuse before writing unless this is still the exact branch HEAD. */
  expectedStartingHeadSha?: string;
  directWriteAuthorized: boolean;
  allowEmptyBootstrap: boolean;
}

async function pushToConnectedRepository(
  token: string,
  owner: string,
  repo: string,
  files: ProjectFile[],
  message: string,
  options: ConnectedRepositoryPushOptions,
): Promise<AtomicWriteRecord> {
  const api = await atomicWriteApiFor(token, owner, repo);
  const defaultBranch = await getDefaultBranch(token, owner, repo);

  if (options.allowEmptyBootstrap && (await api.isRepositoryEmpty())) {
    return writeAtomically(
      api,
      { owner, repo },
      {
        branch: options.requestedBranch,
        mutations: (tree) => deriveFileSyncMutations(tree, files, options.deletePaths),
        message,
        defaultBranch: defaultBranch || options.requestedBranch,
        directWriteAuthorized: true,
        allowEmptyBootstrap: true,
      },
    );
  }

  const needsAuthorization = await branchWriteNeedsAuthorization(
    api,
    options.requestedBranch,
    defaultBranch,
  );

  if (!needsAuthorization || options.directWriteAuthorized) {
    return writeAtomically(
      api,
      { owner, repo },
      {
        branch: options.requestedBranch,
        mutations: (tree) => deriveFileSyncMutations(tree, files, options.deletePaths),
        message,
        defaultBranch,
        ...(options.expectedStartingHeadSha
          ? { expectedStartingHeadSha: options.expectedStartingHeadSha }
          : {}),
        ...(options.directWriteAuthorized ? { directWriteAuthorized: true } : {}),
      },
    );
  }

  if (!options.runId) {
    throw new BranchAuthorizationError(
      'default_branch_requires_authorization',
      options.requestedBranch,
      `"${options.requestedBranch}" needs explicit approval before Xroga commits to it, and ` +
        'this build has no run id to open a pull request from instead.',
    );
  }

  const head = await api.getRef(options.requestedBranch);
  if (!head) {
    throw new ExactBranchWriteError(
      'branch_missing',
      options.requestedBranch,
      `Branch "${options.requestedBranch}" does not exist, so there is nothing to base this build on.`,
    );
  }

  const runBranch = await planRunBranch(api, {
    runId: options.runId,
    sourceSha: head.sha,
    baseBranch: options.requestedBranch,
  });

  return writeAtomically(
    api,
    { owner, repo },
    {
      branch: runBranch.branch,
      createBranchFromSha: runBranch.sourceSha,
      mutations: (tree) => deriveFileSyncMutations(tree, files, options.deletePaths),
      message,
      defaultBranch,
      pullRequest: {
        base: runBranch.baseBranch,
        title: message.split('\n')[0] ?? 'XROGA build update',
        body:
          `Built by XROGA from \`${runBranch.baseBranch}\` at \`${runBranch.sourceSha.slice(0, 7)}\`.\n\n` +
          'Applied as a single commit. Review and merge when the change looks right.',
      },
    },
  );
}

async function getDefaultBranch(token: string, owner: string, repo: string): Promise<string> {
  try {
    const res = await ghFetch(token, `/repos/${owner}/${repo}`);
    if (!res.ok) return '';
    const data = (await res.json()) as { default_branch?: string };
    return typeof data.default_branch === 'string' ? data.default_branch : '';
  } catch {
    return '';
  }
}

async function branchWriteNeedsAuthorization(
  api: Awaited<ReturnType<typeof atomicWriteApiFor>>,
  branch: string,
  defaultBranch: string,
): Promise<boolean> {
  try {
    const decision = await authorizeBranchWrite(api, { branch, defaultBranch });
    return decision.requiresAuthorization;
  } catch (error) {
    if (error instanceof BranchAuthorizationError) return true;
    throw error;
  }
}

export function describeGitHubWriteFailure(error: unknown): string {
  if (error instanceof AtomicWriteError) return describeAtomicWriteFailure(error);
  if (error instanceof BranchAuthorizationError) {
    return describeBranchAuthorizationRefusal(error.reason);
  }
  if (error instanceof MutationPlanError) return describeMutationRejection(error.rejection);
  if (error instanceof TreeSnapshotError) return describeTreeSnapshotFailure(error.reason);
  if (error instanceof RunBranchError) {
    return 'A branch could not be reserved for this build, so nothing was written.';
  }
  if (error instanceof ExactBranchWriteError) {
    return `The target branch could not be resolved, so nothing was written (${error.reason.replace(/_/g, ' ')}).`;
  }
  return (error as Error)?.message ?? 'The change was not applied.';
}

export interface GitHubPushOptions {
  slug?: string;
  targetRepo?: string;
  targetBranch?: string;
  /** Paths to remove from the target branch (Git Data API sha:null). */
  deletePaths?: string[];
  /** Optional compare-before-write guard, used by one-click Undo. */
  expectedStartingHeadSha?: string;
  runId?: string;
  directWriteAuthorized?: boolean;
  allowEmptyBootstrap?: boolean;
  visibility?: RepositoryVisibility;
}

export async function pushBuildToGitHub(
  userId: string,
  files: ProjectFile[],
  slugOrOpts?: string | GitHubPushOptions
): Promise<GitHubPushResult> {
  const opts: GitHubPushOptions =
    typeof slugOrOpts === 'string' ? { slug: slugOrOpts } : slugOrOpts ?? {};

  const integration = await getIntegration(userId);
  if (!integration?.access_token) throw new Error('GitHub not connected');

  const token = integration.access_token;
  const coAuthor = await getGitHubCoAuthor(token);

  const selectedRepo =
    opts.targetRepo ??
    (integration.default_repo?.includes('/') ? integration.default_repo : null);

  if (selectedRepo?.includes('/')) {
    const [owner, repo] = selectedRepo.split('/');
    const requestedBranch = opts.targetBranch ?? 'main';
    const htmlUrl = `https://github.com/${owner}/${repo}`;
    const message = buildBrandedCommitMessage(
      `XROGA build update — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
      coAuthor,
    );

    const record = await pushToConnectedRepository(token, owner!, repo!, files, message, {
      requestedBranch,
      deletePaths: opts.deletePaths ?? [],
      runId: opts.runId,
      expectedStartingHeadSha: opts.expectedStartingHeadSha,
      directWriteAuthorized: opts.directWriteAuthorized === true,
      allowEmptyBootstrap: opts.allowEmptyBootstrap === true,
    });

    invalidateRepoAnalysis(userId, selectedRepo);
    await setGithubDefaultRepo(userId, selectedRepo).catch(() => undefined);
    return {
      repoName: `${owner}/${repo}`,
      repoUrl: htmlUrl,
      htmlUrl,
      commitSha: record.resultingCommitSha,
      branch: record.branch,
      ...(record.pullRequest ? { pullRequestUrl: record.pullRequest.htmlUrl } : {}),
      ...(record.pullRequestWarning ? { warning: record.pullRequestWarning } : {}),
    };
  }

  const repoName = opts.slug ?? `xroga-build-${Date.now()}`;

  const created = await createRepo(token, repoName, opts.visibility ?? DEFAULT_REPOSITORY_VISIBILITY);
  const owner = created.owner;
  const repo = created.repo;
  const htmlUrl = created.htmlUrl;

  const record = await pushFilesAtomically(
    token,
    owner,
    repo,
    files,
    buildBrandedCommitMessage('Initial XROGA build', coAuthor),
    created.defaultBranch,
    { defaultBranch: created.defaultBranch, directWriteAuthorized: true },
  );

  const fullName = `${owner}/${repo}`;
  await setGithubDefaultRepo(userId, fullName).catch((err) => {
    console.warn('[githubDeploy] default_repo persist:', (err as Error).message);
  });

  return {
    repoName: fullName,
    repoUrl: `https://github.com/${owner}/${repo}`,
    htmlUrl,
    commitSha: record.resultingCommitSha,
    branch: record.branch,
  };
}

export function landingFilesFromOutput(html: string, css: string, js: string): ProjectFile[] {
  const normalized = normalizeBuildFiles(html, css, js);
  const fullHtml = normalized.html.includes('<!DOCTYPE')
    ? normalized.html
    : `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body>${normalized.html}<script src="script.js"></script></body></html>`;

  return [
    { path: 'index.html', content: fullHtml },
    { path: 'styles.css', content: normalized.css },
    { path: 'script.js', content: normalized.js },
    { path: 'README.md', content: '# XROGA Build\n\nAuto-generated by XROGA AI Swarm.\n' },
  ];
}

export function landingDeployFilesFromOutput(html: string, css: string, js: string): ProjectFile[] {
  const merged = buildInlinePreviewDocument(html, css, js);
  return [
    { path: 'index.html', content: merged },
    { path: 'vercel.json', content: vercelStaticSiteJson() },
  ];
}

function isFrameworkSourceTree(files: ProjectFile[]): boolean {
  const pkg = files.find((f) => f.path === 'package.json')?.content ?? '';
  if (/"next"|"expo"|"vite"|"react-native"/i.test(pkg)) return true;
  return files.some(
    (f) =>
      f.path.startsWith('app/') ||
      f.path.startsWith('src/') ||
      f.path === 'next.config.ts' ||
      f.path === 'next.config.js' ||
      f.path === 'app.json',
  );
}

function isPreviewOnlyProduct(files: ProjectFile[]): boolean {
  if (files.some((f) => f.path === 'manifest.json')) return true;
  if (files.some((f) => f.path === 'app.json')) {
    const appJson = files.find((f) => f.path === 'app.json')?.content ?? '';
    if (/"expo"/i.test(appJson) || /"android"/i.test(appJson) || /"ios"/i.test(appJson)) return true;
  }
  const pkg = files.find((f) => f.path === 'package.json')?.content ?? '';
  if (/"electron"/i.test(pkg) && !/"next"/i.test(pkg)) return true;
  if (/"expo"/i.test(pkg) && !/"next"/i.test(pkg)) return true;
  return false;
}

function hostingDeployFiles(files: ProjectFile[]): ProjectFile[] {
  if (isPreviewOnlyProduct(files)) {
    const preview = files.find((f) => f.path === 'index.html');
    const readme = files.find((f) => f.path === 'README.md');
    const out: ProjectFile[] = [];
    if (preview) out.push(preview);
    if (readme) out.push(readme);
    if (out.length) return out;
  }

  if (isFrameworkSourceTree(files)) {
    return files.filter(
      (f) =>
        !/node_modules\/|package-lock\.json|yarn\.lock|\.(png|jpe?g|gif|webp|ico)$/i.test(f.path) &&
        (!f.path.endsWith('.md') || f.path === 'README.md'),
    );
  }

  const html = files.find((f) => f.path === 'index.html')?.content ?? '';
  const css = files.find((f) => f.path === 'styles.css')?.content ?? '';
  const js = files.find((f) => f.path === 'script.js')?.content ?? '';
  if (!html.trim()) return files.filter((f) => !f.path.endsWith('.md'));

  const hasExternalCssLink = /<link[^>]+href=["']styles\.css/i.test(html);
  const hasInlineStyle = /<style[^>]*>[\s\S]{40,}<\/style>/i.test(html);
  if (!hasExternalCssLink && hasInlineStyle && !css.trim()) {
    return [{ path: 'index.html', content: html }];
  }

  return landingDeployFilesFromOutput(html, css, js);
}

function frameworkForDeploy(files: ProjectFile[]): 'nextjs' | 'vite' | null {
  if (isPreviewOnlyProduct(files)) return null;
  const pkg = files.find((f) => f.path === 'package.json')?.content ?? '';
  if (/"next"/i.test(pkg)) return 'nextjs';
  if (/"vite"/i.test(pkg) && !/"expo"/i.test(pkg) && !/"electron"/i.test(pkg)) return 'vite';
  return null;
}

export interface UserVercelDeployOptions {
  teamId?: string;
  githubRepo?: string;
  githubBranch?: string;
}

export interface VercelGitProjectResult {
  created: boolean;
  linked: boolean;
  projectName: string;
  error?: string;
}

function vercelTeamQuery(teamId?: string): string {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

export async function ensureVercelGitProject(opts: {
  token: string;
  projectName: string;
  githubRepo?: string;
  teamId?: string;
  framework?: 'nextjs' | 'vite' | null;
}): Promise<VercelGitProjectResult> {
  const projectName = opts.projectName.trim();
  const query = vercelTeamQuery(opts.teamId);
  const headers = {
    Authorization: `Bearer ${opts.token}`,
    'Content-Type': 'application/json',
  };

  const existing = await fetch(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(projectName)}${query}`,
    { headers },
  );
  if (existing.ok) {
    const project = (await existing.json()) as {
      link?: { type?: string; repo?: string; org?: string; productionBranch?: string } | null;
    };
    const link = project.link;
    const linkedRepo = link?.repo
      ? link.repo.includes('/')
        ? link.repo
        : link.org
          ? `${link.org}/${link.repo}`
          : link.repo
      : '';
    const linked = Boolean(
      opts.githubRepo &&
        link?.type === 'github' &&
        linkedRepo.toLowerCase() === opts.githubRepo.toLowerCase(),
    );
    return { created: false, linked, projectName };
  }

  if (existing.status !== 404 || !opts.githubRepo) {
    const detail = (await existing.text()).slice(0, 180);
    return {
      created: false,
      linked: false,
      projectName,
      error: `Could not inspect Vercel project (${existing.status})${detail ? `: ${detail}` : ''}`,
    };
  }

  const created = await fetch(`https://api.vercel.com/v11/projects${query}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: projectName,
      ...(opts.framework ? { framework: opts.framework } : {}),
      gitRepository: { type: 'github', repo: opts.githubRepo },
    }),
  });
  if (!created.ok) {
    const detail = (await created.text()).slice(0, 220);
    return {
      created: false,
      linked: false,
      projectName,
      error:
        `Vercel could not create the Git-linked project (${created.status})` +
        (detail ? `: ${detail}` : ''),
    };
  }
  return { created: true, linked: true, projectName };
}

async function deployToVercel(_projectSlug: string, staticFiles: ProjectFile[]): Promise<PreviewDeployResult> {
  const vercelFiles = staticFiles.map((f) => ({ file: f.path, data: f.content }));
  const framework = frameworkForDeploy(staticFiles);
  const projectName = managedVercelProjectName();
  await ensureManagedVercelProjectPublic(projectName);
  const deployment = await deployStaticSite(projectName, vercelFiles, {
    framework,
    sourceDeploy: Boolean(framework),
    target: 'preview',
  });
  const deployUrl = await pollDeploymentReady(
    deployment.deploymentId,
    deployment.deployUrl,
    undefined,
    framework ? 240_000 : 180_000,
  );
  return {
    deployUrl,
    platform: 'vercel',
    vercelDeploymentId: deployment.deploymentId,
  };
}

export function hasManagedVercelDeployment(): boolean {
  return isManagedVercelCredentialCandidate(getSecret('VERCEL_API_KEY'));
}

export function isManagedVercelCredentialCandidate(token?: string): boolean {
  const value = token?.trim();
  if (!value) return false;
  if (/^vck(?:_|$)/i.test(value)) return false;
  if (/^vc[a-z](?:_|$)/i.test(value)) {
    return /^vc(?:p|i)(?:_|$)/i.test(value);
  }
  return true;
}

export function managedVercelProjectName(): string {
  const configured = process.env.VERCEL_MANAGED_PROJECT_NAME?.trim() || 'xroga-managed-builds';
  const clean = configured
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
  return clean || 'xroga-managed-builds';
}

export async function deployManagedVercelPreview(
  projectSlug: string,
  files: ProjectFile[],
  _ownerKey?: string,
): Promise<PlatformDeployResult> {
  if (!hasManagedVercelDeployment()) {
    return {
      deployUrl: '',
      deployVerified: false,
      error: 'Managed Vercel deployment is not configured',
    };
  }

  const staticFiles = hostingDeployFiles(files);
  try {
    const result = await deployToVercel(projectSlug, staticFiles);
    const verified = await verifyLivePreviewUrl(result.deployUrl);
    return {
      deployUrl: result.deployUrl,
      deployVerified: verified,
      authority: 'managed',
      vercelDeploymentId: result.vercelDeploymentId,
      ...(!verified ? { error: 'Vercel URL failed verification' } : {}),
    };
  } catch (error) {
    const message = (error as Error).message || 'Managed Vercel deployment failed';
    return {
      deployUrl: '',
      deployVerified: false,
      error: message.slice(0, 240),
    };
  }
}

export async function syncUserVaultToVercel(
  userId: string,
  projectSlug: string,
  teamId?: string,
): Promise<VercelEnvSyncResult | null> {
  const token = await getVercelToken(userId);
  if (!token) return null;
  const env = await resolveProviderEnvForDeploy(userId);
  if (!Object.keys(env).length) {
    return { ok: true, projectName: projectSlug, upserted: [], skipped: [] };
  }
  return syncEnvVarsToVercelProject({
    token,
    projectName: projectSlug,
    env,
    teamId,
  });
}

async function deployToVercelWithUserToken(
  userId: string,
  projectSlug: string,
  staticFiles: ProjectFile[],
  opts: UserVercelDeployOptions = {},
): Promise<PreviewDeployResult & { envSync?: VercelEnvSyncResult }> {
  const token = await getVercelToken(userId);
  if (!token) throw new Error('Vercel not connected — user must authorize under Integrations');

  const framework = frameworkForDeploy(staticFiles);
  if (opts.githubRepo) {
    const gitProject = await ensureVercelGitProject({
      token,
      projectName: projectSlug,
      githubRepo: opts.githubRepo,
      teamId: opts.teamId,
      framework,
    });
    if (gitProject.error) {
      console.warn('[vercel] Git project link skipped:', gitProject.error);
    } else if (gitProject.linked) {
      console.info(
        `[vercel] ${gitProject.created ? 'created' : 'verified'} Git-linked project ${projectSlug} → ${opts.githubRepo}`,
      );
    }
  }

  let envSync: VercelEnvSyncResult | undefined;
  try {
    envSync = (await syncUserVaultToVercel(userId, projectSlug, opts.teamId)) ?? undefined;
    if (envSync && !envSync.ok && envSync.error) {
      console.warn('[vercel] env sync partial/failed:', envSync.error);
    } else if (envSync?.upserted?.length) {
      console.log(`[vercel] synced ${envSync.upserted.length} env var(s) to project ${projectSlug}`);
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.warn('[vercel] env sync skipped:', msg);
    envSync = {
      ok: false,
      projectName: projectSlug,
      upserted: [],
      skipped: [],
      error: msg.slice(0, 240),
    };
  }

  const vercelFiles = staticFiles.map((f) => ({ file: f.path, data: f.content }));
  const deployment = await deployStaticSiteWithToken(projectSlug, vercelFiles, token, {
    framework,
    sourceDeploy: Boolean(framework),
    teamId: opts.teamId ?? null,
  });
  const deployUrl = await pollDeploymentReady(
    deployment.deploymentId,
    deployment.deployUrl,
    token,
    framework ? 240_000 : 180_000,
    opts.teamId ?? null,
  );
  return {
    deployUrl,
    platform: 'vercel',
    vercelDeploymentId: deployment.deploymentId,
    envSync,
  };
}

async function deployToNetlifyPreview(projectSlug: string, staticFiles: ProjectFile[]): Promise<PreviewDeployResult> {
  const netlifyFiles = staticFiles.map((f) => ({ path: f.path, content: f.content }));
  const deployment = await deployToNetlify(projectSlug, netlifyFiles);
  const deployUrl = await pollNetlifyDeploy(deployment.deployId, deployment.deployUrl);
  return {
    deployUrl,
    platform: 'netlify',
    netlifyDeployId: deployment.deployId,
  };
}

export async function deployStaticPreview(
  projectSlug: string,
  files: ProjectFile[]
): Promise<{ deployUrl: string; platform: 'vercel' | 'netlify' | 'none'; deployVerified: boolean; vercelDeploymentId?: string; netlifyDeployId?: string }> {
  const staticFiles = hostingDeployFiles(files);
  const hasVercel = Boolean(getSecret('VERCEL_API_KEY'));
  const hasNetlify = Boolean(getSecret('NETLIFY_ACCESS_TOKEN'));

  const attempts: Array<{ name: string; run: () => Promise<PreviewDeployResult> }> = [];
  if (hasVercel) attempts.push({ name: 'vercel', run: () => deployToVercel(projectSlug, staticFiles) });
  if (hasNetlify) attempts.push({ name: 'netlify', run: () => deployToNetlifyPreview(projectSlug, staticFiles) });
  if (hasVercel && hasNetlify) {
    attempts.push({ name: 'vercel-retry', run: () => deployToVercel(projectSlug, staticFiles) });
  }

  for (const attempt of attempts) {
    try {
      const result = await attempt.run();
      const verified = await verifyLivePreviewUrl(result.deployUrl);
      if (verified) {
        console.info(`[githubDeploy] Live preview verified on ${result.platform}: ${result.deployUrl}`);
        return {
          deployUrl: result.deployUrl,
          platform: result.platform,
          deployVerified: true,
          vercelDeploymentId: result.vercelDeploymentId,
          netlifyDeployId: result.netlifyDeployId,
        };
      }
      console.warn(`[githubDeploy] ${attempt.name} URL failed verification: ${result.deployUrl}`);
    } catch (err) {
      console.warn(`[githubDeploy] ${attempt.name}:`, (err as Error).message);
    }
  }

  return { deployUrl: '', platform: 'none', deployVerified: false };
}

export interface PlatformDeployResult {
  deployUrl: string;
  deployVerified: boolean;
  authority?: 'user' | 'managed';
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
  error?: string;
  envSync?: VercelEnvSyncResult;
}

export async function deployToAllPlatforms(
  projectSlug: string,
  files: ProjectFile[],
  userId?: string,
  opts: UserVercelDeployOptions = {},
): Promise<{
  vercel?: PlatformDeployResult;
  netlify?: PlatformDeployResult;
  deployUrl: string;
  deployPlatform: 'vercel' | 'netlify' | 'none';
  deployVerified: boolean;
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
  deployError?: string;
  envSync?: VercelEnvSyncResult;
}> {
  const staticFiles = hostingDeployFiles(files);
  const errors: string[] = [];

  let vercel: PlatformDeployResult | undefined;
  let netlify: PlatformDeployResult | undefined;
  let envSync: VercelEnvSyncResult | undefined;

  const userVercelToken = userId ? await getVercelToken(userId) : null;

  if (userVercelToken && userId) {
    try {
      const result = await deployToVercelWithUserToken(userId, projectSlug, staticFiles, opts);
      const verified = await verifyLivePreviewUrl(result.deployUrl);
      envSync = result.envSync;
      vercel = {
        deployUrl: result.deployUrl,
        deployVerified: verified,
        authority: 'user',
        vercelDeploymentId: result.vercelDeploymentId,
        envSync: result.envSync,
      };
      if (!verified) errors.push('Vercel URL failed verification');
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`Vercel: ${msg.slice(0, 120)}`);
      vercel = {
        deployUrl: '',
        deployVerified: false,
        authority: 'user',
        error: msg.slice(0, 240),
      };
    }
  }

  if ((!vercel?.deployUrl || !vercel.deployVerified) && hasManagedVercelDeployment()) {
    const managed = await deployManagedVercelPreview(projectSlug, staticFiles, userId);
    if (managed.deployUrl) {
      vercel = managed;
    } else {
      errors.push(`Managed Vercel: ${managed.error || 'deployment failed'}`);
      if (!vercel) vercel = managed;
    }
  } else if (!vercel) {
    const message = 'Managed Vercel deployment is not configured';
    errors.push(`Vercel: ${message}`);
    vercel = { deployUrl: '', deployVerified: false, error: message };
  }

  const primary =
    vercel?.deployVerified && vercel.deployUrl
      ? { url: vercel.deployUrl, platform: 'vercel' as const, id: vercel.vercelDeploymentId }
      : vercel?.deployUrl
        ? { url: vercel.deployUrl, platform: 'vercel' as const, id: vercel.vercelDeploymentId }
        : null;

  return {
    vercel,
    deployUrl: primary?.url ?? '',
    deployPlatform: primary?.platform ?? 'none',
    deployVerified: Boolean(vercel?.deployVerified),
    vercelDeploymentId: vercel?.vercelDeploymentId,
    deployError: primary ? undefined : errors.join(' · '),
    envSync,
  };
}

export async function deployPreviewToPlatform(
  projectSlug: string,
  files: ProjectFile[],
  platform: 'vercel' | 'netlify'
): Promise<PlatformDeployResult> {
  const staticFiles = hostingDeployFiles(files);
  try {
    const result =
      platform === 'vercel'
        ? await deployToVercel(projectSlug, staticFiles)
        : await deployToNetlifyPreview(projectSlug, staticFiles);
    const verified = await verifyLivePreviewUrl(result.deployUrl);
    return {
      deployUrl: result.deployUrl,
      deployVerified: verified,
      vercelDeploymentId: result.vercelDeploymentId,
      netlifyDeployId: result.netlifyDeployId,
    };
  } catch (err) {
    const msg = (err as Error).message;
    console.warn(`[githubDeploy] ${platform} deploy:`, msg);
    return { deployUrl: '', deployVerified: false, error: msg.slice(0, 240) };
  }
}

export async function deployPreviewFromSource(
  projectSlug: string,
  html: string,
  css: string,
  js: string,
  platform: 'vercel' | 'netlify' | 'both' = 'vercel',
  userId?: string
): Promise<{
  vercel?: PlatformDeployResult;
  netlify?: PlatformDeployResult;
  files: ProjectFile[];
}> {
  const files = landingDeployFilesFromOutput(html, css, js);
  const out: { vercel?: PlatformDeployResult; netlify?: PlatformDeployResult; files: ProjectFile[] } = {
    files,
  };

  if (platform === 'vercel' || platform === 'both') {
    if (userId) {
      const bundle = await deployToAllPlatforms(projectSlug, files, userId);
      out.vercel = bundle.vercel;
    } else {
      out.vercel = {
        deployUrl: '',
        deployVerified: false,
        error: 'Sign in and connect Vercel — deploys use your account only',
      };
    }
  }

  return out;
}

export async function pushBuildFromSource(
  userId: string,
  html: string,
  css: string,
  js: string,
  opts?: GitHubPushOptions
): Promise<GitHubPushResult> {
  const files = landingFilesFromOutput(html, css, js);
  return pushBuildToGitHub(userId, files, opts);
}

export function parseRepoName(input: string): { owner: string; repo: string } {
  const trimmed = input.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\/$/, '');
  const [owner, repo] = trimmed.split('/');
  if (!owner || !repo) throw new Error('Invalid GitHub repo name');
  return { owner, repo };
}

async function fetchRepoTextFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch?: string
): Promise<string | null> {
  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : '';
  const res = await ghFetch(token, `/repos/${owner}/${repo}/contents/${path}${ref}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (data.encoding !== 'base64' || !data.content) return null;
  return Buffer.from(data.content, 'base64').toString('utf8');
}

const UPDATE_HYDRATE_PATHS = [
  'index.html',
  'styles.css',
  'script.js',
  'package.json',
  'README.md',
  'app.json',
  'next.config.ts',
  'next.config.js',
  'tsconfig.json',
  'app/page.tsx',
  'app/layout.tsx',
  'app/globals.css',
  'app/index.tsx',
  'app/_layout.tsx',
  'app/about.tsx',
  'app/login/page.tsx',
  'app/api/health/route.ts',
  'app/api/chat/route.ts',
  'lib/supabase/client.ts',
  'lib/supabase/server.ts',
  '.env.example',
  'src/App.tsx',
  'src/main.tsx',
  'src/App.jsx',
  'src/main.jsx',
];

export async function fetchBuildFilesFromGitHub(
  userId: string,
  repoName: string,
  branch?: string
): Promise<ProjectFile[]> {
  const integration = await getIntegration(userId);
  if (!integration?.access_token) throw new Error('GitHub not connected');

  const { owner, repo } = parseRepoName(repoName);
  const token = integration.access_token;

  const out: ProjectFile[] = [];
  for (const path of UPDATE_HYDRATE_PATHS) {
    const text = await fetchRepoTextFile(token, owner, repo, path, branch);
    if (text != null) out.push({ path, content: text });
  }

  if (!out.length) {
    throw new Error('No buildable files found in GitHub repo');
  }

  return out;
}

const UNIVERSAL_REPOSITORY_FILE_LIMIT = 80;
const UNIVERSAL_REPOSITORY_TOTAL_BYTES = 1_500_000;
const UNIVERSAL_REPOSITORY_FILE_BYTES = 250_000;

/** Decode a Git blob without assuming a language, framework, or filename extension. */
export function decodeRepositoryTextBlob(content: string, encoding: string | undefined): string | null {
  if (encoding !== 'base64' || !content) return null;
  const bytes = Buffer.from(content, 'base64');
  if (bytes.includes(0)) return null;
  const text = bytes.toString('utf8');
  const replacements = [...text].filter((character) => character === '\uFFFD').length;
  return replacements > Math.max(2, Math.floor(text.length * 0.01)) ? null : text;
}

/**
 * Read a bounded, framework-agnostic text snapshot of an arbitrary repository.
 *
 * The older build hydrator intentionally targets common web manifest paths. That remains
 * useful for web preview/deploy flows, but it cannot be the source for universal execution:
 * a repository containing Python, Zig, Swift, a future language, or extensionless source
 * would otherwise look empty. Selection here uses only Git tree facts and binary detection.
 */
export async function fetchRepositoryTextFilesFromGitHub(
  userId: string,
  repoName: string,
  branch: string,
): Promise<ProjectFile[]> {
  const integration = await getIntegration(userId);
  if (!integration?.access_token) throw new Error('GitHub not connected');
  const { owner, repo } = parseRepoName(repoName);
  const token = integration.access_token;

  const branchRes = await ghFetch(token, `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`);
  if (!branchRes.ok) throw new Error(`GitHub branch lookup failed: ${branchRes.status}`);
  const branchData = (await branchRes.json()) as { commit?: { commit?: { tree?: { sha?: string } } } };
  const treeSha = branchData.commit?.commit?.tree?.sha;
  if (!treeSha) throw new Error('GitHub branch did not expose a source tree');

  const treeRes = await ghFetch(token, `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`);
  if (!treeRes.ok) throw new Error(`GitHub tree lookup failed: ${treeRes.status}`);
  const tree = (await treeRes.json()) as {
    truncated?: boolean;
    tree?: Array<{ path?: string; type?: string; sha?: string; size?: number }>;
  };
  if (tree.truncated) throw new Error('GitHub repository tree is too large for a complete safe snapshot');

  const candidates = (tree.tree ?? [])
    .filter((entry): entry is { path: string; type: 'blob'; sha: string; size?: number } =>
      entry.type === 'blob' && Boolean(entry.path) && Boolean(entry.sha) &&
      (entry.size ?? 0) <= UNIVERSAL_REPOSITORY_FILE_BYTES)
    .sort((a, b) => {
      const depth = a.path.split('/').length - b.path.split('/').length;
      return depth || (a.size ?? 0) - (b.size ?? 0) || a.path.localeCompare(b.path);
    })
    .slice(0, UNIVERSAL_REPOSITORY_FILE_LIMIT);

  const files: ProjectFile[] = [];
  let totalBytes = 0;
  for (let offset = 0; offset < candidates.length && totalBytes < UNIVERSAL_REPOSITORY_TOTAL_BYTES; offset += 8) {
    const batch = candidates.slice(offset, offset + 8);
    const decoded = await Promise.all(batch.map(async (entry) => {
      const response = await ghFetch(token, `/repos/${owner}/${repo}/git/blobs/${encodeURIComponent(entry.sha)}`);
      if (!response.ok) return null;
      const blob = (await response.json()) as { content?: string; encoding?: string };
      const content = decodeRepositoryTextBlob(blob.content ?? '', blob.encoding);
      return content === null ? null : { path: entry.path, content };
    }));
    for (const file of decoded) {
      if (!file) continue;
      const bytes = Buffer.byteLength(file.content, 'utf8');
      if (totalBytes + bytes > UNIVERSAL_REPOSITORY_TOTAL_BYTES) continue;
      files.push(file);
      totalBytes += bytes;
    }
  }
  if (!files.length) throw new Error('No readable text files found in GitHub repository');
  return files;
}

export async function fetchGitHubFilesByPaths(
  userId: string,
  repoName: string,
  paths: string[],
  branch?: string
): Promise<ProjectFile[]> {
  const integration = await getIntegration(userId);
  if (!integration?.access_token) throw new Error('GitHub not connected');

  const { owner, repo } = parseRepoName(repoName);
  const token = integration.access_token;
  const unique = [...new Set(paths.map((p) => p.replace(/^\//, '')))].slice(0, 40);

  const out: ProjectFile[] = [];
  for (const path of unique) {
    const text = await fetchRepoTextFile(token, owner, repo, path, branch);
    if (text != null) out.push({ path, content: text });
  }

  if (!out.length) {
    return fetchBuildFilesFromGitHub(userId, repoName, branch);
  }
  return out;
}

export { UPDATE_HYDRATE_PATHS };

export interface GitHubRepoAnalysis {
  repoName: string;
  defaultBranch: string;
  fileCount: number;
  topLevelEntries: string[];
  hasBuildFiles: boolean;
  languages: Record<string, number>;
  buildFiles: { html: string; css: string; js: string };
  treeSample: Array<{ path: string; size?: number }>;
  summary: string;
  techStack: string[];
  filesAnalyzed: number;
  totalLinesEstimate: number;
  report: string;
}

const REPOSITORY_BUILD_EVIDENCE = new Set(
  UPDATE_HYDRATE_PATHS.filter((path) => !['README.md', '.env.example'].includes(path)),
);

/** Report only build/configuration files that are actually present in the scanned tree. */
export function repositoryBuildEvidencePaths(paths: readonly string[]): string[] {
  return [...new Set(paths.filter((path) =>
    [...REPOSITORY_BUILD_EVIDENCE].some((candidate) => path === candidate || path.endsWith(`/${candidate}`))))].sort();
}

/** Conservative language/runtime hints derived from repository facts, never scaffold guesses. */
export function inferRepositoryTechStack(paths: readonly string[]): string[] {
  const normalized = paths.map((path) => path.toLowerCase());
  const stack: string[] = [];
  if (normalized.some((path) => path === 'package.json' || path.endsWith('/package.json'))) stack.push('Node.js / npm');
  if (normalized.some((path) => /next\.config/.test(path))) stack.push('Next.js');
  if (normalized.some((path) => /tailwind\.config/.test(path))) stack.push('Tailwind CSS');
  if (normalized.some((path) => path.includes('supabase') || path.includes('migrations'))) stack.push('Supabase');
  if (normalized.some((path) => path === 'index.html')) stack.push('Static HTML/CSS/JS');
  if (normalized.some((path) => /\.tsx?$/.test(path))) stack.push('TypeScript');
  if (normalized.some((path) => path.endsWith('.py') || path === 'pyproject.toml' || path === 'requirements.txt')) stack.push('Python');
  if (normalized.some((path) => path === 'go.mod' || path.endsWith('.go'))) stack.push('Go');
  if (normalized.some((path) => path === 'cargo.toml' || path.endsWith('.rs'))) stack.push('Rust');
  if (normalized.some((path) => path === 'package.swift' || path.endsWith('.swift'))) stack.push('Swift');
  return stack.length ? stack : ['No framework or runtime inferred from the sampled tree'];
}

export async function analyzeGitHubRepo(
  userId: string,
  repoName: string,
  preferredBranch?: string,
  opts?: { lite?: boolean }
): Promise<GitHubRepoAnalysis> {
  const lite = Boolean(opts?.lite);
  const integration = await getIntegration(userId);
  if (!integration?.access_token) throw new Error('GitHub not connected');

  const { owner, repo } = parseRepoName(repoName);
  const token = integration.access_token;

  const repoRes = await ghFetch(token, `/repos/${owner}/${repo}`);
  if (!repoRes.ok) throw new Error(`GitHub repo lookup failed: ${repoRes.status}`);
  const repoMeta = (await repoRes.json()) as { default_branch?: string; language?: string };
  const defaultBranch = repoMeta.default_branch ?? 'main';
  const scanBranch = preferredBranch?.trim() || defaultBranch;

  const cached = getCachedRepoAnalysis(userId, repoName, scanBranch);
  if (cached) {
    console.info(`[githubDeploy] Repo cache hit: ${repoName}@${scanBranch}`);
    return cached;
  }

  const langRes = await ghFetch(token, `/repos/${owner}/${repo}/languages`);
  const languages: Record<string, number> = langRes.ok ? ((await langRes.json()) as Record<string, number>) : {};

  let fileCount = 0;
  let treeSample: Array<{ path: string; size?: number }> = [];
  let topLevelEntries: string[] = [];

  let branchRes = await ghFetch(token, `/repos/${owner}/${repo}/branches/${encodeURIComponent(scanBranch)}`);
  if (!branchRes.ok && scanBranch !== defaultBranch) {
    branchRes = await ghFetch(token, `/repos/${owner}/${repo}/branches/${encodeURIComponent(defaultBranch)}`);
  }
  let treeSha: string | null = null;
  if (branchRes.ok) {
    const branchData = (await branchRes.json()) as { commit?: { commit?: { tree?: { sha?: string } } } };
    treeSha = branchData.commit?.commit?.tree?.sha ?? null;
  }

  if (treeSha) {
    const treeRes = await ghFetch(token, `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`);
    if (treeRes.ok) {
      const tree = (await treeRes.json()) as { tree?: Array<{ path: string; type: string; size?: number }> };
      const blobs = (tree.tree ?? []).filter((t) => t.type === 'blob');
      fileCount = blobs.length;
      treeSample = blobs.slice(0, HACKATHON_REPO_TREE_SAMPLE).map((f) => ({ path: f.path, size: f.size }));
      topLevelEntries = [
        ...new Set(blobs.map((f) => f.path.split('/')[0]).filter((e): e is string => Boolean(e))),
      ].slice(0, 24);
    }
  }

  let buildFiles = { html: '', css: '', js: '' };
  let hasBuildFiles = false;
  let buildEvidencePaths: string[] = [];
  if (!lite) {
    try {
      const files = await fetchBuildFilesFromGitHub(userId, repoName, scanBranch);
      buildEvidencePaths = repositoryBuildEvidencePaths(files.map((file) => file.path));
      hasBuildFiles = buildEvidencePaths.length > 0;
      buildFiles = {
        html: files.find((f) => f.path === 'index.html')?.content ?? '',
        css: files.find((f) => f.path === 'styles.css')?.content ?? '',
        js: files.find((f) => f.path === 'script.js')?.content ?? '',
      };
    } catch {
      /* repo may not have static build files yet */
    }
  } else {
    buildEvidencePaths = repositoryBuildEvidencePaths(treeSample.map((file) => file.path));
    hasBuildFiles = buildEvidencePaths.length > 0;
  }

  const paths = treeSample.map((f) => f.path);
  const techStack = inferRepositoryTechStack(paths);

  const criticalPaths = [
    'package.json',
    'next.config.js',
    'next.config.ts',
    'tailwind.config.js',
    'app/layout.tsx',
    'app/page.tsx',
    'index.html',
    'styles.css',
    'script.js',
    'README.md',
  ];
  const filesAnalyzed = criticalPaths.filter((cp) => paths.some((p) => p === cp || p.endsWith(`/${cp}`))).length
    + Math.min(paths.length, 40);
  const totalLinesEstimate = treeSample.reduce((sum, f) => sum + Math.ceil((f.size ?? 200) / 40), 0);

  const langList = Object.keys(languages).slice(0, 6).join(', ') || repoMeta.language || 'Unknown';
  const summary = hasBuildFiles
    ? `Repository ${repoName} (${scanBranch}): ${fileCount} files. Recognized build/configuration files: ${buildEvidencePaths.join(', ')}. Stack: ${techStack.join(', ')}. Languages: ${langList}.`
    : `Repository ${repoName} (${scanBranch}): ${fileCount} files. Stack: ${techStack.join(', ')}. Languages: ${langList}.`;

  const report = [
    `# Repository Analysis: ${repoName}`,
    `- Branch: ${scanBranch}`,
    `- Total files: ${fileCount}`,
    `- Files analyzed: ${filesAnalyzed}`,
    `- Estimated lines: ~${totalLinesEstimate.toLocaleString()}`,
    `- Tech stack: ${techStack.join(', ')}`,
    `- Languages: ${langList}`,
    hasBuildFiles
      ? `- Recognized build/configuration files present: ${buildEvidencePaths.join(', ')}`
      : '- Recognized build/configuration files present: none in the sampled tree',
  ].join('\n');

  const analysis: GitHubRepoAnalysis = {
    repoName,
    defaultBranch: scanBranch,
    fileCount,
    topLevelEntries,
    hasBuildFiles,
    languages,
    buildFiles,
    treeSample,
    summary,
    techStack,
    filesAnalyzed,
    totalLinesEstimate,
    report,
  };
  if (!lite) {
    setCachedRepoAnalysis(userId, repoName, scanBranch, analysis);
  }
  return analysis;
}

/** Redeploy live preview from code already on the exact GitHub branch. */
export async function redeployPreviewFromGitHub(
  userId: string,
  repoName: string,
  branch = 'main',
): Promise<{
  deployUrl: string;
  deployPlatform: 'vercel' | 'netlify' | 'none';
  deployVerified: boolean;
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
  files: ProjectFile[];
}> {
  const files = await fetchBuildFilesFromGitHub(userId, repoName, branch);
  const slug = repoName.split('/').pop()?.replace(/^xroga-/, '') ?? 'xroga-build';
  const preview = await deployToAllPlatforms(slug, files, userId);
  return {
    deployUrl: preview.deployUrl,
    deployPlatform: preview.deployPlatform,
    deployVerified: preview.deployVerified,
    vercelDeploymentId: preview.vercelDeploymentId,
    netlifyDeployId: preview.netlifyDeployId,
    files,
  };
}

export async function pushAndDeployLivePreview(
  userId: string,
  files: ProjectFile[],
  projectSlug: string,
  githubTarget?: { targetRepo?: string; targetBranch?: string; deletePaths?: string[] }
): Promise<DeployPipelineResult> {
  const github = await pushBuildToGitHub(userId, files, {
    slug: projectSlug,
    targetRepo: githubTarget?.targetRepo,
    targetBranch: githubTarget?.targetBranch,
    deletePaths: githubTarget?.deletePaths,
  });
  const preview = await deployToAllPlatforms(projectSlug, files, userId);
  return {
    github,
    deployUrl: preview.deployUrl,
    deployPlatform: preview.deployPlatform,
    deployVerified: preview.deployVerified,
    vercelDeploymentId: preview.vercelDeploymentId,
    netlifyDeployId: preview.netlifyDeployId,
    vercelPreviewUrl: preview.vercel?.deployUrl,
    netlifyPreviewUrl: preview.netlify?.deployUrl,
    vercel: preview.vercel,
    netlify: preview.netlify,
    deployError: preview.deployError,
  };
}

/** Roll back a branch tip to a previous commit SHA (legacy route; kept for old conversations). */
export async function rollbackRepoToCommit(
  userId: string,
  repoName: string,
  commitSha: string,
  branch = 'main',
): Promise<{ ok: boolean; branch: string; commitSha: string; htmlUrl: string }> {
  const integration = await getIntegration(userId);
  if (!integration?.access_token) throw new Error('GitHub not connected');
  if (!repoName.includes('/')) throw new Error('repoName must be owner/repo');
  if (!/^[0-9a-f]{7,40}$/i.test(commitSha)) throw new Error('Invalid commit SHA');

  const { owner, repo } = parseRepoName(repoName);
  const token = integration.access_token;
  const res = await ghFetch(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commitSha, force: true }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Rollback failed: ${res.status} ${err.slice(0, 200)}`);
  }
  invalidateRepoAnalysis(userId, repoName);
  return {
    ok: true,
    branch,
    commitSha,
    htmlUrl: `https://github.com/${owner}/${repo}/tree/${branch}`,
  };
}
