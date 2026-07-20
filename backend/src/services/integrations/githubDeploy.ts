import { getSupabaseAdmin } from '../../config/supabase.js';
import { deployStaticSite, deployStaticSiteWithToken, pollDeploymentReady } from '../../lib/vercel.js';
import { syncEnvVarsToVercelProject, type VercelEnvSyncResult } from '../../lib/vercelEnv.js';
import { deployToNetlify, pollNetlifyDeploy } from '../../lib/netlify.js';
import { verifyLivePreviewUrl } from '../../lib/deployVerify.js';
import { normalizeBuildFiles } from '../../lib/normalizeBuildSource.js';
import { buildInlinePreviewDocument } from '../../lib/landingPreview.js';
import { vercelStaticSiteJson } from '../../lib/vercelStaticConfig.js';
import { getSecret } from '../../config/envSecrets.js';
import { getGitHubToken, isGitHubConnected as checkGitHubConnected, getGitHubStorageMeta, setGithubDefaultRepo } from './githubAuth.js';
import { getVercelToken } from './vercelAuth.js';
import { resolveProviderEnvForDeploy } from './userProviderKeys.js';
import {
  getCachedRepoAnalysis,
  setCachedRepoAnalysis,
  invalidateRepoAnalysis,
} from '../../lib/repoAnalysisCache.js';
import { HACKATHON_GITHUB_BATCH_SIZE, HACKATHON_REPO_TREE_SAMPLE } from '../../config/modelRegistry.js';

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

async function ghFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
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

async function createRepo(token: string, name: string): Promise<{ fullName: string; htmlUrl: string; owner: string; repo: string }> {
  const res = await ghFetch(token, '/user/repos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      private: false,
      auto_init: true,
      description: 'Built with XROGA AI Swarm',
    }),
  });
  if (res.status === 422) {
    const username = await getGitHubUsername(token);
    return {
      fullName: `${username}/${name}`,
      htmlUrl: `https://github.com/${username}/${name}`,
      owner: username,
      repo: name,
    };
  }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub create repo failed: ${res.status} ${err}`);
  }
  const repo = (await res.json()) as { full_name: string; html_url: string };
  const [owner, repoName] = repo.full_name.split('/');
  return { fullName: repo.full_name, htmlUrl: repo.html_url, owner: owner!, repo: repoName! };
}

async function getBranchHeadSha(
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

async function isRepoEmpty(token: string, owner: string, repo: string): Promise<boolean> {
  const res = await ghFetch(token, `/repos/${owner}/${repo}`);
  if (!res.ok) return true;
  const data = (await res.json()) as { size?: number };
  return (data.size ?? 0) === 0;
}

async function getExistingFileSha(
  token: string,
  owner: string,
  repo: string,
  path: string,
  branch: string
): Promise<string | undefined> {
  const res = await ghFetch(
    token,
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`
  );
  if (!res.ok) return undefined;
  const data = (await res.json()) as { sha?: string };
  return data.sha;
}

/** Contents API — works on empty repos (Git Data API returns 409 on empty repos). */
async function pushFileViaContents(
  token: string,
  owner: string,
  repo: string,
  file: ProjectFile,
  message: string,
  branch: string,
  existingSha?: string
): Promise<void> {
  const body: Record<string, string> = {
    message,
    content: Buffer.from(file.content, 'utf8').toString('base64'),
    branch,
  };
  if (existingSha) body.sha = existingSha;

  const res = await ghFetch(
    token,
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(file.path)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub push ${file.path} failed: ${res.status} ${err.slice(0, 240)}`);
  }
}

async function deleteFileViaContents(
  token: string,
  owner: string,
  repo: string,
  path: string,
  message: string,
  branch: string,
): Promise<void> {
  const sha = await getExistingFileSha(token, owner, repo, path, branch);
  if (!sha) return;
  const res = await ghFetch(
    token,
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sha, branch }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub delete ${path} failed: ${res.status} ${err.slice(0, 200)}`);
  }
}

async function pushFilesViaContents(
  token: string,
  owner: string,
  repo: string,
  files: ProjectFile[],
  message: string,
  branch: string,
  deletePaths: string[] = [],
): Promise<string | undefined> {
  for (const file of files) {
    const sha = await getExistingFileSha(token, owner, repo, file.path, branch);
    await pushFileViaContents(token, owner, repo, file, message, branch, sha);
  }
  for (const path of [...new Set(deletePaths.map((p) => p.replace(/^\//, '')))].filter(Boolean)) {
    if (files.some((f) => f.path === path)) continue;
    await deleteFileViaContents(token, owner, repo, path, message, branch);
  }
  try {
    const { sha } = await getBranchHeadSha(token, owner, repo, branch);
    return sha ?? undefined;
  } catch {
    return undefined;
  }
}

async function pushFilesViaGitData(
  token: string,
  owner: string,
  repo: string,
  files: ProjectFile[],
  message: string,
  branch: string,
  deletePaths: string[] = []
): Promise<string> {
  const blobs = await Promise.all(
    files.map(async (f) => {
      const res = await ghFetch(token, `/repos/${owner}/${repo}/git/blobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: Buffer.from(f.content, 'utf8').toString('base64'),
          encoding: 'base64',
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`GitHub blob failed: ${res.status} ${err.slice(0, 120)}`);
      }
      const blob = (await res.json()) as { sha: string };
      return { path: f.path, sha: blob.sha as string | null };
    })
  );

  // GitHub Git Data API: sha null removes path from base_tree
  const deletes = [...new Set(deletePaths.map((p) => p.replace(/^\//, '')))]
    .filter((p) => p && !blobs.some((b) => b.path === p))
    .map((path) => ({ path, sha: null as string | null }));

  const { sha: parentSha, branch: resolvedBranch } = await getBranchHeadSha(token, owner, repo, branch);

  const treeRes = await ghFetch(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base_tree: parentSha ?? undefined,
      tree: [...blobs, ...deletes].map((b) => ({
        path: b.path,
        mode: '100644',
        type: 'blob',
        sha: b.sha,
      })),
    }),
  });
  if (!treeRes.ok) throw new Error(`GitHub tree failed: ${treeRes.status}`);
  const tree = (await treeRes.json()) as { sha: string };

  const commitRes = await ghFetch(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      tree: tree.sha,
      parents: parentSha ? [parentSha] : [],
      ...gitCommitAuthorFields(),
    }),
  });
  if (!commitRes.ok) throw new Error(`GitHub commit failed: ${commitRes.status}`);
  const commit = (await commitRes.json()) as { sha: string };

  if (parentSha) {
    const updateRes = await ghFetch(token, `/repos/${owner}/${repo}/git/refs/heads/${resolvedBranch}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commit.sha }),
    });
    if (!updateRes.ok) throw new Error(`GitHub ref update failed: ${updateRes.status}`);
  } else {
    const refRes = await ghFetch(token, `/repos/${owner}/${repo}/git/refs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${resolvedBranch}`, sha: commit.sha }),
    });
    if (!refRes.ok) throw new Error(`GitHub ref create failed: ${refRes.status}`);
  }
  return commit.sha;
}

async function pushFilesToRepo(
  token: string,
  owner: string,
  repo: string,
  files: ProjectFile[],
  message: string,
  branch = 'main',
  deletePaths: string[] = []
): Promise<string | undefined> {
  if (files.length > HACKATHON_GITHUB_BATCH_SIZE) {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const batches = Math.ceil(files.length / HACKATHON_GITHUB_BATCH_SIZE);
    let lastSha: string | undefined;
    for (let i = 0; i < files.length; i += HACKATHON_GITHUB_BATCH_SIZE) {
      const batch = files.slice(i, i + HACKATHON_GITHUB_BATCH_SIZE);
      const n = Math.floor(i / HACKATHON_GITHUB_BATCH_SIZE) + 1;
      // Apply deletes only on the final batch so base_tree stays coherent
      const dels = i + HACKATHON_GITHUB_BATCH_SIZE >= files.length ? deletePaths : [];
      lastSha = await pushFilesToRepoSingle(
        token,
        owner,
        repo,
        batch,
        buildBrandedCommitMessage(`XROGA hackathon batch ${n}/${batches} — ${stamp}`, null),
        branch,
        dels
      );
    }
    return lastSha;
  }
  return pushFilesToRepoSingle(token, owner, repo, files, message, branch, deletePaths);
}

async function pushFilesToRepoSingle(
  token: string,
  owner: string,
  repo: string,
  files: ProjectFile[],
  message: string,
  branch = 'main',
  deletePaths: string[] = []
): Promise<string | undefined> {
  const empty = await isRepoEmpty(token, owner, repo);

  if (empty) {
    // Empty repo: push files; deletes are no-ops
    return pushFilesViaContents(token, owner, repo, files, message, branch, deletePaths);
  }

  try {
    return await pushFilesViaGitData(token, owner, repo, files, message, branch, deletePaths);
  } catch (err) {
    const msg = (err as Error).message;
    if (/409|empty/i.test(msg)) {
      return pushFilesViaContents(token, owner, repo, files, message, branch, deletePaths);
    }
    // Fall back to Contents API (supports delete) when Git Data fails
    console.warn('[githubDeploy] Git Data push failed, Contents API fallback:', msg.slice(0, 160));
    return pushFilesViaContents(token, owner, repo, files, message, branch, deletePaths);
  }
}

export interface GitHubPushOptions {
  slug?: string;
  targetRepo?: string;
  targetBranch?: string;
  /** Paths to remove from the target branch (Git Data API sha:null). */
  deletePaths?: string[];
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
    const branch = opts.targetBranch ?? 'main';
    const htmlUrl = `https://github.com/${owner}/${repo}`;
    const commitSha = await pushFilesToRepo(
      token,
      owner!,
      repo!,
      files,
      buildBrandedCommitMessage(
        `XROGA build update — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
        coAuthor
      ),
      branch,
      opts.deletePaths ?? []
    );
    invalidateRepoAnalysis(userId, selectedRepo);
    // Keep sticky default on updates too
    await setGithubDefaultRepo(userId, selectedRepo).catch(() => undefined);
    return {
      repoName: `${owner}/${repo}`,
      repoUrl: htmlUrl,
      htmlUrl,
      commitSha,
      branch,
    };
  }

  const repoName = opts.slug ?? `xroga-build-${Date.now()}`;

  const created = await createRepo(token, repoName);
  const owner = created.owner;
  const repo = created.repo;
  const htmlUrl = created.htmlUrl;
  const commitSha = await pushFilesToRepo(
    token,
    owner,
    repo,
    files,
    buildBrandedCommitMessage('Initial XROGA build', coAuthor)
  );

  const fullName = `${owner}/${repo}`;
  // Bind this as the sticky update target for later prompts (no re-pick needed)
  await setGithubDefaultRepo(userId, fullName).catch((err) => {
    console.warn('[githubDeploy] default_repo persist:', (err as Error).message);
  });

  return {
    repoName: fullName,
    repoUrl: `https://github.com/${owner}/${repo}`,
    htmlUrl,
    commitSha,
    branch: 'main',
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

/** Files uploaded to Vercel — merged index.html + vercel.json (matches sandbox preview). */
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

/** Chrome / Electron: deploy only the story preview page — not a fake Next build. */
function isPreviewOnlyProduct(files: ProjectFile[]): boolean {
  if (files.some((f) => f.path === 'manifest.json')) return true;
  const pkg = files.find((f) => f.path === 'package.json')?.content ?? '';
  return /"electron"/i.test(pkg) && !/"next"/i.test(pkg);
}

/**
 * Prepare files for Vercel file-upload deploy.
 * Framework projects keep the full source tree (no GitHub↔Vercel link required).
 * Classic static sites still merge into a single preview HTML.
 */
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
    // Cap payload — skip lockfiles / binaries; keep README
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
  // Expo / RN / Electron / Chrome: preview page only (or null framework)
  return null;
}

async function deployToVercel(projectSlug: string, staticFiles: ProjectFile[]): Promise<PreviewDeployResult> {
  const vercelFiles = staticFiles.map((f) => ({ file: f.path, data: f.content }));
  const deployment = await deployStaticSite(projectSlug, vercelFiles);
  const deployUrl = await pollDeploymentReady(deployment.deploymentId, deployment.deployUrl);
  return {
    deployUrl,
    platform: 'vercel',
    vercelDeploymentId: deployment.deploymentId,
  };
}

export async function syncUserVaultToVercel(
  userId: string,
  projectSlug: string,
): Promise<VercelEnvSyncResult | null> {
  const token = await getVercelToken(userId);
  if (!token) return null;
  const env = await resolveProviderEnvForDeploy(userId);
  if (!Object.keys(env).length) {
    return { ok: true, projectName: projectSlug, upserted: [], skipped: [] };
  }
  // Use the user's account (no platform VERCEL_TEAM_ID) so env lands on their project
  return syncEnvVarsToVercelProject({
    token,
    projectName: projectSlug,
    env,
    teamId: undefined,
  });
}

async function deployToVercelWithUserToken(
  userId: string,
  projectSlug: string,
  staticFiles: ProjectFile[]
): Promise<PreviewDeployResult & { envSync?: VercelEnvSyncResult }> {
  const token = await getVercelToken(userId);
  if (!token) throw new Error('Vercel not connected — user must authorize under Integrations');

  // Sync encrypted vault secrets → Vercel env before deploy (never into GitHub files)
  let envSync: VercelEnvSyncResult | undefined;
  try {
    envSync = (await syncUserVaultToVercel(userId, projectSlug)) ?? undefined;
    if (envSync && !envSync.ok && envSync.error) {
      console.warn('[vercel] env sync partial/failed:', envSync.error);
    } else if (envSync?.upserted?.length) {
      console.log(`[vercel] synced ${envSync.upserted.length} env var(s) to project ${projectSlug}`);
    }
  } catch (err) {
    console.warn('[vercel] env sync skipped:', (err as Error).message);
  }

  const vercelFiles = staticFiles.map((f) => ({ file: f.path, data: f.content }));
  const framework = frameworkForDeploy(staticFiles);
  const deployment = await deployStaticSiteWithToken(projectSlug, vercelFiles, token, {
    framework,
    sourceDeploy: Boolean(framework),
    teamId: null,
  });
  const deployUrl = await pollDeploymentReady(
    deployment.deploymentId,
    deployment.deployUrl,
    token,
    framework ? 240_000 : 180_000,
    null,
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

/** Try Vercel first, then Netlify; verify URL before returning. Retries alternate platform on failure. */
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
  // If Netlify was first to fail verify, retry Vercel explicitly when both keys exist
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
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
  error?: string;
}

/** Deploy to user's Vercel account when connected; otherwise skip platform deploy. */
export async function deployToAllPlatforms(
  projectSlug: string,
  files: ProjectFile[],
  userId?: string
): Promise<{
  vercel?: PlatformDeployResult;
  netlify?: PlatformDeployResult;
  deployUrl: string;
  deployPlatform: 'vercel' | 'netlify' | 'none';
  deployVerified: boolean;
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
  deployError?: string;
}> {
  const staticFiles = hostingDeployFiles(files);
  const errors: string[] = [];

  let vercel: PlatformDeployResult | undefined;
  let netlify: PlatformDeployResult | undefined;

  const userVercelToken = userId ? await getVercelToken(userId) : null;

  if (userVercelToken && userId) {
    try {
      const result = await deployToVercelWithUserToken(userId, projectSlug, staticFiles);
      const verified = await verifyLivePreviewUrl(result.deployUrl);
      vercel = {
        deployUrl: result.deployUrl,
        deployVerified: verified,
        vercelDeploymentId: result.vercelDeploymentId,
      };
      if (!verified) errors.push('Vercel URL failed verification');
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`Vercel: ${msg.slice(0, 120)}`);
      vercel = { deployUrl: '', deployVerified: false, error: msg.slice(0, 240) };
    }
  } else {
    errors.push('Vercel: Connect your Vercel account under Integrations to deploy live on your domain');
    vercel = {
      deployUrl: '',
      deployVerified: false,
      error: 'Connect Vercel under Integrations — deploys go to your account, not Xroga servers',
    };
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
  };
}

/** Deploy generated code directly to one platform (no GitHub required). */
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

/** Deploy from inline html/css/js — user's Vercel account only when connected. */
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

/** Push build files to GitHub, then optionally deploy. */
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

function parseRepoName(input: string): { owner: string; repo: string } {
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

/** Pull build files from an existing GitHub repo (no rebuild required). */
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

/** Fetch only specific paths for incremental updates (no full-repo read). */
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

/** Full repository scan before builds — tree, languages, and core site files. */
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
  // Lite analyze (repo picker / UI): skip downloading full HTML/CSS/JS — massive speed win
  if (!lite) {
    try {
      const files = await fetchBuildFilesFromGitHub(userId, repoName, scanBranch);
      hasBuildFiles = true;
      buildFiles = {
        html: files.find((f) => f.path === 'index.html')?.content ?? '',
        css: files.find((f) => f.path === 'styles.css')?.content ?? '',
        js: files.find((f) => f.path === 'script.js')?.content ?? '',
      };
    } catch {
      /* repo may not have static build files yet */
    }
  } else {
    hasBuildFiles = treeSample.some(
      (f) => f.path === 'index.html' || f.path.endsWith('/index.html') || f.path === 'package.json'
    );
  }

  const paths = treeSample.map((f) => f.path);
  const techStack: string[] = [];
  if (paths.some((p) => p === 'package.json' || p.endsWith('/package.json'))) techStack.push('Node.js / npm');
  if (paths.some((p) => /next\.config/i.test(p))) techStack.push('Next.js');
  if (paths.some((p) => /tailwind\.config/i.test(p))) techStack.push('Tailwind CSS');
  if (paths.some((p) => p.includes('supabase') || p.includes('migrations'))) techStack.push('Supabase');
  if (paths.some((p) => p === 'index.html')) techStack.push('Static HTML/CSS/JS');
  if (paths.some((p) => /\.tsx?$/.test(p))) techStack.push('TypeScript');
  if (techStack.length === 0) techStack.push('Fresh project (scaffold on build)');

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
    ? `Repository ${repoName} (${scanBranch}): ${fileCount} files. Static site detected. Stack: ${techStack.join(', ')}. Languages: ${langList}.`
    : `Repository ${repoName} (${scanBranch}): ${fileCount} files. Stack: ${techStack.join(', ')}. Languages: ${langList}.`;

  const report = [
    `# Repository Analysis: ${repoName}`,
    `- Branch: ${scanBranch}`,
    `- Total files: ${fileCount}`,
    `- Files analyzed: ${filesAnalyzed}`,
    `- Estimated lines: ~${totalLinesEstimate.toLocaleString()}`,
    `- Tech stack: ${techStack.join(', ')}`,
    `- Languages: ${langList}`,
    hasBuildFiles ? '- Build files: index.html, styles.css, script.js ✓' : '- Build files: none yet (fresh build)',
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
  // Never cache lite scans (empty buildFiles) — would poison full build analysis
  if (!lite) {
    setCachedRepoAnalysis(userId, repoName, scanBranch, analysis);
  }
  return analysis;
}

/** Redeploy live preview from code already on GitHub — Vercel preferred, Netlify fallback. */
export async function redeployPreviewFromGitHub(
  userId: string,
  repoName: string
): Promise<{
  deployUrl: string;
  deployPlatform: 'vercel' | 'netlify' | 'none';
  deployVerified: boolean;
  vercelDeploymentId?: string;
  netlifyDeployId?: string;
  files: ProjectFile[];
}> {
  const files = await fetchBuildFilesFromGitHub(userId, repoName);
  const slug = repoName.split('/').pop()?.replace(/^xroga-/, '') ?? 'xroga-build';
  const preview = await deployStaticPreview(slug, files);
  return {
    deployUrl: preview.deployUrl,
    deployPlatform: preview.platform,
    deployVerified: preview.deployVerified,
    vercelDeploymentId: preview.vercelDeploymentId,
    netlifyDeployId: preview.netlifyDeployId,
    files,
  };
}

/** Push to GitHub then deploy to Vercel (preferred) or Netlify — only returns URL when verified live. */
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

/** Roll back a branch tip to a previous commit SHA (requires GitHub connected). */
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
